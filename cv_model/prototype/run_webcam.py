from __future__ import annotations

import argparse
import base64
import json
import os
from datetime import datetime, timezone
from math import cos, radians, sin
from pathlib import Path
from typing import Optional
import urllib.error
import urllib.request

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

from cv_hooks import CvHookRequest, evaluate_cv_hook
from hitl_flow import HitlQuestionnaireSession, build_dispatch_request_payload
from webcam_voice_agent import VoiceAgentConfig, WebcamVoiceAgent
from cv_signals import (
    BpmEstimator,
    CprTargetStabilizer,
    CprTarget,
    CVSignal,
    Point2D,
    TemporalConfidenceSmoother,
    classify_hand_placement,
    distance,
    estimate_cpr_target,
    estimate_body_posture,
    estimate_eyes_closed_confidence,
    estimate_hand_center,
    infer_visibility,
    now_ms,
)

POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)
HAND_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/latest/hand_landmarker.task"
)
FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/latest/face_landmarker.task"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RescueSight CV prototype (MediaPipe baseline)")
    parser.add_argument("--camera-index", type=int, default=0, help="Webcam index")
    parser.add_argument(
        "--camera-zoom",
        type=float,
        default=0.0,
        help=(
            "Requested camera zoom level. Use 0 for widest field of view (default), "
            "or -1 to keep the webcam's current zoom."
        ),
    )
    parser.add_argument(
        "--max-fallback-frames",
        type=int,
        default=12,
        help="How many frames to keep chest center when torso is occluded",
    )
    parser.add_argument(
        "--print-json",
        action="store_true",
        help="Print CV signal JSON roughly once per second",
    )
    parser.add_argument(
        "--model-dir",
        type=str,
        default=str(Path(__file__).resolve().parent / "models"),
        help="Directory for .task model files",
    )
    parser.add_argument(
        "--api-base-url",
        type=str,
        default="",
        help="Backend base URL for dispatch submissions (example: http://127.0.0.1:8080)",
    )
    parser.add_argument(
        "--disable-hitl",
        action="store_true",
        help="Disable person-down-triggered human-in-the-loop questionnaire",
    )
    parser.add_argument(
        "--enable-voice-agent",
        action="store_true",
        help="Enable webcam-native multimodal voice guidance agent (disabled by default)",
    )
    parser.add_argument(
        "--disable-voice-agent",
        action="store_true",
        help="Deprecated: webcam voice is disabled by default; keep for backward compatibility",
    )
    parser.add_argument(
        "--voice-provider",
        type=str,
        choices=["auto", "gemini", "openai"],
        default=os.environ.get("RESCUESIGHT_VOICE_PROVIDER", "auto"),
        help="Voice backend provider (default: auto; prefer Gemini when GEMINI_API_KEY is set)",
    )
    parser.add_argument(
        "--voice-low-latency",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable low-latency Gemini path (single-call audio+vision response)",
    )
    parser.add_argument(
        "--voice-proactive-interval-sec",
        type=float,
        default=8.0,
        help="Seconds between proactive voice observations when no user speech is captured",
    )
    parser.add_argument(
        "--voice-mic-sample-sec",
        type=float,
        default=0.9,
        help="Microphone sample window length for each listen cycle",
    )
    parser.add_argument(
        "--voice-mic-rms-threshold",
        type=float,
        default=130.0,
        help="RMS gate for speech detection before transcription request",
    )
    parser.add_argument(
        "--voice-vision-model",
        type=str,
        default=os.environ.get("RESCUESIGHT_VOICE_VISION_MODEL", ""),
        help="Vision/chat model used by voice provider (provider default when omitted)",
    )
    parser.add_argument(
        "--voice-transcription-model",
        type=str,
        default=os.environ.get("RESCUESIGHT_VOICE_TRANSCRIPTION_MODEL", ""),
        help="Transcription model used by voice provider (provider default when omitted)",
    )
    parser.add_argument(
        "--voice-api-base-url",
        "--voice-openai-base-url",
        type=str,
        default=os.environ.get("RESCUESIGHT_VOICE_API_BASE_URL", ""),
        help="Optional voice API base URL override (provider default when omitted)",
    )
    parser.add_argument(
        "--voice-gemini-base-url",
        type=str,
        default=os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com"),
        help="Gemini API base URL used when provider is gemini",
    )
    parser.add_argument(
        "--questionnaire-cooldown-sec",
        type=float,
        default=30.0,
        help="Minimum seconds between auto-triggered questionnaires",
    )
    parser.add_argument(
        "--post-url",
        type=str,
        default="",
        help="Optional API URL to receive captured CV snapshots (example: http://127.0.0.1:8080/api/cv/live-signal)",
    )
    parser.add_argument(
        "--post-interval-ms",
        type=int,
        default=1000,
        help="Minimum interval between live signal POSTs in milliseconds",
    )
    parser.add_argument(
        "--source-device-id",
        type=str,
        default="RescueSight main",
        help="Source device identifier included in live signal payload",
    )
    parser.add_argument(
        "--location-label",
        type=str,
        default="",
        help="Optional location label for live signal payload",
    )
    parser.add_argument(
        "--location-lat",
        type=float,
        default=None,
        help="Optional latitude for live signal payload",
    )
    parser.add_argument(
        "--location-lon",
        type=float,
        default=None,
        help="Optional longitude for live signal payload",
    )
    parser.add_argument(
        "--location-accuracy",
        type=float,
        default=None,
        help="Optional location accuracy meters for live signal payload",
    )
    parser.add_argument(
        "--location-indoor",
        type=str,
        default="",
        help="Optional indoor descriptor for live signal payload",
    )
    return parser.parse_args()


