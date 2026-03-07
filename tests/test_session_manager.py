import unittest
from datetime import datetime

from backend import SessionManager


class SessionManagerTests(unittest.TestCase):
    def test_start_session_initializes_required_fields(self) -> None:
        manager = SessionManager()

        incident = manager.start_session("  Demo Location  ")

        self.assertEqual(
            set(incident.keys()),
            {
                "incident_id",
                "start_time",
                "location",
                "current_state",
                "responsiveness_status",
                "breathing_status",
                "cpr_active",
                "cpr_started_time",
                "rhythm_status",
                "hand_position_status",
                "transcript",
                "timeline",
                "incident_summary",
            },
        )
        self.assertEqual(incident["current_state"], "SESSION_START")
        self.assertEqual(incident["location"], "Demo Location")
        self.assertEqual(incident["timeline"], [])
        self.assertEqual(incident["transcript"], [])
        self.assertFalse(incident["cpr_active"])

    def test_start_session_normalizes_empty_location(self) -> None:
        manager = SessionManager()

        incident = manager.start_session("   ")

        self.assertIsNone(incident["location"])

    def test_start_session_rejects_non_string_location(self) -> None:
        manager = SessionManager()

        with self.assertRaises(TypeError):
            manager.start_session(location=123)  # type: ignore[arg-type]

    def test_start_session_generates_unique_ids(self) -> None:
        manager = SessionManager()

        first = manager.start_session()
        second = manager.start_session()

        self.assertNotEqual(first["incident_id"], second["incident_id"])

    def test_start_session_uses_utc_iso_timestamp(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        self.assertTrue(incident["start_time"].endswith("Z"))
        parsed = datetime.fromisoformat(incident["start_time"].replace("Z", "+00:00"))
        self.assertIsNotNone(parsed.tzinfo)

    def test_get_session_rejects_empty_incident_id(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.get_session("")

    def test_get_session_returns_copy_not_internal_reference(self) -> None:
        manager = SessionManager()
        incident = manager.start_session("Lobby")

        incident["timeline"].append(
            {
                "event_type": "SESSION_STARTED",
                "timestamp": "2026-03-07T00:00:00Z",
                "data": {},
            }
        )

        stored = manager.get_session(incident["incident_id"])
        self.assertIsNotNone(stored)
        assert stored is not None
        self.assertEqual(stored["timeline"], [])

    def test_get_session_returns_none_for_unknown_incident(self) -> None:
        manager = SessionManager()
        self.assertIsNone(manager.get_session("missing-incident-id"))


if __name__ == "__main__":
    unittest.main()
