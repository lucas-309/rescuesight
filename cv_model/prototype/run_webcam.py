from __future__ import annotations

import argparse
import json
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
from cv_signals import (
    BpmEstimator,
    CprTargetStabilizer,
    CprTarget,
    CVSignal,
    Point2D,
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
        "--questionnaire-cooldown-sec",
        type=float,
        default=30.0,
        help="Minimum seconds between auto-triggered questionnaires",
    )
    parser.add_argument(
        "--post-url",
        type=str,
        default="",
        help="Optional API URL to receive live CV signals (example: http://127.0.0.1:8080/api/cv/live-signal)",
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
        default="cv-webcam-prototype",
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

    palm_axes = (int(scale_px * 0.48), int(scale_px * 0.64))
    cv2.ellipse(overlay, center_px, palm_axes, target.angleDeg, 0, 360, fill_color, -1)
    cv2.ellipse(overlay, center_px, palm_axes, target.angleDeg, 0, 360, edge_color, 2)

    finger_offsets = [(-0.34, -0.95), (-0.12, -1.03), (0.12, -1.03), (0.34, -0.95)]
    finger_radius = max(4, int(scale_px * 0.18))
    for fx, fy in finger_offsets:
        finger_px = _to_px(center_px, scale_px, target.angleDeg, fx, fy)
        cv2.circle(overlay, finger_px, finger_radius, fill_color, -1)
        cv2.circle(overlay, finger_px, finger_radius, edge_color, 1)

    thumb_px = _to_px(center_px, scale_px, target.angleDeg, -0.68, -0.10)
    cv2.circle(overlay, thumb_px, max(4, int(scale_px * 0.20)), fill_color, -1)
    cv2.circle(overlay, thumb_px, max(4, int(scale_px * 0.20)), edge_color, 1)

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


def draw_status_panel(frame: np.ndarray, lines: list[str]) -> None:
    panel_x = 10
    panel_y = 10
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.82
    thickness = 2
    line_gap = 8
    pad_x = 14
    pad_y = 10

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
            5,
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


def build_live_signal_payload(args: argparse.Namespace, signal: CVSignal) -> dict[str, object]:
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

    return payload


def build_dispatch_location_payload(args: argparse.Namespace) -> dict[str, object]:
    label = args.location_label.strip()
    if args.location_lat is not None and args.location_lon is not None:
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

    return {
        "label": "CV webcam (location unavailable)",
        "latitude": 0.0,
        "longitude": 0.0,
        "indoorDescriptor": (
            "Set --location-label/--location-lat/--location-lon for real location in dashboard."
        ),
    }


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
                return True, f"live stream ok ({response.status})"
            return False, f"live stream status {response.status}"
    except urllib.error.HTTPError as exc:
        return False, f"live stream http {exc.code}"
    except urllib.error.URLError as exc:
        return False, f"live stream offline ({exc.reason})"


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

    cap = cv2.VideoCapture(args.camera_index)
    if not cap.isOpened():
        print("Unable to open webcam. Try a different --camera-index.")
        return 1
    configure_camera(cap, args)

    bpm_estimator = BpmEstimator()
    target_stabilizer = CprTargetStabilizer(max_fallback_frames=args.max_fallback_frames)
    last_json_print_ms = 0
    last_live_post_ms = 0
    live_post_status = "live stream disabled"

    model_dir = Path(args.model_dir)
    pose_landmarker, hand_landmarker, face_landmarker = create_landmarkers(model_dir)

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

            bpm, rhythm_quality = bpm_estimator.update(wrist_y, now_ms(), hand_conf)
            visibility = infer_visibility(
                has_live_chest_center=live_target is not None,
                has_hand=hand_center is not None,
                using_chest_fallback=using_chest_fallback,
            )
            body_posture, posture_confidence, torso_incline_deg = estimate_body_posture(
                pose_result.pose_landmarks[0] if pose_result.pose_landmarks else None
            )
            eyes_closed_confidence = estimate_eyes_closed_confidence(face_result)

            signal = CVSignal(
                handPlacementStatus=placement_status,
                placementConfidence=round(placement_conf, 3),
                compressionRateBpm=int(round(bpm)) if bpm is not None else 0,
                compressionRhythmQuality=rhythm_quality,
                visibility=visibility,
                frameTimestampMs=now_ms(),
                bodyPosture=body_posture,
                postureConfidence=round(posture_confidence, 3),
                eyesClosedConfidence=round(eyes_closed_confidence, 3),
                torsoInclineDeg=round(torso_incline_deg, 1),
            )
            cv_assist = evaluate_cv_hook(CvHookRequest(signal=signal))
            person_down_possible = cv_assist.personDownHint.status in {"possible", "likely"}

            if live_signal_url and signal.frameTimestampMs - last_live_post_ms >= max(
                250, args.post_interval_ms
            ):
                live_payload = build_live_signal_payload(args, signal)
                posted, post_status = post_live_signal(live_signal_url, live_payload)
                live_post_status = post_status if posted else post_status
                last_live_post_ms = signal.frameTimestampMs

            if hitl_enabled:
                started = questionnaire.maybe_start(
                    person_down_possible=person_down_possible,
                    timestamp_ms=signal.frameTimestampMs,
                )
                if started:
                    print(questionnaire.last_status)

            if hitl_enabled and questionnaire.completed_answers is not None:
                if dispatch_request_url:
                    dispatch_payload = build_dispatch_request_payload(
                        questionnaire=questionnaire.completed_answers,
                        location=build_dispatch_location_payload(args),
                        person_down_signal=build_person_down_signal_payload(
                            cv_assist.personDownHint.status,
                            cv_assist.personDownHint.confidence,
                            signal.frameTimestampMs,
                        ),
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
                else:
                    questionnaire.mark_submitted(
                        status="Questionnaire complete (not submitted: set --api-base-url).",
                        timestamp_ms=signal.frameTimestampMs,
                        submitted=False,
                    )

            frame_h, frame_w = frame.shape[:2]
            if chest_target is not None:
                draw_cpr_hand_target(
                    frame,
                    chest_target,
                    using_chest_fallback,
                    stabilized_target.isLocked,
                )

            if hand_center is not None:
                hand_px = (int(hand_center.x * frame_w), int(hand_center.y * frame_h))
                cv2.circle(frame, hand_px, 8, (0, 200, 255), -1)
                cv2.putText(
                    frame,
                    "hand",
                    (hand_px[0] + 10, hand_px[1]),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 200, 255),
                    1,
                    cv2.LINE_AA,
                )

            status_lines = [
                f"placement: {signal.handPlacementStatus} ({signal.placementConfidence:.2f})",
                f"bpm: {signal.compressionRateBpm}",
                f"rhythm: {signal.compressionRhythmQuality}",
                f"visibility: {signal.visibility}",
                (
                    "person_down_hint: "
                    f"{cv_assist.personDownHint.status} ({cv_assist.personDownHint.confidence:.2f})"
                ),
                (
                    "posture: "
                    f"{signal.bodyPosture} ({signal.postureConfidence:.2f}), "
                    f"eyes_closed: {signal.eyesClosedConfidence:.2f}"
                ),
                f"target_lock: {'locked' if stabilized_target.isLocked else 'tracking'}",
                f"api_stream: {live_post_status}",
            ]
            if hitl_enabled:
                status_lines.append(f"hitl_phase: {questionnaire.phase_label()}")
                status_lines.append("Controls: q=quit h=start x=reset")
            else:
                status_lines.append("HITL questionnaire disabled (--disable-hitl).")
                status_lines.append("Controls: q=quit")
            draw_status_panel(frame, status_lines)

            if hitl_enabled:
                questionnaire_lines = questionnaire.overlay_lines(
                    api_enabled=bool(dispatch_request_url)
                )
                draw_questionnaire_panel(
                    frame,
                    questionnaire_lines,
                    active=questionnaire.active,
                )

            if args.print_json and signal.frameTimestampMs - last_json_print_ms >= 1_000:
                print(json.dumps(signal.to_dict()))
                last_json_print_ms = signal.frameTimestampMs

            cv2.imshow("RescueSight CV Prototype", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if hitl_enabled:
                questionnaire.handle_key(key, signal.frameTimestampMs)
    finally:
        pose_landmarker.close()
        hand_landmarker.close()
        face_landmarker.close()

    cap.release()
    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