def ensure_task_model(model_path: Path, url: str) -> None:
    model_path.parent.mkdir(parents=True, exist_ok=True)
    if model_path.exists():
        return
    print(f"Downloading model: {model_path.name}")
    urllib.request.urlretrieve(url, str(model_path))


def create_landmarkers(model_dir: Path) -> tuple[object, object, object]:
    pose_model_path = model_dir / "pose_landmarker_lite.task"
    hand_model_path = model_dir / "hand_landmarker.task"
    face_model_path = model_dir / "face_landmarker.task"

    ensure_task_model(pose_model_path, POSE_MODEL_URL)
    ensure_task_model(hand_model_path, HAND_MODEL_URL)
    ensure_task_model(face_model_path, FACE_MODEL_URL)

    pose_options = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(pose_model_path)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    hand_options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(hand_model_path)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    face_options = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(face_model_path)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.45,
        min_face_presence_confidence=0.45,
        min_tracking_confidence=0.45,
        output_face_blendshapes=True,
    )

    pose_landmarker = mp_vision.PoseLandmarker.create_from_options(pose_options)
    hand_landmarker = mp_vision.HandLandmarker.create_from_options(hand_options)
    face_landmarker = mp_vision.FaceLandmarker.create_from_options(face_options)
    return pose_landmarker, hand_landmarker, face_landmarker


def select_primary_hand(
    hands_result: object,
    chest_center: Optional[Point2D],
) -> tuple[Optional[Point2D], Optional[float], float]:
    hand_landmarks_batch = getattr(hands_result, "hand_landmarks", None)
    handedness_batch = getattr(hands_result, "handedness", None)

    if not hand_landmarks_batch:
        return None, None, 0.0

    best_center: Optional[Point2D] = None
    best_wrist_y: Optional[float] = None
    best_score = -1.0

    for i, hand_landmarks in enumerate(hand_landmarks_batch):
        center, base_conf = estimate_hand_center(hand_landmarks)
        if center is None:
            continue

        handedness_conf = 1.0
        if handedness_batch and i < len(handedness_batch) and handedness_batch[i]:
            handedness_conf = float(handedness_batch[i][0].score)

        confidence = min(base_conf, handedness_conf)
        wrist_y = float(hand_landmarks[0].y)

        if chest_center is None:
            score = confidence
        else:
            score = confidence - distance(center, chest_center)

        if score > best_score:
            best_score = score
            best_center = center
            best_wrist_y = wrist_y

    if best_center is None:
        return None, None, 0.0

    return best_center, best_wrist_y, max(0.0, min(1.0, best_score + 1.0))


def _rotate_local(offset_x: float, offset_y: float, angle_deg: float) -> tuple[float, float]:
    theta = radians(angle_deg)
    c = cos(theta)
    s = sin(theta)
    return (offset_x * c - offset_y * s, offset_x * s + offset_y * c)


def _to_px(
    center_px: tuple[int, int],
    scale_px: float,
    angle_deg: float,
    local_x: float,
    local_y: float,
) -> tuple[int, int]:
    rx, ry = _rotate_local(local_x * scale_px, local_y * scale_px, angle_deg)
    return int(center_px[0] + rx), int(center_px[1] + ry)


def _draw_palm_glyph(
    canvas: np.ndarray,
    center_px: tuple[int, int],
    scale_px: float,
    angle_deg: float,
    fill_color: tuple[int, int, int],
    edge_color: tuple[int, int, int],
    edge_thickness: int = 2,
) -> None:
    palm_axes = (int(scale_px * 0.48), int(scale_px * 0.64))
    cv2.ellipse(canvas, center_px, palm_axes, angle_deg, 0, 360, fill_color, -1)
    cv2.ellipse(canvas, center_px, palm_axes, angle_deg, 0, 360, edge_color, edge_thickness)

    finger_offsets = [(-0.34, -0.95), (-0.12, -1.03), (0.12, -1.03), (0.34, -0.95)]
    finger_radius = max(4, int(scale_px * 0.18))
    for fx, fy in finger_offsets:
        finger_px = _to_px(center_px, scale_px, angle_deg, fx, fy)
        cv2.circle(canvas, finger_px, finger_radius, fill_color, -1)
        cv2.circle(canvas, finger_px, finger_radius, edge_color, max(1, edge_thickness - 1))

    thumb_px = _to_px(center_px, scale_px, angle_deg, -0.68, -0.10)
    thumb_radius = max(4, int(scale_px * 0.20))
    cv2.circle(canvas, thumb_px, thumb_radius, fill_color, -1)
    cv2.circle(canvas, thumb_px, thumb_radius, edge_color, max(1, edge_thickness - 1))


def draw_cpr_hand_target(
    frame: np.ndarray,
    target: CprTarget,
    using_fallback: bool,
    is_locked: bool,
) -> None:
    frame_h, frame_w = frame.shape[:2]
    min_dim = min(frame_w, frame_h)
    center_px = (int(target.center.x * frame_w), int(target.center.y * frame_h))
    scale_px = max(18, int(target.palmScale * min_dim))

    if is_locked:
        fill_color = (20, 215, 95)
    elif using_fallback:
        fill_color = (0, 170, 235)
    else:
        fill_color = (0, 205, 105)
    edge_color = (255, 255, 255)

    overlay = frame.copy()

    _draw_palm_glyph(
        overlay,
        center_px=center_px,
        scale_px=float(scale_px),
        angle_deg=float(target.angleDeg),
        fill_color=fill_color,
        edge_color=edge_color,
        edge_thickness=2,
    )

    cv2.addWeighted(overlay, 0.52, frame, 0.48, 0.0, frame)
    if is_locked and using_fallback:
        label = "CPR target (locked/fallback)"
    elif is_locked:
        label = "CPR target (locked)"
    elif using_fallback:
        label = "CPR target (fallback)"
    else:
        label = "CPR target"
    cv2.putText(
        frame,
        label,
        (center_px[0] + 12, center_px[1] - 12),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )


