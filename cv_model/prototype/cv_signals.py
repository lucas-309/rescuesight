from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
from math import atan2, cos, degrees, hypot, radians, sin
from statistics import mean, median, pstdev
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


@dataclass(frozen=True)
class CprTarget:
    center: Point2D
    angleDeg: float
    palmScale: float


@dataclass(frozen=True)
class StabilizedCprTarget:
    target: Optional[CprTarget]
    confidence: float
    isLocked: bool
    usingFallback: bool


class CprTargetStabilizer:
    def __init__(
        self,
        max_fallback_frames: int = 12,
        lock_conf_threshold: float = 0.58,
        unlock_conf_threshold: float = 0.45,
        stable_frames_required: int = 6,
        jitter_tolerance: float = 0.045,
        min_conf_for_tracking: float = 0.40,
        recenter_frames_required: int = 8,
        recenter_distance: float = 0.12,
    ) -> None:
        self.max_fallback_frames = max_fallback_frames
        self.lock_conf_threshold = lock_conf_threshold
        self.unlock_conf_threshold = unlock_conf_threshold
        self.stable_frames_required = stable_frames_required
        self.jitter_tolerance = jitter_tolerance
        self.min_conf_for_tracking = min_conf_for_tracking
        self.recenter_frames_required = recenter_frames_required
        self.recenter_distance = recenter_distance

        self._locked_target: Optional[CprTarget] = None
        self._locked_confidence = 0.0
        self._miss_frames = 0

        self._candidate_samples: deque[tuple[CprTarget, float]] = deque(maxlen=24)
        self._recenter_samples: deque[tuple[CprTarget, float]] = deque(maxlen=24)

    def update(
        self,
        live_target: Optional[CprTarget],
        live_confidence: float,
    ) -> StabilizedCprTarget:
        if live_target is None:
            return self._update_missing_target()

        self._miss_frames = 0

        if self._locked_target is not None:
            return self._update_locked_target(live_target, live_confidence)

        return self._update_lock_candidate(live_target, live_confidence)

    def _update_missing_target(self) -> StabilizedCprTarget:
        self._candidate_samples.clear()
        self._recenter_samples.clear()

        if self._locked_target is None:
            return StabilizedCprTarget(
                target=None,
                confidence=0.0,
                isLocked=False,
                usingFallback=False,
            )

        self._miss_frames += 1
        if self._miss_frames > self.max_fallback_frames:
            self._reset_lock()
            return StabilizedCprTarget(
                target=None,
                confidence=0.0,
                isLocked=False,
                usingFallback=False,
            )

        decayed_conf = max(self.unlock_conf_threshold, self._locked_confidence - 0.03 * self._miss_frames)
        return StabilizedCprTarget(
            target=self._locked_target,
            confidence=decayed_conf,
            isLocked=True,
            usingFallback=True,
        )

    def _update_lock_candidate(
        self,
        live_target: CprTarget,
        live_confidence: float,
    ) -> StabilizedCprTarget:
        if live_confidence < self.min_conf_for_tracking:
            self._candidate_samples.clear()
            return StabilizedCprTarget(
                target=None,
                confidence=0.0,
                isLocked=False,
                usingFallback=False,
            )

        self._candidate_samples.append((live_target, live_confidence))
        smoothed_target, avg_conf, jitter = self._aggregate_samples(self._candidate_samples)

        if (
            len(self._candidate_samples) >= self.stable_frames_required
            and avg_conf >= self.lock_conf_threshold
            and jitter <= self.jitter_tolerance
        ):
            self._locked_target = smoothed_target
            self._locked_confidence = avg_conf
            self._candidate_samples.clear()
            return StabilizedCprTarget(
                target=self._locked_target,
                confidence=self._locked_confidence,
                isLocked=True,
                usingFallback=False,
            )

        # Pre-lock output is smoothed to reduce wobble while converging.
        return StabilizedCprTarget(
            target=smoothed_target,
            confidence=avg_conf,
            isLocked=False,
            usingFallback=False,
        )

    def _update_locked_target(self, live_target: CprTarget, live_confidence: float) -> StabilizedCprTarget:
        assert self._locked_target is not None

        if live_confidence < self.unlock_conf_threshold:
            self._recenter_samples.clear()
            return StabilizedCprTarget(
                target=self._locked_target,
                confidence=self._locked_confidence,
                isLocked=True,
                usingFallback=True,
            )

        live_displacement = distance(self._locked_target.center, live_target.center)
        if live_displacement <= self.recenter_distance * 0.55:
            self._recenter_samples.clear()
            self._locked_confidence = max(self._locked_confidence * 0.90, live_confidence)
            return StabilizedCprTarget(
                target=self._locked_target,
                confidence=self._locked_confidence,
                isLocked=True,
                usingFallback=False,
            )

        # Potential true shift: only re-lock after stable high-confidence drift.
        if live_confidence >= self.lock_conf_threshold:
            self._recenter_samples.append((live_target, live_confidence))
        else:
            self._recenter_samples.clear()

        if len(self._recenter_samples) >= self.recenter_frames_required:
            recentered_target, recentered_conf, recentered_jitter = self._aggregate_samples(
                self._recenter_samples
            )
            drift_from_lock = distance(self._locked_target.center, recentered_target.center)
            if (
                recentered_conf >= self.lock_conf_threshold
                and recentered_jitter <= self.jitter_tolerance * 1.25
                and drift_from_lock >= self.recenter_distance
            ):
                self._locked_target = recentered_target
                self._locked_confidence = recentered_conf
                self._recenter_samples.clear()
            elif recentered_jitter > self.jitter_tolerance * 1.8:
                self._recenter_samples.clear()

        return StabilizedCprTarget(
            target=self._locked_target,
            confidence=max(self._locked_confidence, live_confidence),
            isLocked=True,
            usingFallback=False,
        )

    @staticmethod
    def _aggregate_samples(
        samples: Sequence[tuple[CprTarget, float]]
    ) -> tuple[CprTarget, float, float]:
        weights = [max(0.15, conf) for _, conf in samples]
        total_weight = sum(weights)
        if total_weight <= 0:
            total_weight = float(len(samples))

        avg_x = sum(target.center.x * w for (target, _), w in zip(samples, weights)) / total_weight
        avg_y = sum(target.center.y * w for (target, _), w in zip(samples, weights)) / total_weight

        sin_sum = sum(sin(radians(target.angleDeg)) * w for (target, _), w in zip(samples, weights))
        cos_sum = sum(cos(radians(target.angleDeg)) * w for (target, _), w in zip(samples, weights))
        avg_angle = degrees(atan2(sin_sum, cos_sum)) if (sin_sum != 0.0 or cos_sum != 0.0) else 0.0

        avg_scale = sum(target.palmScale * w for (target, _), w in zip(samples, weights)) / total_weight
        avg_conf = sum(conf for _, conf in samples) / len(samples)

        aggregate_target = CprTarget(
            center=Point2D(
                x=avg_x,
                y=avg_y,
            ),
            angleDeg=avg_angle,
            palmScale=avg_scale,
        )
        jitter = median([distance(target.center, aggregate_target.center) for target, _ in samples])
        return aggregate_target, avg_conf, jitter

    def _reset_lock(self) -> None:
        self._locked_target = None
        self._locked_confidence = 0.0
        self._miss_frames = 0
        self._candidate_samples.clear()
        self._recenter_samples.clear()


