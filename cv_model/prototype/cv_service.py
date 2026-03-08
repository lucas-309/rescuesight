from __future__ import annotations

import argparse
import base64
import binascii
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from time import perf_counter
from typing import Any

import cv2
import mediapipe as mp
import numpy as np

from cv_hooks import (
    CV_HOOK_REQUEST_PAYLOAD_SHAPE,
    CvHookRequest,
    CvHookResponse,
    evaluate_cv_hook,
    parse_cv_hook_request,
)
from cv_signals import (
    BpmEstimator,
    CprTarget,
    CVSignal,
    CprTargetStabilizer,
    Point2D,
    TemporalConfidenceSmoother,
    classify_hand_placement,
    estimate_body_posture,
    estimate_cpr_target,
    estimate_eyes_closed_confidence,
    infer_visibility,
    now_ms,
)
from run_webcam import create_landmarkers, select_primary_hand

FRAME_REQUEST_PAYLOAD_SHAPE: dict[str, object] = {
    "imageDataUrl": "data:image/jpeg;base64,<...> | data:image/png;base64,<...>",
    "frameTimestampMs": "integer (optional)",
    "sourceDeviceId": "string (optional)",
    "frameWidth": "integer (optional)",
    "frameHeight": "integer (optional)",
    "previewWidth": "integer (optional)",
    "previewHeight": "integer (optional)",
}
DATA_URL_PATTERN = re.compile(r"^data:image/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$")
MAX_INFERENCE_DIM = 640


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RescueSight CV service")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", type=int, default=8091, help="Bind port")
    parser.add_argument(
        "--model-dir",
        type=str,
        default=str(Path(__file__).resolve().parent / "models"),
        help="Directory for MediaPipe .task models",
    )
    return parser.parse_args()


class FrameRequest:
    def __init__(
        self,
        image_data_url: str,
        frame_timestamp_ms: int | None,
        source_device_id: str,
        frame_width: int | None,
        frame_height: int | None,
        preview_width: int | None,
        preview_height: int | None,
    ) -> None:
        self.image_data_url = image_data_url
        self.frame_timestamp_ms = frame_timestamp_ms
        self.source_device_id = source_device_id
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.preview_width = preview_width
        self.preview_height = preview_height


