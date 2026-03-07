from __future__ import annotations

import unittest

from hitl_flow import (
    NO_KEY,
    YES_KEY,
    HitlQuestionnaireSession,
    build_dispatch_questionnaire_from_responses,
    build_dispatch_request_payload,
)


class TestHitlFlow(unittest.TestCase):
    def test_build_dispatch_questionnaire_from_responses(self) -> None:
        questionnaire = build_dispatch_questionnaire_from_responses([False, False, True, True])
        self.assertEqual(questionnaire["responsiveness"], "unresponsive")
        self.assertEqual(questionnaire["breathing"], "abnormal_or_absent")
        self.assertEqual(questionnaire["pulse"], "unknown")
        self.assertEqual(questionnaire["severeBleeding"], False)
        self.assertEqual(questionnaire["majorTrauma"], False)
        notes = questionnaire["notes"]
        self.assertIsInstance(notes, str)
        self.assertIn("FAST signs observed", str(notes))
        self.assertIn("heart-related warning signs observed", str(notes))

    def test_build_dispatch_questionnaire_rejects_wrong_length(self) -> None:
        with self.assertRaises(ValueError):
            build_dispatch_questionnaire_from_responses([True, False, True])

    def test_build_dispatch_request_payload(self) -> None:
        questionnaire = build_dispatch_questionnaire_from_responses([True, True, False, False])
        payload = build_dispatch_request_payload(
            questionnaire=questionnaire,
            location={"label": "Main lobby", "latitude": 37.0, "longitude": -122.0},
            person_down_signal={"status": "person_down", "confidence": 0.91, "source": "cv"},
        )

        self.assertEqual(payload["questionnaire"], questionnaire)
        self.assertEqual(payload["location"]["label"], "Main lobby")
        self.assertEqual(payload["personDownSignal"]["status"], "person_down")
        self.assertEqual(payload["emergencyCallRequested"], True)

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
        self.assertEqual(session.completed_answers["responsiveness"], "responsive")
        self.assertEqual(session.completed_answers["breathing"], "abnormal_or_absent")
        notes = session.completed_answers["notes"]
        self.assertIsInstance(notes, str)
        self.assertIn("FAST signs observed", str(notes))

    def test_session_mark_submitted_clears_state(self) -> None:
        session = HitlQuestionnaireSession(cooldown_ms=0)
        session.start(timestamp_ms=0, status="manual")
        session.handle_key(YES_KEY, timestamp_ms=10)
        session.handle_key(YES_KEY, timestamp_ms=20)
        session.handle_key(NO_KEY, timestamp_ms=30)
        session.handle_key(NO_KEY, timestamp_ms=40)

        session.mark_submitted("ok", timestamp_ms=50)
        self.assertFalse(session.active)
        self.assertIsNone(session.completed_answers)
        self.assertEqual(session.step_index, 0)
        self.assertEqual(session.last_submitted_ms, 50)
        self.assertIsNone(session.last_submission_success)

    def test_session_mark_submitted_tracks_dashboard_confirmation(self) -> None:
        session = HitlQuestionnaireSession(cooldown_ms=0)
        session.mark_submitted(
            "Dashboard request queued (req-123).",
            timestamp_ms=200,
            submitted=True,
            request_id="req-123",
        )

        self.assertEqual(session.phase_label(), "REQUEST_SENT_TO_DASHBOARD")
        overlay = session.overlay_lines(api_enabled=True)
        self.assertTrue(any("REQUEST SENT TO DASHBOARD" in line for line in overlay))
        self.assertTrue(any("req-123" in line for line in overlay))


if __name__ == "__main__":
    unittest.main()
