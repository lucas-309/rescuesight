from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Mapping, cast
from uuid import uuid4

from .contracts import (
    BREATHING_STATUSES,
    EVENT_TYPE_NAMES,
    EventTypeName,
    Incident,
    StateName,
    ResponsivenessStatus,
    BreathingStatus,
    RESPONSIVENESS_STATUSES,
    Speaker,
    TimelineEvent,
    TranscriptEntry,
)
from .incident_schema import (
    build_incident_schema,
    validate_incident_schema,
    validate_timeline_event,
    validate_transcript_entry,
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


_NORMALIZED_RESPONSE_FIELD_ALIASES: dict[str, str] = {
    "responsiveness": "responsiveness_status",
    "responsiveness status": "responsiveness_status",
    "responsiveness_status": "responsiveness_status",
    "breathing": "breathing_status",
    "breathing status": "breathing_status",
    "breathing_status": "breathing_status",
}

_RESPONSIVENESS_VALUE_ALIASES: dict[str, ResponsivenessStatus] = {
    "responsive": "responsive",
    "awake": "responsive",
    "conscious": "responsive",
    "yes": "responsive",
    "y": "responsive",
    "unresponsive": "unresponsive",
    "not responsive": "unresponsive",
    "no response": "unresponsive",
    "unconscious": "unresponsive",
    "no": "unresponsive",
    "n": "unresponsive",
    "not sure": "not_sure",
    "unsure": "not_sure",
    "unknown": "not_sure",
    "idk": "not_sure",
}

_BREATHING_VALUE_ALIASES: dict[str, BreathingStatus] = {
    "normal": "normal",
    "breathing": "normal",
    "breathing normally": "normal",
    "yes": "normal",
    "y": "normal",
    "abnormal or absent": "abnormal_or_absent",
    "abnormal": "abnormal_or_absent",
    "absent": "abnormal_or_absent",
    "not breathing": "abnormal_or_absent",
    "gasping": "abnormal_or_absent",
    "agonal": "abnormal_or_absent",
    "no": "abnormal_or_absent",
    "n": "abnormal_or_absent",
    "not sure": "not_sure",
    "unsure": "not_sure",
    "unknown": "not_sure",
    "idk": "not_sure",
}


def _normalize_token(value: str) -> str:
    return " ".join(value.strip().lower().replace("_", " ").replace("-", " ").split())


class SessionManager:
    def __init__(self) -> None:
        self._incidents: dict[str, Incident] = {}
        self._lock = Lock()

    def start_session(self, location: str | None = None) -> Incident:
        if location is not None and not isinstance(location, str):
            raise TypeError("location must be a string or None")

        incident = build_incident_schema(
            incident_id=str(uuid4()),
            start_time=_utc_now_iso(),
            location=location,
        )
        incident["timeline"].append(
            self._build_event_payload(
                event_type="SESSION_STARTED",
                data={"current_state": incident["current_state"]},
                timestamp=incident["start_time"],
            )
        )
        validate_incident_schema(incident)

        with self._lock:
            self._incidents[incident["incident_id"]] = deepcopy(incident)

        return deepcopy(incident)

    def get_session(self, incident_id: str) -> Incident | None:
        if not isinstance(incident_id, str) or not incident_id.strip():
            raise ValueError("incident_id must be a non-empty string")

        with self._lock:
            incident = self._incidents.get(incident_id)

        return deepcopy(incident) if incident is not None else None

    def log_event(
        self,
        *,
        incident_id: str,
        event_type: EventTypeName,
        data: Mapping[str, Any] | None = None,
        timestamp: str | None = None,
    ) -> TimelineEvent:
        if not isinstance(incident_id, str) or not incident_id.strip():
            raise ValueError("incident_id must be a non-empty string")

        event_payload = self._build_event_payload(
            event_type=event_type,
            data=data,
            timestamp=timestamp,
        )

        with self._lock:
            incident = self._incidents.get(incident_id)
            if incident is None:
                raise ValueError(f"incident_id '{incident_id}' was not found")

            incident["timeline"].append(deepcopy(event_payload))
            validate_incident_schema(incident)

        return deepcopy(event_payload)

    def log_transcript(
        self,
        *,
        incident_id: str,
        speaker: Speaker,
        message: str,
        timestamp: str | None = None,
    ) -> TranscriptEntry:
        if not isinstance(incident_id, str) or not incident_id.strip():
            raise ValueError("incident_id must be a non-empty string")

        entry_payload = self._build_transcript_payload(
            speaker=speaker,
            message=message,
            timestamp=timestamp,
        )

        with self._lock:
            incident = self._incidents.get(incident_id)
            if incident is None:
                raise ValueError(f"incident_id '{incident_id}' was not found")

            incident["transcript"].append(deepcopy(entry_payload))
            validate_incident_schema(incident)

        return deepcopy(entry_payload)

    def record_user_response(
        self,
        *,
        incident_id: str,
        response_field: str,
        response_value: str,
        user_message: str | None = None,
        timestamp: str | None = None,
    ) -> Incident:
        if not isinstance(incident_id, str) or not incident_id.strip():
            raise ValueError("incident_id must be a non-empty string")
        if not isinstance(response_field, str):
            raise TypeError("response_field must be a string")
        if not isinstance(response_value, str):
            raise TypeError("response_value must be a string")

        normalized_field = self._normalize_response_field(response_field)
        canonical_value = self._normalize_response_value(normalized_field, response_value)
        normalized_timestamp = self._normalize_timestamp(timestamp)

        if user_message is None:
            transcript_message = response_value.strip() or canonical_value
        elif not isinstance(user_message, str):
            raise TypeError("user_message must be a string or None")
        else:
            transcript_message = user_message.strip()
            if not transcript_message:
                raise ValueError("user_message must be a non-empty string when provided")

        transcript_payload = self._build_transcript_payload(
            speaker="user",
            message=transcript_message,
            timestamp=normalized_timestamp,
        )

        with self._lock:
            incident = self._incidents.get(incident_id)
            if incident is None:
                raise ValueError(f"incident_id '{incident_id}' was not found")

            if normalized_field == "responsiveness_status":
                previous_value = incident["responsiveness_status"]
                incident["responsiveness_status"] = cast(ResponsivenessStatus, canonical_value)
            else:
                previous_value = incident["breathing_status"]
                incident["breathing_status"] = cast(BreathingStatus, canonical_value)

            event_payload = self._build_event_payload(
                event_type="USER_RESPONSE_RECORDED",
                data={
                    "field": normalized_field,
                    "value": canonical_value,
                    "previous_value": previous_value,
                },
                timestamp=normalized_timestamp,
            )
            incident["transcript"].append(deepcopy(transcript_payload))
            incident["timeline"].append(deepcopy(event_payload))
            self._apply_protocol_state_transition(
                incident,
                timestamp=normalized_timestamp,
                trigger=f"user_response:{normalized_field}",
            )
            validate_incident_schema(incident)
            snapshot = deepcopy(incident)

        return snapshot

    def advance_protocol_state(
        self,
        *,
        incident_id: str,
        timestamp: str | None = None,
    ) -> Incident:
        if not isinstance(incident_id, str) or not incident_id.strip():
            raise ValueError("incident_id must be a non-empty string")

        normalized_timestamp = self._normalize_timestamp(timestamp)

        with self._lock:
            incident = self._incidents.get(incident_id)
            if incident is None:
                raise ValueError(f"incident_id '{incident_id}' was not found")

            self._apply_protocol_state_transition(
                incident,
                timestamp=normalized_timestamp,
                trigger="protocol_refresh",
            )
            validate_incident_schema(incident)
            snapshot = deepcopy(incident)

        return snapshot

    def start_cpr(
        self,
        *,
        incident_id: str,
        timestamp: str | None = None,
    ) -> Incident:
        if not isinstance(incident_id, str) or not incident_id.strip():
            raise ValueError("incident_id must be a non-empty string")

        normalized_timestamp = self._normalize_timestamp(timestamp)

        with self._lock:
            incident = self._incidents.get(incident_id)
            if incident is None:
                raise ValueError(f"incident_id '{incident_id}' was not found")

            self._apply_protocol_state_transition(
                incident,
                timestamp=normalized_timestamp,
                trigger="pre_cpr_start_refresh",
            )

            if incident["cpr_active"]:
                return deepcopy(incident)

            if incident["current_state"] != "CPR_INSTRUCTIONS":
                raise ValueError(
                    "CPR can only be started when current_state is CPR_INSTRUCTIONS"
                )

            incident["cpr_active"] = True
            if incident["cpr_started_time"] is None:
                incident["cpr_started_time"] = normalized_timestamp
            incident["timeline"].append(
                self._build_event_payload(
                    event_type="CPR_STARTED",
                    data={"previous_state": "CPR_INSTRUCTIONS"},
                    timestamp=normalized_timestamp,
                )
            )
            self._apply_protocol_state_transition(
                incident,
                timestamp=normalized_timestamp,
                trigger="cpr_started",
            )
            validate_incident_schema(incident)
            snapshot = deepcopy(incident)

        return snapshot

    def stop_cpr(
        self,
        *,
        incident_id: str,
        breathing_detected: bool = False,
        timestamp: str | None = None,
    ) -> Incident:
        if not isinstance(incident_id, str) or not incident_id.strip():
            raise ValueError("incident_id must be a non-empty string")
        if not isinstance(breathing_detected, bool):
            raise TypeError("breathing_detected must be a boolean")

        normalized_timestamp = self._normalize_timestamp(timestamp)

        with self._lock:
            incident = self._incidents.get(incident_id)
            if incident is None:
                raise ValueError(f"incident_id '{incident_id}' was not found")
            if not incident["cpr_active"]:
                raise ValueError("CPR is not currently active")

            previous_state = incident["current_state"]
            incident["cpr_active"] = False
            incident["timeline"].append(
                self._build_event_payload(
                    event_type="CPR_STOPPED",
                    data={"previous_state": previous_state},
                    timestamp=normalized_timestamp,
                )
            )

            if breathing_detected:
                incident["breathing_status"] = "normal"
                incident["timeline"].append(
                    self._build_event_payload(
                        event_type="PATIENT_BREATHING_DETECTED",
                        data={"source": "manual"},
                        timestamp=normalized_timestamp,
                    )
                )

            self._apply_protocol_state_transition(
                incident,
                timestamp=normalized_timestamp,
                trigger="cpr_stopped",
            )
            validate_incident_schema(incident)
            snapshot = deepcopy(incident)

        return snapshot

    def _build_event_payload(
        self,
        *,
        event_type: EventTypeName,
        data: Mapping[str, Any] | None,
        timestamp: str | None,
    ) -> TimelineEvent:
        if event_type not in EVENT_TYPE_NAMES:
            raise ValueError(f"event_type must be one of {EVENT_TYPE_NAMES}")

        normalized_timestamp = self._normalize_timestamp(timestamp)

        if data is None:
            normalized_data: dict[str, object] = {}
        elif not isinstance(data, Mapping):
            raise TypeError("data must be a mapping or None")
        else:
            normalized_data = {}
            for key, value in data.items():
                if not isinstance(key, str):
                    raise TypeError("data keys must be strings")
                normalized_data[key] = cast(object, deepcopy(value))

        payload: TimelineEvent = {
            "event_type": event_type,
            "timestamp": normalized_timestamp,
            "data": normalized_data,
        }
        validate_timeline_event(payload)
        return payload

    def _build_transcript_payload(
        self,
        *,
        speaker: Speaker,
        message: str,
        timestamp: str | None,
    ) -> TranscriptEntry:
        if not isinstance(speaker, str):
            raise TypeError("speaker must be a string")
        if speaker not in {"agent", "user"}:
            raise ValueError("speaker must be 'agent' or 'user'")

        if not isinstance(message, str):
            raise TypeError("message must be a string")
        normalized_message = message.strip()
        if not normalized_message:
            raise ValueError("message must be a non-empty string")

        normalized_timestamp = self._normalize_timestamp(timestamp)

        payload: TranscriptEntry = {
            "speaker": speaker,
            "message": normalized_message,
            "timestamp": normalized_timestamp,
        }
        validate_transcript_entry(payload)
        return payload

    def _normalize_timestamp(self, timestamp: str | None) -> str:
        if timestamp is None:
            return _utc_now_iso()
        if not isinstance(timestamp, str):
            raise TypeError("timestamp must be a string or None")
        normalized_timestamp = timestamp.strip()
        if not normalized_timestamp:
            raise ValueError("timestamp must be a non-empty string")
        return normalized_timestamp

    def _normalize_response_field(self, response_field: str) -> str:
        normalized_field_token = _normalize_token(response_field)
        normalized_field = _NORMALIZED_RESPONSE_FIELD_ALIASES.get(normalized_field_token)
        if normalized_field is None:
            raise ValueError(
                "response_field must target responsiveness or breathing status "
                f"(accepted: {tuple(_NORMALIZED_RESPONSE_FIELD_ALIASES.keys())})"
            )
        return normalized_field

    def _normalize_response_value(self, normalized_field: str, response_value: str) -> str:
        normalized_value_token = _normalize_token(response_value)
        if not normalized_value_token:
            raise ValueError("response_value must be a non-empty string")

        if normalized_field == "responsiveness_status":
            canonical_value = _RESPONSIVENESS_VALUE_ALIASES.get(normalized_value_token)
            if canonical_value is None:
                raise ValueError(
                    "invalid responsiveness response_value; supported values map to "
                    f"{RESPONSIVENESS_STATUSES}"
                )
            return canonical_value

        canonical_value = _BREATHING_VALUE_ALIASES.get(normalized_value_token)
        if canonical_value is None:
            raise ValueError(
                "invalid breathing response_value; supported values map to "
                f"{BREATHING_STATUSES}"
            )
        return canonical_value

    def _apply_protocol_state_transition(
        self,
        incident: Incident,
        *,
        timestamp: str,
        trigger: str,
    ) -> None:
        next_state = self._derive_protocol_state(incident)
        previous_state = incident["current_state"]
        if next_state == previous_state:
            return

        incident["current_state"] = next_state
        incident["timeline"].append(
            self._build_event_payload(
                event_type="STATE_CHANGED",
                data={
                    "previous_state": previous_state,
                    "new_state": next_state,
                    "trigger": trigger,
                },
                timestamp=timestamp,
            )
        )

    def _derive_protocol_state(self, incident: Incident) -> StateName:
        current_state = incident["current_state"]
        if current_state == "SESSION_END":
            return "SESSION_END"

        if incident["cpr_active"]:
            return "CPR_ACTIVE"

        responsiveness_status = incident["responsiveness_status"]
        breathing_status = incident["breathing_status"]

        if responsiveness_status is None:
            return "RESPONSIVENESS_CHECK"

        if responsiveness_status == "responsive":
            return "WAIT_FOR_EMS"

        if breathing_status is None:
            return "BREATHING_CHECK"
        if breathing_status == "abnormal_or_absent":
            return "CPR_INSTRUCTIONS"
        return "REASSESSMENT"
