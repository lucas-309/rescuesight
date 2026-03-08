from __future__ import annotations

import unittest

from cv_signals import CVSignal
from webcam_voice_agent import (
    build_scene_summary,
    data_url_to_inline_part,
    parse_gemini_text,
    parse_response_text,
)


def _sample_signal() -> CVSignal:
    return CVSignal(
        handPlacementStatus="too_high",
        placementConfidence=0.67,
        compressionRateBpm=104,
        compressionRhythmQuality="good",
        visibility="full",
        frameTimestampMs=1_731_000_000,
        bodyPosture="lying",
        postureConfidence=0.81,
        eyesClosedConfidence=0.62,
        torsoInclineDeg=13.1,
    )


class TestWebcamVoiceAgentHelpers(unittest.TestCase):
    def test_build_scene_summary_contains_core_fields(self) -> None:
        summary = build_scene_summary(
            _sample_signal(),
            person_down_status="likely",
            person_down_confidence=0.79,
            ready_for_compressions=True,
            target_locked=True,
        )
        self.assertIn("person_down=likely (0.79)", summary)
        self.assertIn("hand_placement=too_high (0.67)", summary)
        self.assertIn("bpm=104", summary)
        self.assertIn("compression_ready=yes", summary)
        self.assertIn("target_lock=locked", summary)

    def test_parse_response_text_prefers_output_text(self) -> None:
        payload = {"output_text": "Keep compressions steady at 100 to 120 BPM."}
        self.assertEqual(
            parse_response_text(payload),
            "Keep compressions steady at 100 to 120 BPM.",
        )

    def test_parse_response_text_reads_nested_blocks(self) -> None:
        payload = {
            "output": [
                {
                    "content": [
                        {"type": "output_text", "text": "Move hands slightly lower."},
                        {"type": "output_text", "text": "Continue compressions."},
                    ]
                }
            ]
        }
        self.assertEqual(
            parse_response_text(payload),
            "Move hands slightly lower. Continue compressions.",
        )

    def test_parse_gemini_text_reads_candidate_parts(self) -> None:
        payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "Keep compressions deep and steady."},
                            {"text": "Switch rescuers every 2 minutes if available."},
                        ]
                    }
                }
            ]
        }
        self.assertEqual(
            parse_gemini_text(payload),
            "Keep compressions deep and steady. Switch rescuers every 2 minutes if available.",
        )

    def test_data_url_to_inline_part_extracts_mime_and_data(self) -> None:
        inline_part = data_url_to_inline_part("data:image/jpeg;base64,abcd1234")
        self.assertEqual(
            inline_part,
            {"inline_data": {"mime_type": "image/jpeg", "data": "abcd1234"}},
        )


if __name__ == "__main__":
    unittest.main()
