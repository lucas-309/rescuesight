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

    def test_record_user_response_updates_responsiveness_and_logs_both_channels(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        updated = manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="YES",
        )

        self.assertEqual(updated["responsiveness_status"], "responsive")
        self.assertEqual(len(updated["transcript"]), 1)
        self.assertEqual(updated["transcript"][0]["speaker"], "user")
        self.assertEqual(updated["transcript"][0]["message"], "YES")
        self.assertEqual(len(updated["timeline"]), 3)
        self.assertEqual(updated["timeline"][1]["event_type"], "USER_RESPONSE_RECORDED")
        self.assertEqual(updated["timeline"][1]["data"]["field"], "responsiveness_status")
        self.assertEqual(updated["timeline"][1]["data"]["value"], "responsive")
        self.assertIsNone(updated["timeline"][1]["data"]["previous_value"])
        self.assertEqual(updated["timeline"][2]["event_type"], "STATE_CHANGED")
        self.assertEqual(updated["timeline"][2]["data"]["new_state"], "WAIT_FOR_EMS")
        self.assertEqual(updated["current_state"], "WAIT_FOR_EMS")

    def test_record_user_response_normalizes_breathing_value_and_message_override(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        updated = manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing_status",
            response_value="gasping",
            user_message="They are gasping.",
            timestamp="2026-03-07T00:00:11Z",
        )

        self.assertEqual(updated["breathing_status"], "abnormal_or_absent")
        self.assertEqual(updated["transcript"][0]["message"], "They are gasping.")
        self.assertEqual(updated["transcript"][0]["timestamp"], "2026-03-07T00:00:11Z")
        self.assertEqual(updated["timeline"][1]["timestamp"], "2026-03-07T00:00:11Z")

    def test_record_user_response_tracks_previous_value(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="unknown",
        )

        updated = manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="normal",
        )
        self.assertEqual(updated["timeline"][3]["data"]["previous_value"], "not_sure")
        self.assertEqual(updated["timeline"][3]["data"]["value"], "normal")

    def test_record_user_response_rejects_unknown_field(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(ValueError):
            manager.record_user_response(
                incident_id=incident["incident_id"],
                response_field="pulse",
                response_value="present",
            )

    def test_record_user_response_rejects_unknown_value_for_field(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(ValueError):
            manager.record_user_response(
                incident_id=incident["incident_id"],
                response_field="responsiveness",
                response_value="present",
            )

    def test_record_user_response_rejects_non_string_response_value(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(TypeError):
            manager.record_user_response(
                incident_id=incident["incident_id"],
                response_field="breathing",
                response_value=1,  # type: ignore[arg-type]
            )

    def test_record_user_response_rejects_invalid_user_message(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(ValueError):
            manager.record_user_response(
                incident_id=incident["incident_id"],
                response_field="breathing",
                response_value="normal",
                user_message="   ",
            )

    def test_record_user_response_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.record_user_response(
                incident_id="missing-id",
                response_field="breathing",
                response_value="normal",
            )

    def test_record_user_response_returns_deep_copy(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        updated = manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="normal",
        )
        updated["timeline"][1]["data"]["value"] = "tampered"  # type: ignore[index]
        updated["transcript"][0]["message"] = "tampered"

        stored = manager.get_session(incident["incident_id"])
        assert stored is not None
        self.assertEqual(stored["timeline"][1]["data"]["value"], "normal")
        self.assertEqual(stored["transcript"][0]["message"], "normal")

    def test_advance_protocol_state_moves_from_session_start(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        updated = manager.advance_protocol_state(
            incident_id=incident["incident_id"],
            timestamp="2026-03-07T00:00:01Z",
        )

        self.assertEqual(updated["current_state"], "RESPONSIVENESS_CHECK")
        self.assertEqual(updated["timeline"][1]["event_type"], "STATE_CHANGED")
        self.assertEqual(updated["timeline"][1]["data"]["previous_state"], "SESSION_START")
        self.assertEqual(updated["timeline"][1]["data"]["new_state"], "RESPONSIVENESS_CHECK")

    def test_advance_protocol_state_is_idempotent_when_state_does_not_change(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        first = manager.advance_protocol_state(incident_id=incident["incident_id"])
        second = manager.advance_protocol_state(incident_id=incident["incident_id"])

        self.assertEqual(first["current_state"], "RESPONSIVENESS_CHECK")
        self.assertEqual(second["current_state"], "RESPONSIVENESS_CHECK")
        self.assertEqual(len(first["timeline"]), 2)
        self.assertEqual(len(second["timeline"]), 2)

    def test_advance_protocol_state_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.advance_protocol_state(incident_id="missing-id")

    def test_record_user_response_unresponsive_then_abnormal_advances_to_cpr_instructions(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="unresponsive",
        )

        updated = manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="abnormal",
        )

        self.assertEqual(updated["current_state"], "CPR_INSTRUCTIONS")
        self.assertEqual(updated["breathing_status"], "abnormal_or_absent")
        self.assertEqual(updated["timeline"][-1]["event_type"], "STATE_CHANGED")
        self.assertEqual(updated["timeline"][-1]["data"]["new_state"], "CPR_INSTRUCTIONS")

    def test_record_user_response_out_of_order_breathing_keeps_responsiveness_check(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        updated = manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="normal",
        )

        self.assertEqual(updated["current_state"], "RESPONSIVENESS_CHECK")

    def test_responsive_status_keeps_wait_for_ems_even_if_breathing_updates(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="responsive",
        )

        updated = manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="abnormal",
        )

        self.assertEqual(updated["current_state"], "WAIT_FOR_EMS")

    def test_start_cpr_requires_cpr_instructions_state(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(ValueError):
            manager.start_cpr(incident_id=incident["incident_id"])

    def test_start_cpr_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.start_cpr(incident_id="missing-id")

    def test_start_cpr_moves_to_active_and_sets_started_time(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="unresponsive",
        )
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="not breathing",
        )

        updated = manager.start_cpr(
            incident_id=incident["incident_id"],
            timestamp="2026-03-07T00:00:20Z",
        )

        self.assertTrue(updated["cpr_active"])
        self.assertEqual(updated["cpr_started_time"], "2026-03-07T00:00:20Z")
        self.assertEqual(updated["current_state"], "CPR_ACTIVE")
        self.assertEqual(updated["timeline"][-2]["event_type"], "CPR_STARTED")
        self.assertEqual(updated["timeline"][-1]["event_type"], "STATE_CHANGED")
        self.assertEqual(updated["timeline"][-1]["data"]["new_state"], "CPR_ACTIVE")

    def test_start_cpr_is_idempotent_when_already_active(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="unresponsive",
        )
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="absent",
        )
        first = manager.start_cpr(incident_id=incident["incident_id"])
        second = manager.start_cpr(incident_id=incident["incident_id"])

        self.assertEqual(first["current_state"], "CPR_ACTIVE")
        self.assertEqual(second["current_state"], "CPR_ACTIVE")
        self.assertEqual(len(first["timeline"]), len(second["timeline"]))

    def test_stop_cpr_requires_active_cpr(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(ValueError):
            manager.stop_cpr(incident_id=incident["incident_id"])

    def test_stop_cpr_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.stop_cpr(incident_id="missing-id")

    def test_stop_cpr_with_breathing_detected_moves_to_reassessment(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="unresponsive",
        )
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="abnormal",
        )
        manager.start_cpr(incident_id=incident["incident_id"])

        updated = manager.stop_cpr(
            incident_id=incident["incident_id"],
            breathing_detected=True,
            timestamp="2026-03-07T00:00:40Z",
        )

        self.assertFalse(updated["cpr_active"])
        self.assertEqual(updated["breathing_status"], "normal")
        self.assertEqual(updated["current_state"], "REASSESSMENT")
        self.assertEqual(updated["timeline"][-3]["event_type"], "CPR_STOPPED")
        self.assertEqual(updated["timeline"][-2]["event_type"], "PATIENT_BREATHING_DETECTED")
        self.assertEqual(updated["timeline"][-1]["event_type"], "STATE_CHANGED")

    def test_stop_cpr_rejects_non_boolean_breathing_detected(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="unresponsive",
        )
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="abnormal",
        )
        manager.start_cpr(incident_id=incident["incident_id"])

        with self.assertRaises(TypeError):
            manager.stop_cpr(
                incident_id=incident["incident_id"],
                breathing_detected="yes",  # type: ignore[arg-type]
            )

    def test_begin_reassessment_transitions_to_reassessment_state(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="unresponsive",
        )
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="abnormal",
        )
        manager.start_cpr(incident_id=incident["incident_id"])

        updated = manager.begin_reassessment(
            incident_id=incident["incident_id"],
            timestamp="2026-03-07T00:01:00Z",
        )

        self.assertFalse(updated["cpr_active"])
        self.assertEqual(updated["breathing_status"], "not_sure")
        self.assertEqual(updated["current_state"], "REASSESSMENT")
        self.assertEqual(updated["timeline"][-2]["event_type"], "CPR_STOPPED")
        self.assertEqual(updated["timeline"][-1]["event_type"], "STATE_CHANGED")

    def test_begin_reassessment_rejects_invalid_state(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        with self.assertRaises(ValueError):
            manager.begin_reassessment(incident_id=incident["incident_id"])

    def test_begin_reassessment_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.begin_reassessment(incident_id="missing-id")

    def test_get_next_instruction_context_returns_responsiveness_prompt(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()

        context = manager.get_next_instruction_context(
            incident_id=incident["incident_id"],
            timestamp="2026-03-07T00:00:02Z",
        )

        self.assertEqual(context["current_state"], "RESPONSIVENESS_CHECK")
        self.assertEqual(context["expected_response_field"], "responsiveness_status")
        self.assertEqual(
            context["allowed_responses"],
            ["responsive", "unresponsive", "not_sure"],
        )
        self.assertEqual(context["next_action"], "record_user_response")

    def test_get_next_instruction_context_for_cpr_instructions(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="unresponsive",
        )
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="abnormal",
        )

        context = manager.get_next_instruction_context(incident_id=incident["incident_id"])
        self.assertEqual(context["current_state"], "CPR_INSTRUCTIONS")
        self.assertEqual(context["next_action"], "start_cpr")
        self.assertIsNone(context["expected_response_field"])

    def test_get_next_instruction_context_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.get_next_instruction_context(incident_id="missing-id")

    def test_generate_incident_summary_persists_summary_and_event(self) -> None:
        manager = SessionManager()
        incident = manager.start_session("Main Hall")
        manager.log_transcript(
            incident_id=incident["incident_id"],
            speaker="agent",
            message="Check responsiveness.",
        )
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="unresponsive",
        )

        updated = manager.generate_incident_summary(
            incident_id=incident["incident_id"],
            timestamp="2026-03-07T00:02:00Z",
        )

        self.assertIsNotNone(updated["incident_summary"])
        assert updated["incident_summary"] is not None
        self.assertIn("Incident ", updated["incident_summary"])
        self.assertIn("location=Main Hall", updated["incident_summary"])
        self.assertEqual(updated["timeline"][-1]["event_type"], "INCIDENT_SUMMARY_GENERATED")
        self.assertFalse(updated["timeline"][-1]["data"]["finalized"])

    def test_generate_incident_summary_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.generate_incident_summary(incident_id="missing-id")

    def test_finalize_session_sets_terminal_state_and_summary(self) -> None:
        manager = SessionManager()
        incident = manager.start_session("Lobby")
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="responsiveness",
            response_value="unresponsive",
        )
        manager.record_user_response(
            incident_id=incident["incident_id"],
            response_field="breathing",
            response_value="abnormal",
        )
        manager.start_cpr(incident_id=incident["incident_id"])

        updated = manager.finalize_session(
            incident_id=incident["incident_id"],
            timestamp="2026-03-07T00:03:00Z",
        )

        self.assertEqual(updated["current_state"], "SESSION_END")
        self.assertFalse(updated["cpr_active"])
        self.assertIsNotNone(updated["incident_summary"])
        assert updated["incident_summary"] is not None
        self.assertIn("state=SESSION_END", updated["incident_summary"])
        self.assertEqual(updated["timeline"][-1]["event_type"], "INCIDENT_SUMMARY_GENERATED")
        self.assertTrue(updated["timeline"][-1]["data"]["finalized"])

    def test_finalize_session_is_idempotent_for_terminal_state_transition(self) -> None:
        manager = SessionManager()
        incident = manager.start_session()
        first = manager.finalize_session(incident_id=incident["incident_id"])
        second = manager.finalize_session(incident_id=incident["incident_id"])

        first_state_changed_count = len(
            [event for event in first["timeline"] if event["event_type"] == "STATE_CHANGED"]
        )
        second_state_changed_count = len(
            [event for event in second["timeline"] if event["event_type"] == "STATE_CHANGED"]
        )

        self.assertEqual(first["current_state"], "SESSION_END")
        self.assertEqual(second["current_state"], "SESSION_END")
        self.assertEqual(first_state_changed_count, 1)
        self.assertEqual(second_state_changed_count, 1)
        self.assertEqual(
            len([event for event in second["timeline"] if event["event_type"] == "INCIDENT_SUMMARY_GENERATED"]),
            2,
        )

    def test_finalize_session_rejects_unknown_incident(self) -> None:
        manager = SessionManager()

        with self.assertRaises(ValueError):
            manager.finalize_session(incident_id="missing-id")


if __name__ == "__main__":
    unittest.main()
