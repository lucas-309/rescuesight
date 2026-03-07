from __future__ import annotations

import unittest

from cv_signals import CVSignal
from hitl_flow import (
    NO_KEY,
    YES_KEY,
    HitlQuestionnaireSession,
    build_triage_answers_from_responses,
    build_xr_triage_payload,
)


def _sample_signal(timestamp_ms: int = 1234) -> CVSignal:
    return CVSignal(
        handPlacementStatus="correct",
        placementConfidence=0.9,
        compressionRateBpm=110,
        compressionRhythmQuality="good",
        visibility="full",
        frameTimestampMs=timestamp_ms,
    )


class TestHitlFlow(unittest.TestCase):
    def test_build_triage_answers_from_responses(self) -> None:
        answers = build_triage_answers_from_responses([False, False, True, True])
        self.assertFalse(answers["responsive"])
        self.assertFalse(answers["breathingNormal"])
        self.assertTrue(answers["strokeSigns"]["faceDrooping"])
        self.assertTrue(answers["heartRelatedSigns"]["chestDiscomfort"])
        self.assertFalse(answers["heartRelatedSigns"]["coldSweat"])

    def test_build_triage_answers_rejects_wrong_length(self) -> None:
        with self.assertRaises(ValueError):
            build_triage_answers_from_responses([True, False, True])

    def test_build_xr_triage_payload(self) -> None:
        signal = _sample_signal()
        answers = build_triage_answers_from_responses([True, True, False, False])
        payload = build_xr_triage_payload(
            answers=answers,
            signal=signal,
            acknowledged_checkpoints=["person_down_confirmed"],
            incident_id="inc_123",
        )

        self.assertEqual(payload["incidentId"], "inc_123")
        self.assertEqual(payload["answers"], answers)
        self.assertEqual(payload["cvSignal"]["handPlacementStatus"], "correct")
        self.assertEqual(payload["acknowledgedCheckpoints"], ["person_down_confirmed"])

    def test_session_auto_start_respects_cooldown(self) -> None:
        session = HitlQuestionnaireSession(cooldown_ms=1_000)

        self.assertTrue(session.maybe_start(person_down_possible=True, timestamp_ms=1_000))
        self.assertTrue(session.active)
        session.reset()
        self.assertFalse(session.maybe_start(person_down_possible=True, timestamp_ms=1_500))
        self.assertTrue(session.maybe_start(person_down_possible=True, timestamp_ms=2_100))

    def test_session_questionnaire_completion(self) -> None:
        session = HitlQuestionnaireSession(cooldown_ms=0)
        session.start(timestamp_ms=0, status="manual")

        self.assertFalse(session.handle_key(YES_KEY, timestamp_ms=10))
        self.assertFalse(session.handle_key(NO_KEY, timestamp_ms=20))
        self.assertFalse(session.handle_key(YES_KEY, timestamp_ms=30))
        self.assertTrue(session.handle_key(NO_KEY, timestamp_ms=40))

        self.assertFalse(session.active)
        self.assertIsNotNone(session.completed_answers)
        if session.completed_answers is None:
            self.fail("completed_answers should be available after final response")
        self.assertTrue(session.completed_answers["responsive"])
        self.assertFalse(session.completed_answers["breathingNormal"])
        self.assertTrue(session.completed_answers["strokeSigns"]["faceDrooping"])

    def test_session_mark_submitted_clears_state(self) -> None:
        session = HitlQuestionnaireSession(cooldown_ms=0)
        session.start(timestamp_ms=0, status="manual")
        session.handle_key(YES_KEY, timestamp_ms=10)
        session.handle_key(YES_KEY, timestamp_ms=20)
        session.handle_key(NO_KEY, timestamp_ms=30)
        session.handle_key(NO_KEY, timestamp_ms=40)

        session.mark_submitted("ok", timestamp_ms=50, incident_id="inc_999")
        self.assertFalse(session.active)
        self.assertIsNone(session.completed_answers)
        self.assertEqual(session.step_index, 0)
        self.assertEqual(session.incident_id, "inc_999")
        self.assertEqual(session.last_submitted_ms, 50)


if __name__ == "__main__":
    unittest.main()
