from __future__ import annotations

import base64
import io
import json
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import wave
from dataclasses import dataclass
from typing import Any, Optional

import cv2
import numpy as np

from cv_signals import CVSignal

DEFAULT_SYSTEM_PROMPT = (
    "You are RescueSight voice guidance. Assistive only, non-diagnostic, CPR-focused. "
    "Give short, direct instructions. If scene confidence is low, ask for confirmation. "
    "Never claim medical certainty. Keep each response under 35 words."
)

DATA_URL_PATTERN = re.compile(r"^data:(?P<mime>[^;,]+);base64,(?P<data>.+)$", re.IGNORECASE)


def _truncate_text(value: str, max_len: int) -> str:
    cleaned = " ".join(value.split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max(0, max_len - 3)].rstrip() + "..."


def encode_frame_data_url(
    frame_bgr: np.ndarray,
    max_width: int = 640,
    jpeg_quality: int = 72,
) -> Optional[str]:
    frame_h, frame_w = frame_bgr.shape[:2]
    resized = frame_bgr
    if frame_w > max_width:
        target_h = max(1, int(frame_h * (max_width / frame_w)))
        resized = cv2.resize(frame_bgr, (max_width, target_h), interpolation=cv2.INTER_AREA)
    ok, encoded = cv2.imencode(
        ".jpg",
        resized,
        [int(cv2.IMWRITE_JPEG_QUALITY), int(max(45, min(95, jpeg_quality)))],
    )
    if not ok:
        return None
    encoded_b64 = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded_b64}"


def build_scene_summary(
    signal: CVSignal,
    *,
    person_down_status: str,
    person_down_confidence: float,
    ready_for_compressions: bool,
    target_locked: bool,
) -> str:
    return (
        f"person_down={person_down_status} ({person_down_confidence:.2f}); "
        f"posture={signal.bodyPosture} ({signal.postureConfidence:.2f}); "
        f"eyes_closed={signal.eyesClosedConfidence:.2f}; "
        f"hand_placement={signal.handPlacementStatus} ({signal.placementConfidence:.2f}); "
        f"bpm={signal.compressionRateBpm}; rhythm={signal.compressionRhythmQuality}; "
        f"visibility={signal.visibility}; "
        f"compression_ready={'yes' if ready_for_compressions else 'no'}; "
        f"target_lock={'locked' if target_locked else 'tracking'}."
    )


