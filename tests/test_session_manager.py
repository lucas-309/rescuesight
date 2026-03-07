import unittest

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


if __name__ == "__main__":
    unittest.main()
