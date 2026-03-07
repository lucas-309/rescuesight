from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
from math import hypot
from statistics import mean, pstdev
from time import time
from typing import Optional, Sequence

# MediaPipe Pose indices for torso landmarks used to estimate chest center.
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_HIP = 23
RIGHT_HIP = 24

# MediaPipe Hand landmark indices used to estimate palm center.
WRIST = 0
INDEX_MCP = 5
PINKY_MCP = 17


@dataclass(frozen=True)
class Point2D:
    x: float
    y: float


@dataclass(frozen=True)
class CVSignal:
    handPlacementStatus: str
    placementConfidence: float
    compressionRateBpm: int
    compressionRhythmQuality: str
    visibility: str
    frameTimestampMs: int

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class BpmEstimator:
    def __init__(
        self,
        window_ms: int = 10_000,
        min_peak_delta: float = 0.015,
        smooth_alpha: float = 0.35,
    ) -> None:
        self.window_ms = window_ms
        self.min_peak_delta = min_peak_delta
        self.smooth_alpha = smooth_alpha

        self._samples: deque[tuple[int, float]] = deque(maxlen=3)
        self._peak_times: deque[int] = deque()
        self._last_smoothed_y: Optional[float] = None
        self._last_bpm: Optional[float] = None

    def update(
        self,
        wrist_y: Optional[float],
        timestamp_ms: int,
        confidence: float,
    ) -> tuple[Optional[float], str]:
        if wrist_y is None or confidence < 0.45:
            return self._last_bpm, "unknown"

        smoothed_y = self._smooth(wrist_y)
        self._samples.append((timestamp_ms, smoothed_y))

        if self._is_peak():
            peak_time = self._samples[1][0]
            if not self._peak_times or peak_time - self._peak_times[-1] >= 250:
                self._peak_times.append(peak_time)

        while self._peak_times and timestamp_ms - self._peak_times[0] > self.window_ms:
            self._peak_times.popleft()

        bpm = self._compute_bpm()
        if bpm is not None:
            self._last_bpm = bpm

        interval_cv = self._interval_cv()
        quality = classify_rhythm_quality(bpm, interval_cv, confidence)
        return bpm, quality

    def _smooth(self, y_value: float) -> float:
        if self._last_smoothed_y is None:
            self._last_smoothed_y = y_value
            return y_value

        smoothed = self.smooth_alpha * y_value + (1.0 - self.smooth_alpha) * self._last_smoothed_y
        self._last_smoothed_y = smoothed
        return smoothed

    def _is_peak(self) -> bool:
        if len(self._samples) < 3:
            return False

        _, y0 = self._samples[0]
        _, y1 = self._samples[1]
        _, y2 = self._samples[2]
        prominence = y1 - min(y0, y2)
        return y1 > y0 and y1 > y2 and prominence >= self.min_peak_delta

    def _compute_bpm(self) -> Optional[float]:
        if len(self._peak_times) < 2:
            return None

        duration_ms = self._peak_times[-1] - self._peak_times[0]
        if duration_ms <= 0:
            return None

        beats = len(self._peak_times) - 1
        return 60_000.0 * beats / duration_ms

    def _interval_cv(self) -> Optional[float]:
        if len(self._peak_times) < 4:
            return None

        intervals = [
            self._peak_times[i] - self._peak_times[i - 1]
            for i in range(1, len(self._peak_times))
        ]
        avg = mean(intervals)
        if avg <= 0:
            return None
        return pstdev(intervals) / avg


def now_ms() -> int:
    return int(time() * 1000)