def parse_response_text(payload: dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    output = payload.get("output")
    if not isinstance(output, list):
        return ""

    extracted: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") in {"output_text", "text"}:
                text = block.get("text")
                if isinstance(text, str) and text.strip():
                    extracted.append(text.strip())
    return " ".join(extracted).strip()


def parse_gemini_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return ""

    extracted: list[str] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content")
        if not isinstance(content, dict):
            continue
        parts = content.get("parts")
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                extracted.append(text.strip())
    return " ".join(extracted).strip()


def data_url_to_inline_part(data_url: str | None) -> Optional[dict[str, Any]]:
    if not data_url:
        return None

    match = DATA_URL_PATTERN.match(data_url.strip())
    if not match:
        return None

    return {
        "inline_data": {
            "mime_type": match.group("mime"),
            "data": match.group("data"),
        }
    }


@dataclass(slots=True)
class VoiceAgentConfig:
    enabled: bool = True
    provider: str = "gemini"
    api_key: str = ""
    api_base_url: str = "https://generativelanguage.googleapis.com"
    vision_model: str = "gemini-flash-latest"
    transcription_model: str = "gemini-flash-latest"
    proactive_interval_sec: float = 8.0
    scene_change_cooldown_sec: float = 3.0
    mic_sample_seconds: float = 2.4
    mic_sample_rate_hz: int = 16_000
    mic_rms_threshold: float = 180.0
    request_timeout_sec: float = 25.0
    max_output_tokens: int = 140
    temperature: float = 0.2
    frame_sample_interval_sec: float = 1.0
    frame_max_width: int = 640
    frame_jpeg_quality: int = 72
    system_prompt: str = DEFAULT_SYSTEM_PROMPT
    low_latency_mode: bool = True


@dataclass(slots=True)
class _SceneState:
    summary: str = "No scene context yet."
    fingerprint: str = "none"
    frame_data_url: Optional[str] = None
    updated_ms: int = 0


class WebcamVoiceAgent:
    def __init__(self, config: VoiceAgentConfig) -> None:
        self._config = config
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._scene = _SceneState()
        self._last_frame_sample_ms = 0
        self._last_spoken_fingerprint = "none"
        self._last_spoken_ts = 0.0
        self._status = "disabled"
        self._last_user_text = ""
        self._last_agent_text = ""
        self._last_error = ""
        self._history: list[tuple[str, str]] = []
        self._say_process: Optional[subprocess.Popen[bytes]] = None
        self._mic_unavailable = False

        if config.enabled:
            self._status = "ready"

    def _provider(self) -> str:
        provider = self._config.provider.strip().lower()
        if provider in {"openai", "gemini"}:
            return provider
        return "gemini"

    def start(self) -> None:
        if not self._config.enabled:
            with self._lock:
                self._status = "disabled (--disable-voice-agent)"
            return
        if not self._config.api_key.strip():
            provider = self._provider()
            env_key = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
            with self._lock:
                self._status = f"disabled ({env_key} missing)"
            return
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name="webcam-voice-agent", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=3.0)
            self._thread = None
        if self._say_process is not None and self._say_process.poll() is None:
            self._say_process.terminate()
        self._say_process = None

    def update_scene(
        self,
        frame_bgr: np.ndarray,
        signal: CVSignal,
        *,
        person_down_status: str,
        person_down_confidence: float,
        ready_for_compressions: bool,
        target_locked: bool,
    ) -> None:
        summary = build_scene_summary(
            signal,
            person_down_status=person_down_status,
            person_down_confidence=person_down_confidence,
            ready_for_compressions=ready_for_compressions,
            target_locked=target_locked,
        )
        fingerprint = (
            f"{person_down_status}:{round(person_down_confidence, 1)}:"
            f"{signal.handPlacementStatus}:{signal.compressionRhythmQuality}:"
            f"{signal.visibility}:{signal.bodyPosture}:{int(ready_for_compressions)}:{int(target_locked)}"
        )
        now_ms = int(time.time() * 1000)
        frame_data_url: Optional[str] = None
        sample_every_ms = max(300, int(self._config.frame_sample_interval_sec * 1000))
        if now_ms - self._last_frame_sample_ms >= sample_every_ms:
            frame_data_url = encode_frame_data_url(
                frame_bgr,
                max_width=self._config.frame_max_width,
                jpeg_quality=self._config.frame_jpeg_quality,
            )
            self._last_frame_sample_ms = now_ms

        with self._lock:
            self._scene.summary = summary
            self._scene.fingerprint = fingerprint
            self._scene.updated_ms = now_ms
            if frame_data_url is not None:
                self._scene.frame_data_url = frame_data_url

    def overlay_lines(self) -> list[str]:
        with self._lock:
            status = self._status
            user_text = self._last_user_text
            agent_text = self._last_agent_text
            error_text = self._last_error

        lines = [f"voice_agent: {_truncate_text(status, 78)}"]
        if user_text:
            lines.append(f"heard: {_truncate_text(user_text, 78)}")
        if agent_text:
            lines.append(f"spoke: {_truncate_text(agent_text, 78)}")
        elif error_text:
            lines.append(f"voice_error: {_truncate_text(error_text, 78)}")
        return lines

    def _run_loop(self) -> None:
        provider = self._provider()
        with self._lock:
            self._status = f"listening ({provider})"
        next_proactive_at = time.monotonic() + self._config.proactive_interval_sec

        while not self._stop_event.is_set():
            if provider == "gemini" and self._config.low_latency_mode:
                now = time.monotonic()
                reply = self._capture_and_reply_low_latency()
                proactive_due = now >= next_proactive_at

                if reply:
                    next_proactive_at = now + self._config.proactive_interval_sec
                    self._speak(reply)
                    with self._lock:
                        self._last_agent_text = reply
                        self._status = f"listening ({provider}, low-latency)"
                elif proactive_due and self._should_send_proactive(now):
                    proactive_reply = self._generate_multimodal_reply(transcript="", proactive=True)
                    next_proactive_at = now + self._config.proactive_interval_sec
                    if proactive_reply:
                        self._speak(proactive_reply)
                        with self._lock:
                            self._last_agent_text = proactive_reply
                            self._status = f"listening ({provider}, low-latency)"
                    else:
                        with self._lock:
                            self._status = f"listening ({provider}, no proactive update)"
                time.sleep(0.06)
                continue

            transcript = self._capture_transcript_once()
            now = time.monotonic()
            proactive_due = now >= next_proactive_at

            should_respond = False
            proactive = False
            if transcript:
                should_respond = True
            elif proactive_due and self._should_send_proactive(now):
                should_respond = True
                proactive = True

            if should_respond:
                reply = self._generate_multimodal_reply(transcript=transcript, proactive=proactive)
                next_proactive_at = now + self._config.proactive_interval_sec
                if reply:
                    self._speak(reply)
                    with self._lock:
                        self._last_agent_text = reply
                        self._status = f"listening ({provider})"
                elif proactive:
                    with self._lock:
                        self._status = f"listening ({provider}, no proactive update)"

            time.sleep(0.1)

    def _capture_and_reply_low_latency(self) -> str:
        wav_bytes = self._record_audio_wav_once()
        if wav_bytes is None:
            return ""
        with self._lock:
            self._last_user_text = "voice detected (low-latency)"
        return self._generate_multimodal_reply_gemini(
            transcript="",
            proactive=False,
            audio_wav_bytes=wav_bytes,
        )

    def _should_send_proactive(self, now: float) -> bool:
        with self._lock:
            fingerprint = self._scene.fingerprint
        if now - self._last_spoken_ts >= self._config.proactive_interval_sec:
            return True
        if (
            fingerprint != self._last_spoken_fingerprint
            and now - self._last_spoken_ts >= self._config.scene_change_cooldown_sec
        ):
            return True
        return False

    def _capture_transcript_once(self) -> str:
        wav_bytes = self._record_audio_wav_once()
        if wav_bytes is None:
            return ""
        transcript = self._transcribe_wav_bytes(wav_bytes)
        if transcript:
            with self._lock:
                self._last_user_text = transcript
        return transcript

    def _record_audio_wav_once(self) -> Optional[bytes]:
        if self._mic_unavailable:
            return None
        try:
            import sounddevice as sd  # type: ignore
        except Exception:
            self._mic_unavailable = True
            with self._lock:
                self._status = "running (mic unavailable: install sounddevice)"
                self._last_error = "sounddevice import failed"
            return None

        sample_count = max(1, int(self._config.mic_sample_seconds * self._config.mic_sample_rate_hz))
        try:
            audio = sd.rec(
                sample_count,
                samplerate=self._config.mic_sample_rate_hz,
                channels=1,
                dtype="int16",
            )
            sd.wait()
        except Exception as exc:
            with self._lock:
                self._status = "running (mic capture error)"
                self._last_error = str(exc)
            return None

        mono = np.asarray(audio).reshape(-1).astype(np.int16)
        if mono.size == 0:
            return None

        rms = float(np.sqrt(np.mean(np.square(mono.astype(np.float32)))))
        if rms < self._config.mic_rms_threshold:
            return None

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(self._config.mic_sample_rate_hz)
            wav.writeframes(mono.tobytes())
        return buffer.getvalue()

    def _transcribe_wav_bytes(self, wav_bytes: bytes) -> str:
        if self._provider() == "gemini":
            return self._transcribe_wav_bytes_gemini(wav_bytes)
        return self._transcribe_wav_bytes_openai(wav_bytes)

    def _transcribe_wav_bytes_openai(self, wav_bytes: bytes) -> str:
        fields = {
            "model": self._config.transcription_model,
            "response_format": "json",
        }
        files = [("file", "speech.wav", "audio/wav", wav_bytes)]
        try:
            body = self._post_multipart("/v1/audio/transcriptions", fields, files)
        except Exception as exc:
            with self._lock:
                self._status = "running (transcription error)"
                self._last_error = str(exc)
            return ""

        text = body.get("text")
        if not isinstance(text, str):
            return ""
        return _truncate_text(text, 220)

    def _transcribe_wav_bytes_gemini(self, wav_bytes: bytes) -> str:
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "Transcribe this short bystander speech clip. "
                                "Return plain transcript text only. If no speech is present, return an empty string."
                            )
                        },
                        {
                            "inline_data": {
                                "mime_type": "audio/wav",
                                "data": base64.b64encode(wav_bytes).decode("ascii"),
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.0,
                "maxOutputTokens": 120,
            },
        }
        try:
            body = self._post_gemini_generate_content(self._config.transcription_model, payload)
        except Exception as exc:
            with self._lock:
                self._status = "running (gemini transcription error)"
                self._last_error = str(exc)
            return ""
        return _truncate_text(parse_gemini_text(body), 220)

    def _generate_multimodal_reply(self, *, transcript: str, proactive: bool) -> str:
        if self._provider() == "gemini":
            return self._generate_multimodal_reply_gemini(transcript=transcript, proactive=proactive)
        return self._generate_multimodal_reply_openai(transcript=transcript, proactive=proactive)

    def _generate_multimodal_reply_openai(self, *, transcript: str, proactive: bool) -> str:
        with self._lock:
            scene = _SceneState(
                summary=self._scene.summary,
                fingerprint=self._scene.fingerprint,
                frame_data_url=self._scene.frame_data_url,
                updated_ms=self._scene.updated_ms,
            )
            history = list(self._history[-4:])

        if scene.frame_data_url is None:
            return ""

        history_lines: list[str] = []
        for role, text in history:
            role_label = "USER" if role == "user" else "ASSISTANT"
            history_lines.append(f"{role_label}: {text}")

        if proactive:
            user_instruction = (
                "No new spoken question. Give one proactive observation/instruction based on the scene."
            )
        else:
            user_instruction = (
                "Respond to the bystander statement and scene together. "
                "Ask one clarifying question only if needed."
            )

        prompt_lines = [
            f"SCENE SUMMARY: {scene.summary}",
            (
                f"BYSTANDER TRANSCRIPT: {transcript}"
                if transcript
                else "BYSTANDER TRANSCRIPT: (none detected this cycle)"
            ),
            f"RECENT DIALOGUE: {' | '.join(history_lines) if history_lines else 'none'}",
            user_instruction,
        ]
        prompt_text = "\n".join(prompt_lines)

        payload = {
            "model": self._config.vision_model,
            "temperature": self._config.temperature,
            "max_output_tokens": self._config.max_output_tokens,
            "input": [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": self._config.system_prompt}],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt_text},
                        {"type": "input_image", "image_url": scene.frame_data_url},
                    ],
                },
            ],
        }

        try:
            body = self._post_json("/v1/responses", payload)
        except Exception as exc:
            with self._lock:
                self._status = "running (response error)"
                self._last_error = str(exc)
            return ""

        reply = _truncate_text(parse_response_text(body), 240)
        if not reply:
            return ""

        with self._lock:
            if transcript:
                self._history.append(("user", transcript))
            self._history.append(("assistant", reply))
            self._last_spoken_fingerprint = scene.fingerprint
            self._last_spoken_ts = time.monotonic()
        return reply

    def _generate_multimodal_reply_gemini(
        self,
        *,
        transcript: str,
        proactive: bool,
        audio_wav_bytes: Optional[bytes] = None,
    ) -> str:
        with self._lock:
            scene = _SceneState(
                summary=self._scene.summary,
                fingerprint=self._scene.fingerprint,
                frame_data_url=self._scene.frame_data_url,
                updated_ms=self._scene.updated_ms,
            )
            history = list(self._history[-4:])

        inline_image = data_url_to_inline_part(scene.frame_data_url)
        if inline_image is None:
            return ""

        history_lines: list[str] = []
        for role, text in history:
            role_label = "USER" if role == "user" else "ASSISTANT"
            history_lines.append(f"{role_label}: {text}")

        if proactive:
            user_instruction = (
                "No new spoken question. Give one proactive observation/instruction based on the scene."
            )
        elif audio_wav_bytes is not None:
            user_instruction = (
                "A short bystander audio clip is attached. First infer the user intent from audio, "
                "then respond using both audio intent and scene."
            )
        else:
            user_instruction = (
                "Respond to the bystander statement and scene together. "
                "Ask one clarifying question only if needed."
            )

        prompt_lines = [
            f"SCENE SUMMARY: {scene.summary}",
            (
                f"BYSTANDER TRANSCRIPT: {transcript}"
                if transcript
                else "BYSTANDER TRANSCRIPT: (none detected this cycle)"
            ),
            f"RECENT DIALOGUE: {' | '.join(history_lines) if history_lines else 'none'}",
            user_instruction,
        ]
        user_parts: list[dict[str, Any]] = [{"text": "\n".join(prompt_lines)}]
        if audio_wav_bytes is not None:
            user_parts.append(
                {
                    "inline_data": {
                        "mime_type": "audio/wav",
                        "data": base64.b64encode(audio_wav_bytes).decode("ascii"),
                    }
                }
            )
        user_parts.append(inline_image)

        payload = {
            "system_instruction": {
                "parts": [{"text": self._config.system_prompt}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": user_parts,
                }
            ],
            "generationConfig": {
                "temperature": self._config.temperature,
                "maxOutputTokens": self._config.max_output_tokens,
            },
        }
        try:
            body = self._post_gemini_generate_content(self._config.vision_model, payload)
        except Exception as exc:
            with self._lock:
                self._status = "running (gemini response error)"
                self._last_error = str(exc)
            return ""

        reply = _truncate_text(parse_gemini_text(body), 240)
        if not reply:
            return ""

        with self._lock:
            if transcript:
                self._history.append(("user", transcript))
            self._history.append(("assistant", reply))
            self._last_spoken_fingerprint = scene.fingerprint
            self._last_spoken_ts = time.monotonic()
        return reply

    def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            self._openai_url(path),
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._config.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._config.request_timeout_sec) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8")
            raise RuntimeError(f"openai http {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"openai offline: {exc.reason}") from exc

        parsed = json.loads(raw) if raw else {}
        if isinstance(parsed, dict):
            return parsed
        raise RuntimeError("openai response was not an object")

    def _post_gemini_generate_content(self, model: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not model.strip():
            raise RuntimeError("gemini model is empty")
        endpoint = (
            f"{self._config.api_base_url.rstrip('/')}/v1beta/models/"
            f"{urllib.parse.quote(model.strip(), safe='')}:generateContent"
        )
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self._config.api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._config.request_timeout_sec) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8")
            raise RuntimeError(f"gemini http {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"gemini offline: {exc.reason}") from exc

        parsed = json.loads(raw) if raw else {}
        if isinstance(parsed, dict):
            return parsed
        raise RuntimeError("gemini response was not an object")

    def _post_multipart(
        self,
        path: str,
        fields: dict[str, str],
        files: list[tuple[str, str, str, bytes]],
    ) -> dict[str, Any]:
        boundary = f"rescuesight-{uuid.uuid4().hex}"
        body_chunks: list[bytes] = []

        for key, value in fields.items():
            body_chunks.append(f"--{boundary}\r\n".encode("utf-8"))
            body_chunks.append(
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode("utf-8")
            )

        for field_name, filename, content_type, file_bytes in files:
            body_chunks.append(f"--{boundary}\r\n".encode("utf-8"))
            body_chunks.append(
                (
                    f'Content-Disposition: form-data; name="{field_name}"; '
                    f'filename="{filename}"\r\n'
                ).encode("utf-8")
            )
            body_chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
            body_chunks.append(file_bytes)
            body_chunks.append(b"\r\n")

        body_chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(body_chunks)

        request = urllib.request.Request(
            self._openai_url(path),
            data=body,
            headers={
                "Authorization": f"Bearer {self._config.api_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._config.request_timeout_sec) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8")
            raise RuntimeError(f"openai http {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"openai offline: {exc.reason}") from exc

        parsed = json.loads(raw) if raw else {}
        if isinstance(parsed, dict):
            return parsed
        raise RuntimeError("openai transcription response was not an object")

    def _openai_url(self, path: str) -> str:
        return f"{self._config.api_base_url.rstrip('/')}{path}"

    def _speak(self, text: str) -> None:
        if not text:
            return
        if self._say_process is not None and self._say_process.poll() is None:
            self._say_process.terminate()
            self._say_process = None

        if shutil.which("say") is not None:
            try:
                self._say_process = subprocess.Popen(["say", text])
                return
            except Exception:
                pass

        # Portable fallback when host TTS command is unavailable.
        print(f"[voice-agent] {text}")
