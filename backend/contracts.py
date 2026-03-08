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
    "get_next_instruction_context",
    "log_event",
    "update_incident_status",
    "record_user_response",
    "start_cpr",
    "stop_cpr",
    "begin_reassessment",
    "generate_incident_summary",
    "finalize_session",
]

XrSignalType = Literal["hand_position", "compression_rhythm"]
HandPositionStatus = Literal["correct", "incorrect", "not_detected"]
RhythmStatus = Literal["slow", "good", "fast"]
ResponsivenessStatus = Literal["responsive", "unresponsive", "not_sure"]
BreathingStatus = Literal["normal", "abnormal_or_absent", "not_sure"]
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
    "get_next_instruction_context",
    "log_event",
    "update_incident_status",
    "record_user_response",
    "start_cpr",
    "stop_cpr",
    "begin_reassessment",
    "generate_incident_summary",
    "finalize_session",
)

XR_SIGNAL_TYPES: tuple[XrSignalType, ...] = ("hand_position", "compression_rhythm")
HAND_POSITION_STATUSES: tuple[HandPositionStatus, ...] = (
    "correct",
    "incorrect",
    "not_detected",
)
RHYTHM_STATUSES: tuple[RhythmStatus, ...] = ("slow", "good", "fast")
RESPONSIVENESS_STATUSES: tuple[ResponsivenessStatus, ...] = (
    "responsive",
    "unresponsive",
    "not_sure",
)
BREATHING_STATUSES: tuple[BreathingStatus, ...] = (
    "normal",
    "abnormal_or_absent",
    "not_sure",
)


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
    responsiveness_status: ResponsivenessStatus | None
    breathing_status: BreathingStatus | None
    cpr_active: bool
    cpr_started_time: str | None
    rhythm_status: RhythmStatus | None
    hand_position_status: HandPositionStatus | None
    transcript: list[TranscriptEntry]
    timeline: list[TimelineEvent]
    incident_summary: str | None


class VoiceInstructionContext(TypedDict):
    incident_id: str
    current_state: StateName
    prompt: str
    expected_response_field: str | None
    allowed_responses: list[str]
    next_action: str | None
    cpr_active: bool
    responsiveness_status: ResponsivenessStatus | None
    breathing_status: BreathingStatus | None
    hand_position_status: HandPositionStatus | None
    rhythm_status: RhythmStatus | None