class FrameAnalyzer:
    def __init__(self, model_dir: Path) -> None:
        self._lock = Lock()
        self._last_timestamp_ms = 0
        (
            self._pose_landmarker,
            self._hand_landmarker,
            self._face_landmarker,
        ) = create_landmarkers(model_dir)
        self._bpm_estimator = BpmEstimator()
        self._target_stabilizer = CprTargetStabilizer(
            max_fallback_frames=4,
            stable_frames_required=4,
            recenter_frames_required=4,
            recenter_distance=0.075,
            jitter_tolerance=0.06,
        )
        self._eyes_conf_smoother = TemporalConfidenceSmoother(rise_alpha=0.54, fall_alpha=0.20)
        self._lying_conf_smoother = TemporalConfidenceSmoother(rise_alpha=0.46, fall_alpha=0.16)
        self._frame_counter = 0
        self._last_raw_eyes_closed_confidence = 0.0

    def analyze(
        self,
        image_data_url: str,
        frame_timestamp_ms: int | None,
        preview_width: int | None,
        preview_height: int | None,
    ) -> tuple[CVSignal, dict[str, object]]:
        frame_bgr = decode_image_data_url(image_data_url)
        frame_bgr = normalize_frame_for_preview(frame_bgr, preview_width, preview_height)
        frame_bgr = resize_for_inference(frame_bgr, MAX_INFERENCE_DIM)
        frame_height, frame_width = frame_bgr.shape[:2]
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

        with self._lock:
            timestamp_ms = self._next_timestamp(frame_timestamp_ms)
            self._frame_counter += 1
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

            pose_result = self._pose_landmarker.detect_for_video(mp_image, timestamp_ms)
            hands_result = self._hand_landmarker.detect_for_video(mp_image, timestamp_ms)
            face_result = None
            if self._frame_counter % 3 == 1:
                face_result = self._face_landmarker.detect_for_video(mp_image, timestamp_ms)

            pose_landmarks = pose_result.pose_landmarks[0] if pose_result.pose_landmarks else None
            live_target, chest_conf = estimate_cpr_target(pose_landmarks)
            stabilized_target = self._target_stabilizer.update(live_target, chest_conf)
            chest_target = stabilized_target.target
            chest_center = chest_target.center if chest_target is not None else None
            hand_center, wrist_y, hand_conf = select_primary_hand(hands_result, chest_center)

            placement_conf = min(stabilized_target.confidence, hand_conf)
            placement_status = classify_hand_placement(
                hand_center,
                chest_center,
                placement_conf,
                target_scale=chest_target.palmScale if chest_target else None,
            )

            bpm, rhythm_quality = self._bpm_estimator.update(wrist_y, timestamp_ms, hand_conf)
            visibility = infer_visibility(
                has_live_chest_center=live_target is not None,
                has_hand=hand_center is not None,
                using_chest_fallback=stabilized_target.usingFallback,
            )

            body_posture, posture_confidence, torso_incline_deg = estimate_body_posture(pose_landmarks)
            if face_result is not None:
                self._last_raw_eyes_closed_confidence = estimate_eyes_closed_confidence(face_result)
            raw_eyes_closed_confidence = self._last_raw_eyes_closed_confidence
            eyes_closed_confidence = self._eyes_conf_smoother.update(raw_eyes_closed_confidence)
            raw_lying_confidence = posture_confidence if body_posture == "lying" else 0.0
            lying_confidence_smoothed = self._lying_conf_smoother.update(raw_lying_confidence)
            posture_confidence_for_signal = (
                lying_confidence_smoothed if body_posture == "lying" else posture_confidence
            )

            signal = CVSignal(
                handPlacementStatus=placement_status,
                placementConfidence=round(placement_conf, 3),
                compressionRateBpm=int(round(bpm)) if bpm is not None else 0,
                compressionRhythmQuality=rhythm_quality,
                visibility=visibility,
                frameTimestampMs=timestamp_ms,
                bodyPosture=body_posture,
                postureConfidence=round(posture_confidence_for_signal, 3),
                eyesClosedConfidence=round(eyes_closed_confidence, 3),
                torsoInclineDeg=round(torso_incline_deg, 1),
            )
            overlay_hand_center = map_point_to_preview(
                hand_center,
                frame_width,
                frame_height,
                preview_width,
                preview_height,
            )
            overlay_chest_target = map_target_to_preview(
                chest_target,
                frame_width,
                frame_height,
                preview_width,
                preview_height,
            )
            overlay = {
                "handCenter": point_to_dict(overlay_hand_center),
                "chestTarget": target_to_dict(overlay_chest_target),
                "placementStatus": placement_status,
                "placementConfidence": round(placement_conf, 3),
                "visibility": visibility,
                "usingChestFallback": bool(stabilized_target.usingFallback),
            }
            return signal, overlay

    def _next_timestamp(self, requested_timestamp_ms: int | None) -> int:
        candidate = requested_timestamp_ms if requested_timestamp_ms is not None else now_ms()
        if candidate <= self._last_timestamp_ms:
            candidate = self._last_timestamp_ms + 1
        self._last_timestamp_ms = candidate
        return candidate


