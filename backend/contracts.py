from __future__ import annotations

from typing import Literal, TypedDict

StateName = Literal[
    "SESSION_START",
    "RESPONSIVENESS_CHECK",
    "BREATHING_CHECK",
    "CPR_INSTRUCTIONS",
    "CPR_ACTIVE",
    "REASSESSMENT",
    "WAIT_FOR_EMS",
    "SESSION_END",
]

EventTypeName = Literal[
    "SESSION_STARTED",
    "STATE_CHANGED",
    "USER_RESPONSE_RECORDED",
    "CPR_STARTED",
    "CPR_STOPPED",
    "PATIENT_BREATHING_DETECTED",
    "XR_SIGNAL_RECEIVED",
    "RHYTHM_FEEDBACK_GENERATED",
    "ERROR_OCCURRED",
    "INCIDENT_SUMMARY_GENERATED",
]

ToolName = Literal[
    "get_location",
    "log_event",
    "update_incident_status",
    "record_user_response",
    "generate_incident_summary",
]

XrSignalType = Literal["hand_position", "compression_rhythm"]
HandPositionStatus = Literal["correct", "incorrect", "not_detected"]
RhythmStatus = Literal["slow", "good", "fast"]
Speaker = Literal["agent", "user"]

STATE_NAMES: tuple[StateName, ...] = (
    "SESSION_START",
    "RESPONSIVENESS_CHECK",
    "BREATHING_CHECK",
    "CPR_INSTRUCTIONS",
    "CPR_ACTIVE",
    "REASSESSMENT",
    "WAIT_FOR_EMS",
    "SESSION_END",
)

EVENT_TYPE_NAMES: tuple[EventTypeName, ...] = (
    "SESSION_STARTED",
    "STATE_CHANGED",
    "USER_RESPONSE_RECORDED",
    "CPR_STARTED",
    "CPR_STOPPED",
    "PATIENT_BREATHING_DETECTED",
    "XR_SIGNAL_RECEIVED",
    "RHYTHM_FEEDBACK_GENERATED",
    "ERROR_OCCURRED",
    "INCIDENT_SUMMARY_GENERATED",
)

TOOL_NAMES: tuple[ToolName, ...] = (
    "get_location",
    "log_event",
    "update_incident_status",
    "record_user_response",
    "generate_incident_summary",
)

XR_SIGNAL_TYPES: tuple[XrSignalType, ...] = ("hand_position", "compression_rhythm")
HAND_POSITION_STATUSES: tuple[HandPositionStatus, ...] = (
    "correct",
    "incorrect",
    "not_detected",
)
RHYTHM_STATUSES: tuple[RhythmStatus, ...] = ("slow", "good", "fast")


class TranscriptEntry(TypedDict):
    speaker: Speaker
    message: str
    timestamp: str


class TimelineEvent(TypedDict):
    event_type: EventTypeName
    timestamp: str
    data: dict[str, object]


class Incident(TypedDict):
    incident_id: str
    start_time: str
    location: str | None
    current_state: StateName
    responsiveness_status: str | None
    breathing_status: str | None
    cpr_active: bool
    cpr_started_time: str | None
    rhythm_status: RhythmStatus | None
    hand_position_status: HandPositionStatus | None
    transcript: list[TranscriptEntry]
    timeline: list[TimelineEvent]
    incident_summary: str | None
