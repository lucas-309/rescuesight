from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Mapping, cast
from uuid import uuid4

from .contracts import (
    EVENT_TYPE_NAMES,
    EventTypeName,
    Incident,
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

    def _build_event_payload(
        self,
        *,
        event_type: EventTypeName,
        data: Mapping[str, Any] | None,
        timestamp: str | None,
    ) -> TimelineEvent:
        if event_type not in EVENT_TYPE_NAMES:
            raise ValueError(f"event_type must be one of {EVENT_TYPE_NAMES}")

        if timestamp is None:
            normalized_timestamp = _utc_now_iso()
        elif not isinstance(timestamp, str):
            raise TypeError("timestamp must be a string or None")
        else:
            normalized_timestamp = timestamp.strip()
            if not normalized_timestamp:
                raise ValueError("timestamp must be a non-empty string")

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

        if timestamp is None:
            normalized_timestamp = _utc_now_iso()
        elif not isinstance(timestamp, str):
            raise TypeError("timestamp must be a string or None")
        else:
            normalized_timestamp = timestamp.strip()
            if not normalized_timestamp:
                raise ValueError("timestamp must be a non-empty string")

        payload: TranscriptEntry = {
            "speaker": speaker,
            "message": normalized_message,
            "timestamp": normalized_timestamp,
        }
        validate_transcript_entry(payload)
        return payload