def decode_image_data_url(image_data_url: str) -> np.ndarray:
    match = DATA_URL_PATTERN.match(image_data_url)
    if not match:
        raise ValueError("imageDataUrl must be a base64 JPEG/PNG data URL.")

    try:
        image_bytes = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("imageDataUrl contains invalid base64 data.") from exc

    image_buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(image_buffer, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Unable to decode image from imageDataUrl.")
    return frame


def normalize_frame_for_preview(
    frame_bgr: np.ndarray,
    preview_width: int | None,
    preview_height: int | None,
) -> np.ndarray:
    if preview_width is None or preview_height is None:
        return frame_bgr

    if preview_width <= 0 or preview_height <= 0:
        return frame_bgr

    frame_height, frame_width = frame_bgr.shape[:2]
    frame_is_portrait = frame_height >= frame_width
    preview_is_portrait = preview_height >= preview_width
    if frame_is_portrait == preview_is_portrait:
        return frame_bgr

    return cv2.rotate(frame_bgr, cv2.ROTATE_90_CLOCKWISE)


def resize_for_inference(frame_bgr: np.ndarray, max_dim: int) -> np.ndarray:
    frame_height, frame_width = frame_bgr.shape[:2]
    longest_side = max(frame_width, frame_height)
    if longest_side <= max_dim:
        return frame_bgr

    scale = max_dim / float(longest_side)
    resized_width = max(2, int(round(frame_width * scale)))
    resized_height = max(2, int(round(frame_height * scale)))
    return cv2.resize(
        frame_bgr,
        (resized_width, resized_height),
        interpolation=cv2.INTER_AREA,
    )


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def map_point_to_preview(
    point: Point2D | None,
    frame_width: int,
    frame_height: int,
    preview_width: int | None,
    preview_height: int | None,
) -> Point2D | None:
    if point is None:
        return None

    if preview_width is None or preview_height is None:
        return point

    if frame_width <= 0 or frame_height <= 0 or preview_width <= 0 or preview_height <= 0:
        return point

    scale = max(preview_width / frame_width, preview_height / frame_height)
    scaled_width = frame_width * scale
    scaled_height = frame_height * scale
    crop_x = (scaled_width - preview_width) * 0.5
    crop_y = (scaled_height - preview_height) * 0.5

    preview_x = ((point.x * frame_width) * scale - crop_x) / preview_width
    preview_y = ((point.y * frame_height) * scale - crop_y) / preview_height
    return Point2D(x=clamp01(preview_x), y=clamp01(preview_y))


def map_target_to_preview(
    target: CprTarget | None,
    frame_width: int,
    frame_height: int,
    preview_width: int | None,
    preview_height: int | None,
) -> CprTarget | None:
    if target is None:
        return None

    mapped_center = map_point_to_preview(
        target.center,
        frame_width,
        frame_height,
        preview_width,
        preview_height,
    )
    if mapped_center is None:
        return None

    if preview_width is None or preview_height is None or preview_width <= 0 or preview_height <= 0:
        return target

    scale = max(preview_width / frame_width, preview_height / frame_height)
    scale_x = (frame_width * scale) / preview_width
    scale_y = (frame_height * scale) / preview_height
    preview_scale = target.palmScale * ((scale_x + scale_y) * 0.5)

    return CprTarget(
        center=mapped_center,
        angleDeg=target.angleDeg,
        palmScale=preview_scale,
    )


def _optional_positive_int(payload: dict[str, Any], field: str) -> int | None:
    value = payload.get(field)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be an integer when provided.")
    if value <= 0:
        raise ValueError(f"{field} must be greater than zero when provided.")
    return value


def parse_frame_request(payload: Any) -> FrameRequest:
    if not isinstance(payload, dict):
        raise ValueError("Payload must be a JSON object.")

    image_data_url = payload.get("imageDataUrl")
    if not isinstance(image_data_url, str) or len(image_data_url) < 32:
        raise ValueError("imageDataUrl is required and must be a non-empty string.")

    frame_timestamp_ms = payload.get("frameTimestampMs")
    if frame_timestamp_ms is not None and not isinstance(frame_timestamp_ms, int):
        raise ValueError("frameTimestampMs must be an integer when provided.")

    source_device_id = payload.get("sourceDeviceId", "mobile-camera")
    if not isinstance(source_device_id, str):
        raise ValueError("sourceDeviceId must be a string when provided.")

    frame_width = _optional_positive_int(payload, "frameWidth")
    frame_height = _optional_positive_int(payload, "frameHeight")
    preview_width = _optional_positive_int(payload, "previewWidth")
    preview_height = _optional_positive_int(payload, "previewHeight")

    return FrameRequest(
        image_data_url=image_data_url,
        frame_timestamp_ms=frame_timestamp_ms,
        source_device_id=source_device_id,
        frame_width=frame_width,
        frame_height=frame_height,
        preview_width=preview_width,
        preview_height=preview_height,
    )


def point_to_dict(point: Point2D | None) -> dict[str, float] | None:
    if point is None:
        return None
    return {"x": round(float(point.x), 5), "y": round(float(point.y), 5)}


def target_to_dict(target: CprTarget | None) -> dict[str, object] | None:
    if target is None:
        return None
    return {
        "center": point_to_dict(target.center),
        "angleDeg": round(float(target.angleDeg), 2),
        "palmScale": round(float(target.palmScale), 5),
    }


class CvServiceHandler(BaseHTTPRequestHandler):
    server_version = "RescueSightCvService/0.2"
    frame_analyzer: FrameAnalyzer | None = None

    def do_OPTIONS(self) -> None:
        self._send_json(204, {})

    def do_GET(self) -> None:
        if self.path != "/health":
            self._send_json(404, {"error": "Not found."})
            return

        self._send_json(
            200,
            {
                "status": "ok",
                "service": "rescuesight-cv-service",
                "endpoints": ["/health", "/api/cv/evaluate", "/api/cv/frame"],
            },
        )

    def do_POST(self) -> None:
        if self.path == "/api/cv/evaluate":
            self._handle_cv_evaluate()
            return

        if self.path == "/api/cv/frame":
            self._handle_cv_frame()
            return

        self._send_json(404, {"error": "Not found."})

    def _handle_cv_evaluate(self) -> None:
        payload = self._read_json_body()
        if payload is None:
            self._send_json(400, {"error": "Invalid JSON body."})
            return

        try:
            request = parse_cv_hook_request(payload)
        except ValueError as error:
            self._send_json(
                400,
                {
                    "error": str(error),
                    "expected": CV_HOOK_REQUEST_PAYLOAD_SHAPE,
                },
            )
            return

        response = evaluate_cv_hook(request)
        self._send_json(200, response.to_dict())

    def _handle_cv_frame(self) -> None:
        if CvServiceHandler.frame_analyzer is None:
            self._send_json(503, {"error": "Frame analyzer is unavailable."})
            return

        payload = self._read_json_body()
        if payload is None:
            self._send_json(400, {"error": "Invalid JSON body."})
            return

        try:
            frame_request = parse_frame_request(payload)
        except ValueError as error:
            self._send_json(
                400,
                {
                    "error": str(error),
                    "expected": FRAME_REQUEST_PAYLOAD_SHAPE,
                },
            )
            return

        started = perf_counter()
        try:
            signal, overlay = CvServiceHandler.frame_analyzer.analyze(
                frame_request.image_data_url,
                frame_request.frame_timestamp_ms,
                frame_request.preview_width,
                frame_request.preview_height,
            )
        except ValueError as error:
            self._send_json(
                400,
                {
                    "error": str(error),
                    "expected": FRAME_REQUEST_PAYLOAD_SHAPE,
                },
            )
            return
        except Exception as error:
            self._send_json(500, {"error": f"Frame analysis failed: {error}"})
            return

        hook_request = CvHookRequest(signal=signal, source=frame_request.source_device_id)
        hook_response: CvHookResponse = evaluate_cv_hook(hook_request)
        elapsed_ms = round((perf_counter() - started) * 1000.0, 1)

        self._send_json(
            200,
            {
                "signal": signal.to_dict(),
                "overlay": overlay,
                "cvAssist": hook_response.to_dict(),
                "processingMs": elapsed_ms,
            },
        )

    def log_message(self, format: str, *args: Any) -> None:
        # Keep service output clean for hackathon demos and test runs.
        return

    def _read_json_body(self) -> dict[str, Any] | None:
        content_length_value = self.headers.get("Content-Length", "0")
        try:
            content_length = int(content_length_value)
        except ValueError:
            return None

        if content_length <= 0:
            return None

        body = self.rfile.read(content_length)
        try:
            parsed = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

        if not isinstance(parsed, dict):
            return None
        return parsed

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        self.wfile.write(body)


def build_server(host: str, port: int) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), CvServiceHandler)


def main() -> int:
    args = parse_args()
    model_dir = Path(args.model_dir)
    print(f"Loading MediaPipe models from {model_dir} ...")
    CvServiceHandler.frame_analyzer = FrameAnalyzer(model_dir=model_dir)

    server = build_server(args.host, args.port)
    print(f"RescueSight CV service listening on http://{args.host}:{args.port}")
    print("Available endpoints: GET /health, POST /api/cv/evaluate, POST /api/cv/frame")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