def estimate_chest_center(pose_landmarks: Optional[Sequence[object]]) -> tuple[Optional[Point2D], float]:
    if not pose_landmarks:
        return None, 0.0

    left_shoulder = _landmark_at(pose_landmarks, LEFT_SHOULDER)
    right_shoulder = _landmark_at(pose_landmarks, RIGHT_SHOULDER)
    left_hip = _landmark_at(pose_landmarks, LEFT_HIP)
    right_hip = _landmark_at(pose_landmarks, RIGHT_HIP)

    if not all([left_shoulder, right_shoulder, left_hip, right_hip]):
        return None, 0.0

    visibilities = [
        float(getattr(left_shoulder, "visibility", 0.0)),
        float(getattr(right_shoulder, "visibility", 0.0)),
        float(getattr(left_hip, "visibility", 0.0)),
        float(getattr(right_hip, "visibility", 0.0)),
    ]
    confidence = sum(visibilities) / len(visibilities)

    shoulder_mid = _midpoint(left_shoulder, right_shoulder)
    hip_mid = _midpoint(left_hip, right_hip)

    chest_center = Point2D(
        x=0.60 * shoulder_mid.x + 0.40 * hip_mid.x,
        y=shoulder_mid.y + 0.35 * (hip_mid.y - shoulder_mid.y),
    )

    if confidence < 0.30:
        return None, confidence

    return chest_center, confidence


def estimate_hand_center(hand_landmarks: Optional[Sequence[object]]) -> tuple[Optional[Point2D], float]:
    if not hand_landmarks:
        return None, 0.0

    wrist = _landmark_at(hand_landmarks, WRIST)
    index_mcp = _landmark_at(hand_landmarks, INDEX_MCP)
    pinky_mcp = _landmark_at(hand_landmarks, PINKY_MCP)

    if not all([wrist, index_mcp, pinky_mcp]):
        return None, 0.0

    return (
        Point2D(
            x=(float(wrist.x) + float(index_mcp.x) + float(pinky_mcp.x)) / 3.0,
            y=(float(wrist.y) + float(index_mcp.y) + float(pinky_mcp.y)) / 3.0,
        ),
        1.0,
    )


def classify_hand_placement(
    hand_center: Optional[Point2D],
    chest_center: Optional[Point2D],
    placement_confidence: float,
    x_tolerance: float = 0.08,
    y_tolerance: float = 0.10,
) -> str:
    if hand_center is None or chest_center is None or placement_confidence < 0.45:
        return "unknown"

    dx = hand_center.x - chest_center.x
    dy = hand_center.y - chest_center.y

    if abs(dx) <= x_tolerance and abs(dy) <= y_tolerance:
        return "correct"

    x_score = abs(dx) / x_tolerance if x_tolerance > 0 else 0.0
    y_score = abs(dy) / y_tolerance if y_tolerance > 0 else 0.0

    if x_score >= y_score:
        return "too_right" if dx > 0 else "too_left"
    return "too_low" if dy > 0 else "too_high"


def classify_rhythm_quality(
    bpm: Optional[float],
    interval_cv: Optional[float],
    confidence: float,
) -> str:
    if bpm is None or confidence < 0.55:
        return "unknown"

    if interval_cv is not None and interval_cv > 0.25:
        return "inconsistent"

    if bpm < 100.0:
        return "too_slow"
    if bpm > 120.0:
        return "too_fast"
    return "good"


def infer_visibility(
    has_live_chest_center: bool,
    has_hand: bool,
    using_chest_fallback: bool,
) -> str:
    if has_live_chest_center and has_hand:
        return "full"
    if has_hand and using_chest_fallback:
        return "partial"
    if has_hand or has_live_chest_center:
        return "partial"
    return "poor"


def distance(a: Point2D, b: Point2D) -> float:
    return hypot(a.x - b.x, a.y - b.y)


def _landmark_at(landmarks: Sequence[object], index: int) -> Optional[object]:
    if index < 0 or index >= len(landmarks):
        return None
    return landmarks[index]


def _midpoint(a: object, b: object) -> Point2D:
    return Point2D(
        x=(float(a.x) + float(b.x)) / 2.0,
        y=(float(a.y) + float(b.y)) / 2.0,
    )
