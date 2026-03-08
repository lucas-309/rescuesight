from __future__ import annotations

from typing import Any, Mapping, cast

from .contracts import (
    BREATHING_STATUSES,
    EVENT_TYPE_NAMES,
    HAND_POSITION_STATUSES,
    RESPONSIVENESS_STATUSES,
    RHYTHM_STATUSES,
    STATE_NAMES,
    Incident,
    TimelineEvent,
    TranscriptEntry,
)

INCIDENT_FIELD_NAMES: tuple[str, ...] = (
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
)

TRANSCRIPT_FIELD_NAMES: tuple[str, ...] = ("speaker", "message", "timestamp")
TIMELINE_EVENT_FIELD_NAMES: tuple[str, ...] = ("event_type", "timestamp", "data")


def normalize_location(location: str | None) -> str | None:
    if location is None:
        return None

    normalized = location.strip()
    return normalized if normalized else None


def build_incident_schema(
    *,
    incident_id: str,
    start_time: str,
    location: str | None,
) -> Incident:
    if not incident_id:
        raise ValueError("incident_id must be a non-empty string")
    if not start_time:
        raise ValueError("start_time must be a non-empty string")

    incident: Incident = {
        "incident_id": incident_id,
        "start_time": start_time,
        "location": normalize_location(location),
        "current_state": "SESSION_START",
        "responsiveness_status": None,
        "breathing_status": None,
        "cpr_active": False,
        "cpr_started_time": None,
        "rhythm_status": None,
        "hand_position_status": None,
        "transcript": [],
        "timeline": [],
        "incident_summary": None,
    }
    return incident


def _validate_transcript_entry(entry: Mapping[str, Any], index: int) -> None:
    if set(entry.keys()) != set(TRANSCRIPT_FIELD_NAMES):
        raise ValueError(f"transcript[{index}] must contain exactly {TRANSCRIPT_FIELD_NAMES}")
    if entry["speaker"] not in {"agent", "user"}:
        raise ValueError(f"transcript[{index}].speaker must be 'agent' or 'user'")
    if not isinstance(entry["message"], str):
        raise TypeError(f"transcript[{index}].message must be a string")
    if not isinstance(entry["timestamp"], str):
        raise TypeError(f"transcript[{index}].timestamp must be a string")


def _validate_timeline_event(event: Mapping[str, Any], index: int) -> None:
    if set(event.keys()) != set(TIMELINE_EVENT_FIELD_NAMES):
        raise ValueError(f"timeline[{index}] must contain exactly {TIMELINE_EVENT_FIELD_NAMES}")
    if event["event_type"] not in EVENT_TYPE_NAMES:
        raise ValueError(f"timeline[{index}].event_type must be one of {EVENT_TYPE_NAMES}")
    if not isinstance(event["timestamp"], str):
        raise TypeError(f"timeline[{index}].timestamp must be a string")
    if not isinstance(event["data"], dict):
        raise TypeError(f"timeline[{index}].data must be a dict")


def validate_incident_schema(incident: Mapping[str, Any]) -> Incident:
    if set(incident.keys()) != set(INCIDENT_FIELD_NAMES):
        raise ValueError(f"incident must contain exactly {INCIDENT_FIELD_NAMES}")

    if not isinstance(incident["incident_id"], str) or not incident["incident_id"]:
        raise TypeError("incident_id must be a non-empty string")
    if not isinstance(incident["start_time"], str) or not incident["start_time"]:
        raise TypeError("start_time must be a non-empty string")

    location = incident["location"]
    if location is not None and not isinstance(location, str):
        raise TypeError("location must be a string or None")

    if incident["current_state"] not in STATE_NAMES:
        raise ValueError(f"current_state must be one of {STATE_NAMES}")

    responsiveness_status = incident["responsiveness_status"]
    if responsiveness_status is not None and responsiveness_status not in RESPONSIVENESS_STATUSES:
        raise ValueError(
            f"responsiveness_status must be one of {RESPONSIVENESS_STATUSES} or None"
        )

    breathing_status = incident["breathing_status"]
    if breathing_status is not None and breathing_status not in BREATHING_STATUSES:
        raise ValueError(f"breathing_status must be one of {BREATHING_STATUSES} or None")

    if not isinstance(incident["cpr_active"], bool):
        raise TypeError("cpr_active must be a boolean")

    cpr_started_time = incident["cpr_started_time"]
    if cpr_started_time is not None and not isinstance(cpr_started_time, str):
        raise TypeError("cpr_started_time must be a string or None")

    rhythm_status = incident["rhythm_status"]
    if rhythm_status is not None and rhythm_status not in RHYTHM_STATUSES:
        raise ValueError(f"rhythm_status must be one of {RHYTHM_STATUSES} or None")

    hand_position_status = incident["hand_position_status"]
    if hand_position_status is not None and hand_position_status not in HAND_POSITION_STATUSES:
        raise ValueError(f"hand_position_status must be one of {HAND_POSITION_STATUSES} or None")

    transcript = incident["transcript"]
    if not isinstance(transcript, list):
        raise TypeError("transcript must be a list")
    for index, entry in enumerate(transcript):
        if not isinstance(entry, Mapping):
            raise TypeError(f"transcript[{index}] must be a mapping")
        _validate_transcript_entry(entry, index)

    timeline = incident["timeline"]
    if not isinstance(timeline, list):
        raise TypeError("timeline must be a list")
    for index, event in enumerate(timeline):
        if not isinstance(event, Mapping):
            raise TypeError(f"timeline[{index}] must be a mapping")
        _validate_timeline_event(event, index)

    incident_summary = incident["incident_summary"]
    if incident_summary is not None and not isinstance(incident_summary, str):
        raise TypeError("incident_summary must be a string or None")

    return cast(Incident, dict(incident))


def validate_transcript_entry(entry: Mapping[str, Any]) -> TranscriptEntry:
    _validate_transcript_entry(entry, 0)
    return cast(TranscriptEntry, dict(entry))


def validate_timeline_event(event: Mapping[str, Any]) -> TimelineEvent:
    _validate_timeline_event(event, 0)
    return cast(TimelineEvent, dict(event))
