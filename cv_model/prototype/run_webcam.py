from __future__ import annotations

import argparse
import json
from math import cos, radians, sin
from pathlib import Path
from typing import Optional
import urllib.request

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

from cv_signals import (
    BpmEstimator,
    CprTarget,
    CVSignal,
    Point2D,
    classify_hand_placement,
    distance,
    estimate_cpr_target,
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RescueSight CV prototype (MediaPipe baseline)")
    parser.add_argument("--camera-index", type=int, default=0, help="Webcam index")
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
    return parser.parse_args()


def ensure_task_model(model_path: Path, url: str) -> None:
    model_path.parent.mkdir(parents=True, exist_ok=True)
    if model_path.exists():
        return
    print(f"Downloading model: {model_path.name}")
    urllib.request.urlretrieve(url, str(model_path))


def create_landmarkers(model_dir: Path) -> tuple[object, object]:
    pose_model_path = model_dir / "pose_landmarker_lite.task"
    hand_model_path = model_dir / "hand_landmarker.task"

    ensure_task_model(pose_model_path, POSE_MODEL_URL)
    ensure_task_model(hand_model_path, HAND_MODEL_URL)

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

    pose_landmarker = mp_vision.PoseLandmarker.create_from_options(pose_options)
    hand_landmarker = mp_vision.HandLandmarker.create_from_options(hand_options)
    return pose_landmarker, hand_landmarker


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
) -> None:
    frame_h, frame_w = frame.shape[:2]
    min_dim = min(frame_w, frame_h)
    center_px = (int(target.center.x * frame_w), int(target.center.y * frame_h))
    scale_px = max(18, int(target.palmScale * min_dim))

    fill_color = (0, 205, 105) if not using_fallback else (0, 170, 235)
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
    label = "CPR target" if not using_fallback else "CPR target (fallback)"
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


def main() -> int:
    args = parse_args()

    cap = cv2.VideoCapture(args.camera_index)
    if not cap.isOpened():
        print("Unable to open webcam. Try a different --camera-index.")
        return 1

    bpm_estimator = BpmEstimator()
    last_target: Optional[CprTarget] = None
    fallback_frames = 0
    last_json_print_ms = 0

    model_dir = Path(args.model_dir)
    pose_landmarker, hand_landmarker = create_landmarkers(model_dir)

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

            live_target, chest_conf = estimate_cpr_target(
                pose_result.pose_landmarks[0] if pose_result.pose_landmarks else None
            )

            using_chest_fallback = False
            chest_target = live_target
            if live_target is not None:
                last_target = live_target
                fallback_frames = 0
            elif last_target is not None and fallback_frames < args.max_fallback_frames:
                chest_target = last_target
                chest_conf = max(chest_conf, 0.45)
                using_chest_fallback = True
                fallback_frames += 1
            else:
                chest_target = None
                chest_conf = 0.0
                fallback_frames += 1

            chest_center = chest_target.center if chest_target is not None else None
            hand_center, wrist_y, hand_conf = select_primary_hand(hands_result, chest_center)
            placement_conf = min(chest_conf, hand_conf)
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

            signal = CVSignal(
                handPlacementStatus=placement_status,
                placementConfidence=round(placement_conf, 3),
                compressionRateBpm=int(round(bpm)) if bpm is not None else 0,
                compressionRhythmQuality=rhythm_quality,
                visibility=visibility,
                frameTimestampMs=now_ms(),
            )

            frame_h, frame_w = frame.shape[:2]
            if chest_target is not None:
                draw_cpr_hand_target(frame, chest_target, using_chest_fallback)

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

            y = 24
            for line in [
                f"placement: {signal.handPlacementStatus} ({signal.placementConfidence:.2f})",
                f"bpm: {signal.compressionRateBpm}",
                f"rhythm: {signal.compressionRhythmQuality}",
                f"visibility: {signal.visibility}",
                "press 'q' to quit",
            ]:
                cv2.putText(
                    frame,
                    line,
                    (10, y),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (255, 255, 255),
                    2,
                    cv2.LINE_AA,
                )
                y += 24

            if args.print_json and signal.frameTimestampMs - last_json_print_ms >= 1_000:
                print(json.dumps(signal.to_dict()))
                last_json_print_ms = signal.frameTimestampMs

            cv2.imshow("RescueSight CV Prototype", frame)
            if (cv2.waitKey(1) & 0xFF) == ord("q"):
                break
    finally:
        pose_landmarker.close()
        hand_landmarker.close()

    cap.release()
    cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
