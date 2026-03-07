from __future__ import annotations

import unittest

from cv_signals import (
    BpmEstimator,
    classify_hand_placement,
    estimate_cpr_target,
)


class _Lm:
    def __init__(self, x: float, y: float, visibility: float = 1.0) -> None:
        self.x = x
        self.y = y
        self.visibility = visibility


def _pose_with_centered_torso() -> list[_Lm]:
    landmarks = [_Lm(0.5, 0.5, 0.0) for _ in range(33)]
    landmarks[11] = _Lm(0.42, 0.34, 0.98)  # left shoulder
    landmarks[12] = _Lm(0.58, 0.34, 0.98)  # right shoulder
    landmarks[23] = _Lm(0.44, 0.66, 0.97)  # left hip
    landmarks[24] = _Lm(0.56, 0.66, 0.97)  # right hip
    return landmarks


class TestCvSignals(unittest.TestCase):
    def test_estimate_cpr_target_returns_center_lower_sternum_hint(self) -> None:
        target, confidence = estimate_cpr_target(_pose_with_centered_torso())

        self.assertIsNotNone(target)
        assert target is not None
        self.assertGreater(confidence, 0.75)
        self.assertGreater(target.center.y, 0.34)
        self.assertLess(target.center.y, 0.66)
        self.assertGreater(target.palmScale, 0.03)

    def test_classify_hand_placement_uses_target_scale(self) -> None:
        target, confidence = estimate_cpr_target(_pose_with_centered_torso())
        self.assertGreater(confidence, 0.5)
        assert target is not None

        center = target.center
        self.assertEqual(
            classify_hand_placement(center, center, 0.95, target_scale=target.palmScale),
            "correct",
        )
        self.assertEqual(
            classify_hand_placement(
                type(center)(center.x + 0.20, center.y), center, 0.95, target_scale=target.palmScale
            ),
            "too_right",
        )

    def test_bpm_estimator_tracks_good_cpr_rate(self) -> None:
        estimator = BpmEstimator()
        bpm = None
        quality = "unknown"

        # Synthetic 110 BPM signal using a triangular wave to emulate compressions.
        peak_spacing_ms = int(60_000 / 110)
        half = peak_spacing_ms // 2
        timestamp_ms = 0
        for _ in range(80):
            # top recoil
            bpm, quality = estimator.update(0.45, timestamp_ms, 1.0)
            timestamp_ms += half
            # compression down
            bpm, quality = estimator.update(0.58, timestamp_ms, 1.0)
            timestamp_ms += half

        self.assertIsNotNone(bpm)
        assert bpm is not None
        self.assertGreater(bpm, 102)
        self.assertLess(bpm, 118)
        self.assertEqual(quality, "good")

    def test_bpm_estimator_flags_too_fast(self) -> None:
        estimator = BpmEstimator()
        bpm = None
        quality = "unknown"

        peak_spacing_ms = int(60_000 / 135)
        half = peak_spacing_ms // 2
        timestamp_ms = 0
        for _ in range(80):
            bpm, quality = estimator.update(0.44, timestamp_ms, 1.0)
            timestamp_ms += half
            bpm, quality = estimator.update(0.60, timestamp_ms, 1.0)
            timestamp_ms += half

        self.assertIsNotNone(bpm)
        assert bpm is not None
        self.assertGreater(bpm, 123)
        self.assertEqual(quality, "too_fast")


if __name__ == "__main__":
    unittest.main()