class BpmEstimator:
    def __init__(
        self,
        window_ms: int = 10_000,
        min_peak_delta: float = 0.015,
        smooth_alpha: float = 0.35,
        min_peak_interval_ms: int = 280,
        max_peak_interval_ms: int = 1_400,
        stale_timeout_ms: int = 2_200,
    ) -> None:
        self.window_ms = window_ms
        self.min_peak_delta = min_peak_delta
        self.smooth_alpha = smooth_alpha
        self.min_peak_interval_ms = min_peak_interval_ms
        self.max_peak_interval_ms = max_peak_interval_ms
        self.stale_timeout_ms = stale_timeout_ms

        self._samples: deque[tuple[int, float]] = deque(maxlen=3)
        self._history: deque[tuple[int, float]] = deque(maxlen=240)
        self._peak_times: deque[int] = deque()
        self._last_smoothed_y: Optional[float] = None
        self._last_bpm: Optional[float] = None
        self._last_peak_time: Optional[int] = None

    def update(
        self,
        wrist_y: Optional[float],
        timestamp_ms: int,
        confidence: float,
    ) -> tuple[Optional[float], str]:
        if wrist_y is None or confidence < 0.45:
            self._expire_if_stale(timestamp_ms)
            return self._last_bpm, "unknown"

        smoothed_y = self._smooth(wrist_y)
        self._samples.append((timestamp_ms, smoothed_y))
        self._history.append((timestamp_ms, smoothed_y))

        if self._is_peak():
            peak_time = self._samples[1][0]
            if self._accept_peak(peak_time):
                self._peak_times.append(peak_time)
                self._last_peak_time = peak_time

        while self._peak_times and timestamp_ms - self._peak_times[0] > self.window_ms:
            self._peak_times.popleft()

        bpm = self._compute_bpm()
        if bpm is not None:
            self._last_bpm = bpm

        interval_cv = self._interval_cv()
        quality = classify_rhythm_quality(bpm, interval_cv, confidence)
        return bpm, quality

    def _expire_if_stale(self, timestamp_ms: int) -> None:
        if self._last_peak_time is None:
            return
        if timestamp_ms - self._last_peak_time > self.stale_timeout_ms:
            self._last_bpm = None

    def _accept_peak(self, peak_time: int) -> bool:
        if not self._peak_times:
            return True

        delta = peak_time - self._peak_times[-1]
        if delta < self.min_peak_interval_ms:
            return False

        # If the signal disappears and returns much later, reset cycle history.
        if delta > self.max_peak_interval_ms * 3:
            self._peak_times.clear()
        return True

    def _dynamic_prominence(self) -> float:
        if len(self._history) < 10:
            return self.min_peak_delta

        values = [sample_y for _, sample_y in self._history]
        value_span = max(values) - min(values)
        return max(self.min_peak_delta, value_span * 0.20)

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
        if not (y1 > y0 and y1 > y2):
            return False

        prominence = y1 - max(y0, y2)
        dynamic_prominence = self._dynamic_prominence()
        rise = y1 - y0
        fall = y1 - y2
        return (
            prominence >= dynamic_prominence
            and rise >= dynamic_prominence * 0.60
            and fall >= dynamic_prominence * 0.60
        )

    def _valid_intervals(self) -> list[int]:
        if len(self._peak_times) < 2:
            return []

        raw = [
            self._peak_times[i] - self._peak_times[i - 1]
            for i in range(1, len(self._peak_times))
        ]
        filtered = [
            interval
            for interval in raw
            if self.min_peak_interval_ms <= interval <= self.max_peak_interval_ms
        ]
        if len(filtered) < 2:
            return filtered

        med = median(filtered)
        tolerance = med * 0.35
        trimmed = [interval for interval in filtered if abs(interval - med) <= tolerance]
        return trimmed if len(trimmed) >= 2 else filtered

    def _compute_bpm(self) -> Optional[float]:
        intervals = self._valid_intervals()
        if len(intervals) < 2:
            return None

        avg_interval_ms = mean(intervals)
        if avg_interval_ms <= 0:
            return None

        return 60_000.0 / avg_interval_ms

    def _interval_cv(self) -> Optional[float]:
        intervals = self._valid_intervals()
        if len(intervals) < 3:
            return None

        avg = mean(intervals)
        if avg <= 0:
            return None
        return pstdev(intervals) / avg