def _placement_instruction(placement_status: str) -> str:
    mapping = {
        "correct": "Hand placement confirmed.",
        "too_left": "Move hand slightly right to match target.",
        "too_right": "Move hand slightly left to match target.",
        "too_high": "Move hand slightly lower on sternum.",
        "too_low": "Move hand slightly higher on sternum.",
        "unknown": "Keep torso and hands fully visible to reacquire.",
    }
    return mapping.get(placement_status, "Adjust hand to target.")


def is_hand_near_cpr_target(
    hand_center: Optional[Point2D],
    chest_target: Optional[CprTarget],
    placement_confidence: float,
) -> bool:
    if hand_center is None or chest_target is None or placement_confidence < 0.45:
        return False

    proximity_radius = max(0.045, min(0.13, chest_target.palmScale * 1.10))
    return distance(hand_center, chest_target.center) <= proximity_radius


def draw_detected_hand_locator(
    frame: np.ndarray,
    hand_center: Point2D,
    chest_target: Optional[CprTarget],
    placement_status: str,
    placement_confidence: float,
    hand_near_target: bool,
    ready_for_compressions: bool,
) -> None:
    frame_h, frame_w = frame.shape[:2]
    min_dim = min(frame_w, frame_h)
    center_px = (int(hand_center.x * frame_w), int(hand_center.y * frame_h))

    if chest_target is not None:
        angle_deg = chest_target.angleDeg
        scale_px = max(16, int(chest_target.palmScale * min_dim * 0.92))
    else:
        angle_deg = 90.0
        scale_px = max(16, int(min_dim * 0.045))

    if ready_for_compressions:
        fill_color = (30, 215, 105)
        edge_color = (255, 255, 255)
        ring_color = (75, 245, 170)
    elif hand_near_target:
        fill_color = (25, 220, 135)
        edge_color = (255, 255, 255)
        ring_color = (108, 255, 205)
    elif placement_status == "unknown":
        fill_color = (0, 165, 230)
        edge_color = (255, 255, 255)
        ring_color = (75, 225, 255)
    else:
        fill_color = (0, 140, 255)
        edge_color = (255, 255, 255)
        ring_color = (115, 205, 255)

    overlay = frame.copy()
    _draw_palm_glyph(
        overlay,
        center_px=center_px,
        scale_px=float(scale_px),
        angle_deg=float(angle_deg),
        fill_color=fill_color,
        edge_color=edge_color,
        edge_thickness=2,
    )
    cv2.circle(
        overlay,
        center_px,
        int(scale_px * 1.35),
        ring_color,
        2,
        cv2.LINE_AA,
    )
    cv2.addWeighted(overlay, 0.60, frame, 0.40, 0.0, frame)

    if ready_for_compressions:
        label = f"hand confirmed ({placement_confidence:.2f})"
    elif hand_near_target:
        label = f"hand near target ({placement_confidence:.2f})"
    else:
        label = f"hand tracked ({placement_confidence:.2f})"
    cv2.putText(
        frame,
        label,
        (center_px[0] + 12, center_px[1] + 18),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.52,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    if chest_target is None:
        return

    target_px = (int(chest_target.center.x * frame_w), int(chest_target.center.y * frame_h))
    connector_color = (
        (90, 240, 170)
        if (ready_for_compressions or hand_near_target)
        else (80, 210, 255)
    )
    cv2.line(frame, center_px, target_px, connector_color, 2, cv2.LINE_AA)


def draw_compression_readiness_banner(
    frame: np.ndarray,
    hand_visible: bool,
    ready_for_compressions: bool,
    placement_status: str,
    placement_confidence: float,
) -> None:
    if not hand_visible:
        text = "No hand detected. Place your hand over the chest target."
        fill_color = (38, 55, 75)
        border_color = (120, 195, 255)
    elif ready_for_compressions:
        text = "HAND POSITION CONFIRMED. START CHEST COMPRESSIONS NOW."
        fill_color = (24, 96, 42)
        border_color = (116, 240, 152)
    else:
        text = (
            f"{_placement_instruction(placement_status)} "
            f"Confidence: {placement_confidence:.2f}"
        )
        fill_color = (58, 68, 26)
        border_color = (232, 230, 132)

    frame_h, frame_w = frame.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.64
    thickness = 2
    pad_x = 14
    pad_y = 10
    (text_w, text_h), _ = cv2.getTextSize(text, font, font_scale, thickness)
    panel_w = min(frame_w - 20, text_w + pad_x * 2)
    panel_h = text_h + pad_y * 2
    panel_x = max(10, int((frame_w - panel_w) / 2))
    panel_y = 12

    overlay = frame.copy()
    cv2.rectangle(
        overlay,
        (panel_x, panel_y),
        (panel_x + panel_w, panel_y + panel_h),
        fill_color,
        -1,
    )
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0.0, frame)
    cv2.rectangle(
        frame,
        (panel_x, panel_y),
        (panel_x + panel_w, panel_y + panel_h),
        border_color,
        2,
    )

    text_x = panel_x + pad_x
    if text_w > panel_w - pad_x * 2:
        text_x = panel_x + 8
    text_y = panel_y + pad_y + text_h
    cv2.putText(
        frame,
        text,
        (text_x, text_y),
        font,
        font_scale,
        (255, 255, 255),
        thickness,
        cv2.LINE_AA,
    )


