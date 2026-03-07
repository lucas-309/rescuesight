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
        self.assertEqual(len(incident["timeline"]), 1)
        self.assertEqual(incident["timeline"][0]["event_type"], "SESSION_STARTED")
        self.assertEqual(incident["timeline"][0]["data"]["current_state"], "SESSION_START")
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
        self.assertEqual(len(stored["timeline"]), 1)
        self.assertEqual(stored["timeline"][0]["event_type"], "SESSION_STARTED")

    def test_get_session_returns_none_for_unknown_incident(self) -> None:
        manager = SessionManager()
        self.assertIsNone(manager.get_session("missing-incident-id"))

    def test_log_event_appends_new_timeline_event(self) -> None:
        manager = SessionManager()
        incident = manager.start_session("Lobby")

        logged = manager.log_event(
            incident_id=incident["incident_id"],
            event_type="XR_SIGNAL_RECEIVED",
            data={"signal_type": "hand_position", "status": "correct"},
        )

        self.assertEqual(logged["event_type"], "XR_SIGNAL_RECEIVED")
        stored = manager.get_session(incident["incident_id"])
        assert stored is not None
        self.assertEqual(len(stored["timeline"]), 2)
        self.assertEqual(stored["timeline"][1]["event_type"], "XR_SIGNAL_RECEIVED")

    def test_log_event_rejects_invalid_event_type(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(ValueError):
            manager.log_event(
                incident_id=incident["incident_id"],
                event_type="BAD_EVENT",  # type: ignore[arg-type]
            )

    def test_log_event_rejects_non_mapping_data(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(TypeError):
            manager.log_event(
                incident_id=incident["incident_id"],
                event_type="STATE_CHANGED",
                data=["bad"],  # type: ignore[arg-type]
            )

    def test_log_event_rejects_non_string_data_keys(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(TypeError):
            manager.log_event(
                incident_id=incident["incident_id"],
                event_type="STATE_CHANGED",
                data={1: "bad-key"},  # type: ignore[dict-item]
            )

    def test_log_event_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.log_event(
                incident_id="unknown-id",
                event_type="STATE_CHANGED",
            )

    def test_log_event_protects_internal_data_from_external_mutation(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        payload = {"nested": {"value": 1}}

        logged = manager.log_event(
            incident_id=incident["incident_id"],
            event_type="STATE_CHANGED",
            data=payload,
        )

        payload["nested"]["value"] = 999
        logged["data"]["nested"]["value"] = -1  # type: ignore[index]

        stored = manager.get_session(incident["incident_id"])
        assert stored is not None
        self.assertEqual(stored["timeline"][1]["data"]["nested"]["value"], 1)

    def test_log_transcript_appends_agent_and_user_messages(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        agent_entry = manager.log_transcript(
            incident_id=incident["incident_id"],
            speaker="agent",
            message=" Start chest compressions now. ",
        )
        user_entry = manager.log_transcript(
            incident_id=incident["incident_id"],
            speaker="user",
            message="Okay, starting now.",
        )

        self.assertEqual(agent_entry["speaker"], "agent")
        self.assertEqual(agent_entry["message"], "Start chest compressions now.")
        self.assertEqual(user_entry["speaker"], "user")

        stored = manager.get_session(incident["incident_id"])
        assert stored is not None
        self.assertEqual(len(stored["transcript"]), 2)
        self.assertEqual(stored["transcript"][0]["speaker"], "agent")
        self.assertEqual(stored["transcript"][1]["speaker"], "user")

    def test_log_transcript_uses_utc_iso_timestamp_when_missing(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        entry = manager.log_transcript(
            incident_id=incident["incident_id"],
            speaker="agent",
            message="Check breathing.",
        )

        self.assertTrue(entry["timestamp"].endswith("Z"))
        parsed = datetime.fromisoformat(entry["timestamp"].replace("Z", "+00:00"))
        self.assertIsNotNone(parsed.tzinfo)

    def test_log_transcript_rejects_invalid_speaker(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(ValueError):
            manager.log_transcript(
                incident_id=incident["incident_id"],
                speaker="system",  # type: ignore[arg-type]
                message="Invalid speaker",
            )

    def test_log_transcript_rejects_non_string_speaker(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(TypeError):
            manager.log_transcript(
                incident_id=incident["incident_id"],
                speaker=123,  # type: ignore[arg-type]
                message="Invalid speaker",
            )

    def test_log_transcript_rejects_empty_message(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(ValueError):
            manager.log_transcript(
                incident_id=incident["incident_id"],
                speaker="agent",
                message="   ",
            )

    def test_log_transcript_rejects_non_string_message(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(TypeError):
            manager.log_transcript(
                incident_id=incident["incident_id"],
                speaker="agent",
                message=123,  # type: ignore[arg-type]
            )

    def test_log_transcript_rejects_non_string_timestamp(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(TypeError):
            manager.log_transcript(
                incident_id=incident["incident_id"],
                speaker="agent",
                message="Start compressions.",
                timestamp=123,  # type: ignore[arg-type]
            )

    def test_log_transcript_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.log_transcript(
                incident_id="unknown-id",
                speaker="agent",
                message="Start compressions.",
            )


if __name__ == "__main__":
    unittest.main()
