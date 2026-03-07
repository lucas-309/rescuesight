from __future__ import annotations

import unittest

from cv_signals import (
    BpmEstimator,
    CprTargetStabilizer,
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

    def test_target_stabilizer_locks_and_holds_position(self) -> None:
        target, confidence = estimate_cpr_target(_pose_with_centered_torso())
        self.assertIsNotNone(target)
        assert target is not None
        self.assertGreater(confidence, 0.70)

        stabilizer = CprTargetStabilizer(stable_frames_required=4)
        final = None
        for i in range(6):
            jittered = type(target)(
                center=type(target.center)(
                    x=target.center.x + (0.003 if i % 2 == 0 else -0.003),
                    y=target.center.y + (0.002 if i % 2 == 0 else -0.002),
                ),
                angleDeg=target.angleDeg + (1.5 if i % 2 == 0 else -1.5),
                palmScale=target.palmScale * (1.0 + (0.02 if i % 2 == 0 else -0.02)),
            )
            final = stabilizer.update(jittered, 0.90)

        self.assertIsNotNone(final)
        assert final is not None
        self.assertTrue(final.isLocked)
        self.assertIsNotNone(final.target)
        assert final.target is not None
        locked_x = final.target.center.x
        locked_y = final.target.center.y

        # Large jitter should not move the lock immediately.
        noisy_live = type(target)(
            center=type(target.center)(x=locked_x + 0.015, y=locked_y - 0.015),
            angleDeg=target.angleDeg + 8.0,
            palmScale=target.palmScale * 1.10,
        )
        held = stabilizer.update(noisy_live, 0.88)
        self.assertTrue(held.isLocked)
        self.assertIsNotNone(held.target)
        assert held.target is not None
        self.assertAlmostEqual(held.target.center.x, locked_x, places=4)
        self.assertAlmostEqual(held.target.center.y, locked_y, places=4)

    def test_target_stabilizer_uses_fallback_then_unlocks(self) -> None:
        target, _ = estimate_cpr_target(_pose_with_centered_torso())
        self.assertIsNotNone(target)
        assert target is not None

        stabilizer = CprTargetStabilizer(stable_frames_required=2, max_fallback_frames=3)
        stabilizer.update(target, 0.95)
        locked = stabilizer.update(target, 0.95)
        self.assertTrue(locked.isLocked)

        # During short misses, lock should remain with fallback.
        missing_1 = stabilizer.update(None, 0.0)
        self.assertTrue(missing_1.isLocked)
        self.assertTrue(missing_1.usingFallback)

        missing_2 = stabilizer.update(None, 0.0)
        self.assertTrue(missing_2.isLocked)

        # Exceed fallback budget => unlock.
        stabilizer.update(None, 0.0)
        unlocked = stabilizer.update(None, 0.0)
        self.assertFalse(unlocked.isLocked)
        self.assertIsNone(unlocked.target)


if __name__ == "__main__":
    unittest.main()