def draw_status_panel(frame: np.ndarray, lines: list[str]) -> None:
    panel_x = 10
    panel_y = 10
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.62
    thickness = 1
    line_gap = 4
    pad_x = 10
    pad_y = 8

    text_sizes = [cv2.getTextSize(line, font, font_scale, thickness)[0] for line in lines]
    max_width = max((size[0] for size in text_sizes), default=0)
    line_height = max((size[1] for size in text_sizes), default=0)
    panel_width = max_width + pad_x * 2
    panel_height = len(lines) * line_height + (len(lines) - 1) * line_gap + pad_y * 2

    overlay = frame.copy()
    cv2.rectangle(
        overlay,
        (panel_x, panel_y),
        (panel_x + panel_width, panel_y + panel_height),
        (5, 5, 5),
        -1,
    )
    cv2.addWeighted(overlay, 0.68, frame, 0.32, 0.0, frame)
    cv2.rectangle(
        frame,
        (panel_x, panel_y),
        (panel_x + panel_width, panel_y + panel_height),
        (240, 240, 240),
        2,
    )

    text_y = panel_y + pad_y + line_height
    for line in lines:
        cv2.putText(
            frame,
            line,
            (panel_x + pad_x, text_y),
            font,
            font_scale,
            (0, 0, 0),
            3,
            cv2.LINE_AA,
        )
        cv2.putText(
            frame,
            line,
            (panel_x + pad_x, text_y),
            font,
            font_scale,
            (255, 255, 255),
            thickness,
            cv2.LINE_AA,
        )
        text_y += line_height + line_gap


def build_terminal_metadata_line(
    signal: CVSignal,
    *,
    ready_for_compressions: bool,
    hand_near_target: bool,
    person_down_status: str,
    person_down_confidence: float,
    lying_confidence: float,
    trigger_ready: bool,
    trigger_arm_streak: int,
    trigger_disarm_streak: int,
    target_locked: bool,
    live_post_status: str,
    hitl_enabled: bool,
    hitl_phase: str,
    voice_lines: list[str],
) -> str:
    now_label = datetime.now(timezone.utc).strftime("%H:%M:%S")
    fields = [
        f"placement={signal.handPlacementStatus}/{signal.placementConfidence:.2f}",
        f"compression_ready={'yes' if ready_for_compressions else 'no'}",
        f"target_proximity={'near' if hand_near_target else 'far'}",
        f"bpm={signal.compressionRateBpm}",
        f"rhythm={signal.compressionRhythmQuality}",
        f"visibility={signal.visibility}",
        f"person_down={person_down_status}/{person_down_confidence:.2f}",
        (
            "posture="
            f"{signal.bodyPosture}/{signal.postureConfidence:.2f}, "
            f"eyes={signal.eyesClosedConfidence:.2f}, lying={lying_confidence:.2f}"
        ),
        (
            "hitl_trigger="
            f"{'ready' if trigger_ready else 'idle'} "
            f"(arm={trigger_arm_streak}, disarm={trigger_disarm_streak})"
        ),
        f"target_lock={'locked' if target_locked else 'tracking'}",
        f"api_snapshot_upload={live_post_status}",
    ]
    if hitl_enabled:
        fields.append(f"hitl_phase={hitl_phase}")
    else:
        fields.append("hitl=disabled")
    if voice_lines:
        fields.append("voice=" + "; ".join(voice_lines))
    return f"[cv {now_label} UTC] " + " | ".join(fields)


def draw_questionnaire_panel(frame: np.ndarray, lines: list[str], active: bool) -> None:
    if not lines:
        return

    frame_h, frame_w = frame.shape[:2]
    panel_x = 10
    panel_margin_bottom = 10
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.75
    thickness = 2
    line_gap = 6
    pad_x = 14
    pad_y = 10

    text_sizes = [cv2.getTextSize(line, font, font_scale, thickness)[0] for line in lines]
    max_width = max((size[0] for size in text_sizes), default=0)
    line_height = max((size[1] for size in text_sizes), default=0)
    panel_width = min(frame_w - 20, max_width + pad_x * 2)
    panel_height = len(lines) * line_height + (len(lines) - 1) * line_gap + pad_y * 2
    panel_y = max(10, frame_h - panel_height - panel_margin_bottom)

    overlay = frame.copy()
    if active:
        fill_color = (16, 48, 120)
        border_color = (80, 230, 255)
    else:
        fill_color = (18, 58, 24)
        border_color = (112, 232, 132)

    cv2.rectangle(
        overlay,
        (panel_x, panel_y),
        (panel_x + panel_width, panel_y + panel_height),
        fill_color,
        -1,
    )
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0.0, frame)
    cv2.rectangle(
        frame,
        (panel_x, panel_y),
        (panel_x + panel_width, panel_y + panel_height),
        border_color,
        2,
    )

    text_y = panel_y + pad_y + line_height
    for line in lines:
        cv2.putText(
            frame,
            line,
            (panel_x + pad_x, text_y),
            font,
            font_scale,
            (255, 255, 255),
            thickness,
            cv2.LINE_AA,
        )
        text_y += line_height + line_gap


def post_json(
    url: str,
    payload: dict[str, object],
    timeout_sec: float = 2.5,
) -> tuple[bool, str, Optional[dict[str, object]]]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:
            raw = response.read().decode("utf-8")
            body = json.loads(raw) if raw else {}
            if isinstance(body, dict):
                parsed_body: Optional[dict[str, object]] = body
            else:
                parsed_body = None
            return True, f"Submitted dispatch request ({response.status}).", parsed_body
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        detail = ""
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict) and isinstance(parsed.get("error"), str):
                    detail = parsed["error"]
                else:
                    detail = raw
            except json.JSONDecodeError:
                detail = raw
        if detail:
            return False, f"Dispatch request failed ({exc.code}): {detail}", None
        return False, f"Dispatch request failed ({exc.code}).", None
    except urllib.error.URLError as exc:
        return False, f"Dispatch request failed: {exc.reason}", None