def now_ms() -> int:
    return int(time() * 1000)


def estimate_chest_center(pose_landmarks: Optional[Sequence[object]]) -> tuple[Optional[Point2D], float]:
    target, confidence = estimate_cpr_target(pose_landmarks)
    return (target.center if target else None), confidence


def estimate_cpr_target(pose_landmarks: Optional[Sequence[object]]) -> tuple[Optional[CprTarget], float]:
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
    avg_visibility = sum(visibilities) / len(visibilities)

    shoulder_mid = _midpoint(left_shoulder, right_shoulder)
    hip_mid = _midpoint(left_hip, right_hip)

    torso_dx = hip_mid.x - shoulder_mid.x
    torso_dy = hip_mid.y - shoulder_mid.y
    torso_len = hypot(torso_dx, torso_dy)
    shoulder_span = distance(
        Point2D(float(left_shoulder.x), float(left_shoulder.y)),
        Point2D(float(right_shoulder.x), float(right_shoulder.y)),
    )
    if torso_len < 1e-6 or shoulder_span < 1e-6:
        return None, 0.0

    # Lower-half sternum target for CPR hand placement.
    cpr_center = Point2D(
        x=shoulder_mid.x + torso_dx * 0.38,
        y=shoulder_mid.y + torso_dy * 0.38,
    )
    angle_deg = degrees(atan2(torso_dy, torso_dx))
    palm_scale = _clamp(shoulder_span * 0.24, 0.035, 0.12)

    torso_score = _clamp(torso_len / 0.30, 0.0, 1.0)
    confidence = 0.75 * avg_visibility + 0.25 * torso_score
    if confidence < 0.30:
        return None, confidence

    return CprTarget(center=cpr_center, angleDeg=angle_deg, palmScale=palm_scale), confidence


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
    target_scale: Optional[float] = None,
) -> str:
    if hand_center is None or chest_center is None or placement_confidence < 0.45:
        return "unknown"

    if target_scale is not None:
        x_tolerance = _clamp(target_scale * 1.15, 0.05, 0.12)
        y_tolerance = _clamp(target_scale * 1.45, 0.07, 0.15)

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

    if interval_cv is not None and interval_cv > 0.18:
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


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))
