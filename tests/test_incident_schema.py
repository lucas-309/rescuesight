import unittest

from backend import (
    INCIDENT_FIELD_NAMES,
    build_incident_schema,
    validate_incident_schema,
)


class IncidentSchemaTests(unittest.TestCase):
    def test_build_incident_schema_contains_exact_fields(self) -> None:
        incident = build_incident_schema(
            incident_id="abc-123",
            start_time="2026-03-07T00:00:00Z",
            location="  Main Hall  ",
        )

        self.assertEqual(set(incident.keys()), set(INCIDENT_FIELD_NAMES))
        self.assertEqual(incident["location"], "Main Hall")
        self.assertEqual(incident["current_state"], "SESSION_START")

    def test_validate_incident_schema_rejects_invalid_current_state(self) -> None:
        incident = build_incident_schema(
            incident_id="abc-123",
            start_time="2026-03-07T00:00:00Z",
            location=None,
        )
        incident["current_state"] = "INVALID_STATE"  # type: ignore[assignment]

        with self.assertRaises(ValueError):
            validate_incident_schema(incident)

    def test_validate_incident_schema_rejects_invalid_event_type(self) -> None:
        incident = build_incident_schema(
            incident_id="abc-123",
            start_time="2026-03-07T00:00:00Z",
            location=None,
        )
        incident["timeline"].append(
            {
                "event_type": "BAD_EVENT",
                "timestamp": "2026-03-07T00:00:00Z",
                "data": {},
            }  # type: ignore[list-item]
        )

        with self.assertRaises(ValueError):
            validate_incident_schema(incident)

    def test_validate_incident_schema_rejects_invalid_responsiveness_status(self) -> None:
        incident = build_incident_schema(
            incident_id="abc-123",
            start_time="2026-03-07T00:00:00Z",
            location=None,
        )
        incident["responsiveness_status"] = "unknown"  # type: ignore[assignment]

        with self.assertRaises(ValueError):
            validate_incident_schema(incident)

    def test_validate_incident_schema_rejects_invalid_breathing_status(self) -> None:
        incident = build_incident_schema(
            incident_id="abc-123",
            start_time="2026-03-07T00:00:00Z",
            location=None,
        )
        incident["breathing_status"] = "labored"  # type: ignore[assignment]

        with self.assertRaises(ValueError):
            validate_incident_schema(incident)

    def test_validate_incident_schema_accepts_valid_payload(self) -> None:
        incident = build_incident_schema(
            incident_id="abc-123",
            start_time="2026-03-07T00:00:00Z",
            location=None,
        )
        incident["responsiveness_status"] = "not_sure"
        incident["breathing_status"] = "normal"
        incident["timeline"].append(
            {
                "event_type": "SESSION_STARTED",
                "timestamp": "2026-03-07T00:00:00Z",
                "data": {},
            }
        )
        incident["transcript"].append(
            {
                "speaker": "agent",
                "message": "Start CPR now.",
                "timestamp": "2026-03-07T00:00:05Z",
            }
        )

        validated = validate_incident_schema(incident)
        self.assertEqual(validated["incident_id"], "abc-123")


if __name__ == "__main__":
    unittest.main()