def build_live_signal_payload(
    args: argparse.Namespace,
    signal: CVSignal,
    victim_snapshot: Optional[dict[str, object]] = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "signal": signal.to_dict(),
        "sourceDeviceId": args.source_device_id,
    }

    has_location = (
        args.location_label.strip() != ""
        and args.location_lat is not None
        and args.location_lon is not None
    )

    if has_location:
        location_payload: dict[str, object] = {
            "label": args.location_label.strip(),
            "latitude": float(args.location_lat),
            "longitude": float(args.location_lon),
        }
        if args.location_accuracy is not None:
            location_payload["accuracyMeters"] = float(args.location_accuracy)
        if args.location_indoor.strip():
            location_payload["indoorDescriptor"] = args.location_indoor.strip()
        payload["location"] = location_payload

    if victim_snapshot is not None:
        payload["victimSnapshot"] = victim_snapshot

    return payload


def build_dispatch_location_payload(args: argparse.Namespace) -> dict[str, object]:
    label = args.location_label.strip()
    location_payload: dict[str, object] = {
        "label": label or "CV webcam location",
        "latitude": float(args.location_lat),
        "longitude": float(args.location_lon),
    }
    if args.location_accuracy is not None:
        location_payload["accuracyMeters"] = float(args.location_accuracy)
    if args.location_indoor.strip():
        location_payload["indoorDescriptor"] = args.location_indoor.strip()
    return location_payload


def has_dispatch_location(args: argparse.Namespace) -> bool:
    return args.location_lat is not None and args.location_lon is not None


def build_hitl_checklist_lines(
    *,
    snapshot_ready: bool,
    location_ready: bool,
    questionnaire_ready: bool,
    sent_to_dashboard: bool,
) -> list[str]:
    lines = [
        "=== CPR CHECKLIST ===",
        f"[{'x' if snapshot_ready else ' '}] Snapshot",
        f"[{'x' if location_ready else ' '}] Location",
        f"[{'x' if questionnaire_ready else ' '}] Questionnaire",
    ]
    if sent_to_dashboard:
        lines.append("Checklist complete: request sent to dashboard.")
    elif snapshot_ready and location_ready and questionnaire_ready:
        lines.append("Checklist complete. Sending to dashboard...")
    else:
        lines.append("Press H for questionnaire. Auto-send after all 3 are done.")
    return lines


def build_person_down_signal_payload(cv_status: str, cv_confidence: float, timestamp_ms: int) -> dict[str, object]:
    if cv_confidence >= 0.6 or cv_status == "likely":
        mapped_status = "person_down"
    elif cv_confidence >= 0.4 or cv_status == "possible":
        mapped_status = "uncertain"
    else:
        mapped_status = "not_person_down"
    return {
        "status": mapped_status,
        "confidence": round(max(0.0, min(1.0, float(cv_confidence))), 3),
        "source": "cv",
        "frameTimestampMs": int(timestamp_ms),
    }


def build_victim_snapshot_payload(
    frame_bgr: np.ndarray,
    timestamp_ms: int,
    lying_confidence: float,
    eyes_closed_confidence: float,
    trigger_reason: Optional[str] = None,
    max_width: int = 960,
    jpeg_quality: int = 84,
) -> Optional[dict[str, object]]:
    frame_h, frame_w = frame_bgr.shape[:2]
    resized = frame_bgr
    if frame_w > max_width:
        target_w = max_width
        target_h = max(1, int(frame_h * (target_w / frame_w)))
        resized = cv2.resize(frame_bgr, (target_w, target_h), interpolation=cv2.INTER_AREA)

    ok, encoded = cv2.imencode(
        ".jpg",
        resized,
        [int(cv2.IMWRITE_JPEG_QUALITY), int(max(50, min(95, jpeg_quality)))],
    )
    if not ok:
        return None

    encoded_b64 = base64.b64encode(encoded.tobytes()).decode("ascii")
    image_data_url = f"data:image/jpeg;base64,{encoded_b64}"
    reason = (
        trigger_reason
        if trigger_reason is not None
        else (
            "person_down_trigger "
            f"(lying={lying_confidence:.2f}, eyesClosed={eyes_closed_confidence:.2f})"
        )
    )

    return {
        "imageDataUrl": image_data_url,
        "capturedAtIso": datetime.now(timezone.utc).isoformat(),
        "frameTimestampMs": int(timestamp_ms),
        "triggerReason": reason,
    }


def post_live_signal(url: str, payload: dict[str, object]) -> tuple[bool, str]:
    request_data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=request_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=1.5) as response:
            if 200 <= response.status < 300:
                return True, f"snapshot upload ok ({response.status})"
            return False, f"snapshot upload status {response.status}"
    except urllib.error.HTTPError as exc:
        return False, f"snapshot upload http {exc.code}"
    except urllib.error.URLError as exc:
        return False, f"snapshot upload offline ({exc.reason})"


def normalize_keypress(key: int) -> int:
    if 65 <= key <= 90:
        return key + 32
    return key


def configure_camera(cap: cv2.VideoCapture, args: argparse.Namespace) -> None:
    if args.camera_zoom < 0:
        return

    zoom_prop = getattr(cv2, "CAP_PROP_ZOOM", None)
    if zoom_prop is None:
        print("OpenCV build does not expose CAP_PROP_ZOOM; using webcam default zoom.")
        return

    requested_zoom = float(args.camera_zoom)
    set_result = cap.set(zoom_prop, requested_zoom)
    reported_zoom = cap.get(zoom_prop)

    if not set_result:
        print("Webcam/backend did not accept CAP_PROP_ZOOM; using webcam default zoom.")
        return

    print(f"Camera zoom request applied (requested={requested_zoom:.2f}, reported={reported_zoom:.2f}).")


def main() -> int:
    args = parse_args()
    api_base_url = args.api_base_url.strip().rstrip("/")
    dispatch_request_url = f"{api_base_url}/api/dispatch/requests" if api_base_url else ""
    live_signal_url = args.post_url.strip()
    hitl_enabled = not args.disable_hitl
    questionnaire = HitlQuestionnaireSession(
        cooldown_ms=max(0, int(args.questionnaire_cooldown_sec * 1000.0))
    )
    webcam_voice_enabled = bool(args.enable_voice_agent) and not bool(args.disable_voice_agent)
    requested_provider = str(args.voice_provider).strip().lower()
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    openai_api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if requested_provider == "gemini":
        voice_provider = "gemini"
    elif requested_provider == "openai":
        voice_provider = "openai"
    else:
        voice_provider = "gemini" if gemini_api_key else "openai"

    if voice_provider == "gemini":
        voice_api_key = gemini_api_key
        default_voice_base_url = (
            args.voice_gemini_base_url.strip() or "https://generativelanguage.googleapis.com"
        )
        # Use aliases that are broadly available across Gemini API keys.
        default_vision_model = "gemini-flash-latest"
        default_transcription_model = "gemini-flash-latest"
    else:
        voice_api_key = openai_api_key
        default_voice_base_url = "https://api.openai.com"
        default_vision_model = "gpt-4.1-mini"
        default_transcription_model = "gpt-4o-mini-transcribe"

    voice_agent = WebcamVoiceAgent(
        VoiceAgentConfig(
            enabled=webcam_voice_enabled,
            provider=voice_provider,
            api_key=voice_api_key,
            api_base_url=args.voice_api_base_url.strip() or default_voice_base_url,
            vision_model=args.voice_vision_model.strip() or default_vision_model,
            transcription_model=(
                args.voice_transcription_model.strip() or default_transcription_model
            ),
            proactive_interval_sec=max(2.0, float(args.voice_proactive_interval_sec)),
            mic_sample_seconds=max(0.8, float(args.voice_mic_sample_sec)),
            mic_rms_threshold=max(10.0, float(args.voice_mic_rms_threshold)),
            low_latency_mode=bool(args.voice_low_latency),
        )
    )

    cap = cv2.VideoCapture(args.camera_index)
    if not cap.isOpened():
        print("Unable to open webcam. Try a different --camera-index.")
        return 1
    if hitl_enabled:
        print("HITL checklist enabled: press H to start questionnaire.")
    else:
        print("HITL checklist disabled (--disable-hitl): H questionnaire controls are unavailable.")
    configure_camera(cap, args)

    bpm_estimator = BpmEstimator()
    target_stabilizer = CprTargetStabilizer(max_fallback_frames=args.max_fallback_frames)
    eyes_conf_smoother = TemporalConfidenceSmoother(rise_alpha=0.54, fall_alpha=0.20)
    lying_conf_smoother = TemporalConfidenceSmoother(rise_alpha=0.46, fall_alpha=0.16)
    last_json_print_ms = 0
    last_terminal_metadata_ms = 0
    live_post_status = (
        "snapshot upload ready (press p)"
        if live_signal_url
        else "snapshot upload disabled (set --post-url)"
    )
    trigger_arm_streak = 0
    trigger_disarm_streak = 0
    trigger_latched = False
    manual_capture_requested = False

    model_dir = Path(args.model_dir)
    pose_landmarker, hand_landmarker, face_landmarker = create_landmarkers(model_dir)
    voice_agent.start()

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("No frame from webcam. Exiting.")
                break

            frame = cv2.flip(frame, 1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            timestamp_ms = now_ms()
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            pose_result = pose_landmarker.detect_for_video(mp_image, timestamp_ms)
            hands_result = hand_landmarker.detect_for_video(mp_image, timestamp_ms)
            face_result = face_landmarker.detect_for_video(mp_image, timestamp_ms)

            live_target, chest_conf = estimate_cpr_target(
                pose_result.pose_landmarks[0] if pose_result.pose_landmarks else None
            )
            stabilized_target = target_stabilizer.update(live_target, chest_conf)
            chest_target = stabilized_target.target
            using_chest_fallback = stabilized_target.usingFallback

            chest_center = chest_target.center if chest_target is not None else None
            hand_center, wrist_y, hand_conf = select_primary_hand(hands_result, chest_center)
            placement_conf = min(stabilized_target.confidence, hand_conf)
            placement_status = classify_hand_placement(
                hand_center,
                chest_center,
                placement_conf,
                target_scale=chest_target.palmScale if chest_target else None,
            )
            hand_near_target = is_hand_near_cpr_target(
                hand_center=hand_center,
                chest_target=chest_target,
                placement_confidence=placement_conf,
            )

            bpm, rhythm_quality = bpm_estimator.update(wrist_y, now_ms(), hand_conf)
            visibility = infer_visibility(
                has_live_chest_center=live_target is not None,
                has_hand=hand_center is not None,
                using_chest_fallback=using_chest_fallback,
            )
            body_posture, posture_confidence, torso_incline_deg = estimate_body_posture(
                pose_result.pose_landmarks[0] if pose_result.pose_landmarks else None
            )
            raw_eyes_closed_confidence = estimate_eyes_closed_confidence(face_result)
            eyes_closed_confidence = eyes_conf_smoother.update(raw_eyes_closed_confidence)
            raw_lying_confidence = posture_confidence if body_posture == "lying" else 0.0
            lying_confidence_smoothed = lying_conf_smoother.update(raw_lying_confidence)
            posture_confidence_for_signal = (
                lying_confidence_smoothed if body_posture == "lying" else posture_confidence
            )

            signal = CVSignal(
                handPlacementStatus=placement_status,
                placementConfidence=round(placement_conf, 3),
                compressionRateBpm=int(round(bpm)) if bpm is not None else 0,
                compressionRhythmQuality=rhythm_quality,
                visibility=visibility,
                frameTimestampMs=now_ms(),
                bodyPosture=body_posture,
                postureConfidence=round(posture_confidence_for_signal, 3),
                eyesClosedConfidence=round(eyes_closed_confidence, 3),
                torsoInclineDeg=round(torso_incline_deg, 1),
            )
            cv_assist = evaluate_cv_hook(CvHookRequest(signal=signal))
            lying_confidence = signal.postureConfidence if signal.bodyPosture == "lying" else 0.0
            placement_confirmed = (
                signal.handPlacementStatus == "correct" and signal.placementConfidence >= 0.68
            )
            ready_for_compressions = (
                chest_target is not None
                and stabilized_target.isLocked
                and signal.visibility in {"full", "partial"}
                and placement_confirmed
            )
            location_ready = has_dispatch_location(args)

            trigger_arm_condition = (
                lying_confidence >= 0.58
                and (
                    signal.eyesClosedConfidence >= 0.40
                    or (signal.visibility != "poor" and signal.placementConfidence >= 0.55)
                    or signal.compressionRateBpm >= 90
                )
            )
            trigger_disarm_condition = (
                lying_confidence < 0.36
                and signal.eyesClosedConfidence < 0.22
                and signal.compressionRateBpm < 80
            )

            if trigger_arm_condition:
                trigger_arm_streak = min(trigger_arm_streak + 1, 12)
            else:
                trigger_arm_streak = max(0, trigger_arm_streak - 1)

            if trigger_disarm_condition:
                trigger_disarm_streak = min(trigger_disarm_streak + 1, 20)
            else:
                trigger_disarm_streak = max(0, trigger_disarm_streak - 1)

            if not trigger_latched and trigger_arm_streak >= 3:
                trigger_latched = True
            if trigger_latched and trigger_disarm_streak >= 8:
                trigger_latched = False

            trigger_ready = trigger_latched
            voice_agent.update_scene(
                frame,
                signal,
                person_down_status=cv_assist.personDownHint.status,
                person_down_confidence=cv_assist.personDownHint.confidence,
                ready_for_compressions=ready_for_compressions,
                target_locked=stabilized_target.isLocked,
            )

            if manual_capture_requested:
                payload_snapshot = build_victim_snapshot_payload(
                    frame,
                    signal.frameTimestampMs,
                    lying_confidence=lying_confidence,
                    eyes_closed_confidence=signal.eyesClosedConfidence,
                    trigger_reason=(
                        "manual_capture_key_p "
                        f"(status={cv_assist.personDownHint.status}, "
                        f"confidence={cv_assist.personDownHint.confidence:.2f})"
                    ),
                    max_width=720,
                    jpeg_quality=78,
                )
                if hitl_enabled and payload_snapshot is not None:
                    questionnaire.pending_victim_snapshot = payload_snapshot

                if payload_snapshot is None:
                    live_post_status = "snapshot capture failed"
                elif not live_signal_url:
                    live_post_status = "snapshot captured locally (set --post-url to upload)"
                else:
                    live_payload = build_live_signal_payload(
                        args, signal, victim_snapshot=payload_snapshot
                    )
                    posted, post_status = post_live_signal(live_signal_url, live_payload)
                    if posted:
                        live_post_status = f"snapshot uploaded ({signal.frameTimestampMs})"
                    else:
                        live_post_status = f"snapshot upload failed ({post_status})"
                manual_capture_requested = False

            if hitl_enabled:
                victim_snapshot = None
                if trigger_ready and not questionnaire.auto_prompt_ready:
                    victim_snapshot = build_victim_snapshot_payload(
                        frame,
                        signal.frameTimestampMs,
                        lying_confidence=lying_confidence,
                        eyes_closed_confidence=signal.eyesClosedConfidence,
                        trigger_reason=(
                            "questionnaire_trigger "
                            f"(lying={lying_confidence:.2f}, eyes={signal.eyesClosedConfidence:.2f}, "
                            f"placement={signal.placementConfidence:.2f}, bpm={signal.compressionRateBpm})"
                        ),
                    )
                    if victim_snapshot is None:
                        print("Warning: unable to capture victim snapshot at trigger moment.")
                    else:
                        # Keep checklist snapshot state in sync even before questionnaire start.
                        questionnaire.pending_victim_snapshot = victim_snapshot

                started = questionnaire.set_auto_prompt_ready(
                    trigger_ready=trigger_ready,
                    timestamp_ms=signal.frameTimestampMs,
                    status=(
                        "Trigger detected (sustained person-down evidence). "
                        "Press H to start questionnaire."
                    ),
                    victim_snapshot=victim_snapshot,
                )
                if started:
                    print(questionnaire.last_status)

            if hitl_enabled and questionnaire.completed_answers is not None:
                if questionnaire.pending_victim_snapshot is None:
                    questionnaire.pending_victim_snapshot = build_victim_snapshot_payload(
                        frame,
                        signal.frameTimestampMs,
                        lying_confidence=lying_confidence,
                        eyes_closed_confidence=signal.eyesClosedConfidence,
                        trigger_reason=(
                            "questionnaire_complete_auto_snapshot "
                            f"(status={cv_assist.personDownHint.status}, "
                            f"confidence={cv_assist.personDownHint.confidence:.2f})"
                        ),
                        max_width=960,
                        jpeg_quality=84,
                    )

                if questionnaire.pending_victim_snapshot is None:
                    questionnaire.last_status = (
                        "Checklist incomplete: snapshot missing. Press P to capture snapshot."
                    )
                elif not location_ready:
                    questionnaire.last_status = (
                        "Checklist incomplete: location missing. Set --location-lat/--location-lon."
                    )
                elif not dispatch_request_url:
                    questionnaire.mark_submitted(
                        status="Questionnaire complete (not submitted: set --api-base-url).",
                        timestamp_ms=signal.frameTimestampMs,
                        submitted=False,
                    )
                else:
                    dispatch_payload = build_dispatch_request_payload(
                        questionnaire=questionnaire.completed_answers,
                        location=build_dispatch_location_payload(args),
                        person_down_signal=build_person_down_signal_payload(
                            cv_assist.personDownHint.status,
                            cv_assist.personDownHint.confidence,
                            signal.frameTimestampMs,
                        ),
                        victim_snapshot=questionnaire.pending_victim_snapshot,
                    )
                    submitted, submit_status, response = post_json(
                        dispatch_request_url, dispatch_payload
                    )
                    request_id: Optional[str] = None
                    if response is not None:
                        request_obj = response.get("request")
                        if isinstance(request_obj, dict):
                            maybe_id = request_obj.get("id")
                            if isinstance(maybe_id, str):
                                request_id = maybe_id
                        if request_id is None:
                            escalation_obj = response.get("backendEscalation")
                            if isinstance(escalation_obj, dict):
                                maybe_id = escalation_obj.get("requestId")
                                if isinstance(maybe_id, str):
                                    request_id = maybe_id

                    if submitted and request_id:
                        submit_status = f"Dashboard request queued ({request_id})."
                    elif submitted:
                        submit_status = "Dashboard request queued."

                    questionnaire.mark_submitted(
                        status=submit_status,
                        timestamp_ms=signal.frameTimestampMs,
                        submitted=submitted,
                        request_id=request_id,
                    )

            if chest_target is not None:
                draw_cpr_hand_target(
                    frame,
                    chest_target,
                    using_chest_fallback,
                    stabilized_target.isLocked,
                )

            if hand_center is not None:
                draw_detected_hand_locator(
                    frame,
                    hand_center=hand_center,
                    chest_target=chest_target,
                    placement_status=signal.handPlacementStatus,
                    placement_confidence=signal.placementConfidence,
                    hand_near_target=hand_near_target,
                    ready_for_compressions=ready_for_compressions,
                )

            draw_compression_readiness_banner(
                frame,
                hand_visible=hand_center is not None,
                ready_for_compressions=ready_for_compressions,
                placement_status=signal.handPlacementStatus,
                placement_confidence=signal.placementConfidence,
            )

            person_down_status = cv_assist.personDownHint.status
            person_down_confidence = cv_assist.personDownHint.confidence
            hitl_trigger_state = "ready" if trigger_ready else "idle"
            status_lines = [
                f"visibility: {signal.visibility}",
                f"person_down: {person_down_status} ({person_down_confidence:.2f})",
                f"hitl_trigger: {hitl_trigger_state}",
            ]
            if hitl_enabled:
                status_lines.append("controls: Q quit | P capture/upload | H start | X reset")
            else:
                status_lines.append("controls: Q quit | P capture/upload")
                status_lines.append("H checklist disabled (--disable-hitl)")
            draw_status_panel(frame, status_lines)

            if hitl_enabled:
                checklist_snapshot_ready = (
                    questionnaire.pending_victim_snapshot is not None
                    or questionnaire.last_submission_success is True
                )
                checklist_questionnaire_ready = (
                    questionnaire.completed_answers is not None
                    or questionnaire.last_submission_success is True
                )
                checklist_lines = build_hitl_checklist_lines(
                    snapshot_ready=checklist_snapshot_ready,
                    location_ready=location_ready,
                    questionnaire_ready=checklist_questionnaire_ready,
                    sent_to_dashboard=questionnaire.last_submission_success is True,
                )
                questionnaire_lines = checklist_lines + questionnaire.overlay_lines(
                    api_enabled=bool(dispatch_request_url)
                )
                draw_questionnaire_panel(
                    frame,
                    questionnaire_lines,
                    active=questionnaire.active,
                )

            voice_status_lines = voice_agent.overlay_lines()
            if signal.frameTimestampMs - last_terminal_metadata_ms >= 1_000:
                print(
                    build_terminal_metadata_line(
                        signal,
                        ready_for_compressions=ready_for_compressions,
                        hand_near_target=hand_near_target,
                        person_down_status=person_down_status,
                        person_down_confidence=person_down_confidence,
                        lying_confidence=lying_confidence,
                        trigger_ready=trigger_ready,
                        trigger_arm_streak=trigger_arm_streak,
                        trigger_disarm_streak=trigger_disarm_streak,
                        target_locked=stabilized_target.isLocked,
                        live_post_status=live_post_status,
                        hitl_enabled=hitl_enabled,
                        hitl_phase=questionnaire.phase_label(),
                        voice_lines=voice_status_lines,
                    )
                )
                last_terminal_metadata_ms = signal.frameTimestampMs

            if args.print_json and signal.frameTimestampMs - last_json_print_ms >= 1_000:
                print(json.dumps(signal.to_dict()))
                last_json_print_ms = signal.frameTimestampMs

            cv2.imshow("RescueSight CV Prototype", frame)
            key = cv2.waitKey(1) & 0xFF
            key = normalize_keypress(key)
            if key == ord("q"):
                break
            if key == ord("p"):
                manual_capture_requested = True
            if hitl_enabled:
                questionnaire.handle_key(key, signal.frameTimestampMs)
    finally:
        voice_agent.stop()
        pose_landmarker.close()
        hand_landmarker.close()
        face_landmarker.close()

    cap.release()
    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
