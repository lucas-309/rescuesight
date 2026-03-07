from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

YES_KEY = ord("y")
NO_KEY = ord("n")
FORCE_START_KEY = ord("h")
RESET_KEY = ord("x")


QUESTION_PROMPTS = [
    "Is the person responsive? (Y/N)",
    "Is the person breathing normally? (Y/N)",
    "Do you observe FAST stroke signs? (Y/N)",
    "Do you observe heart-related warning signs? (Y/N)",
]


def build_dispatch_questionnaire_from_responses(responses: list[bool]) -> dict[str, object]:
    if len(responses) != 4:
        raise ValueError("Expected 4 questionnaire responses.")

    responsive = bool(responses[0])
    breathing_normal = bool(responses[1])
    fast_signs_present = bool(responses[2])
    heart_signs_present = bool(responses[3])

    notes_parts = ["CV webcam HITL submission"]
    if fast_signs_present:
        notes_parts.append("FAST signs observed")
    if heart_signs_present:
        notes_parts.append("heart-related warning signs observed")

    return {
        "responsiveness": "responsive" if responsive else "unresponsive",
        "breathing": "normal" if breathing_normal else "abnormal_or_absent",
        "pulse": "unknown",
        "severeBleeding": False,
        "majorTrauma": False,
        "notes": " | ".join(notes_parts),
    }


def build_dispatch_request_payload(
    questionnaire: dict[str, object],
    location: dict[str, object],
    person_down_signal: dict[str, object],
) -> dict[str, object]:
    return {
        "questionnaire": questionnaire,
        "location": location,
        "personDownSignal": person_down_signal,
        "emergencyCallRequested": True,
    }


@dataclass
class HitlQuestionnaireSession:
    cooldown_ms: int = 30_000
    active: bool = False
    step_index: int = 0
    responses: list[Optional[bool]] = field(default_factory=lambda: [None, None, None, None])
    completed_answers: Optional[dict[str, object]] = None
    last_started_ms: int = -10_000_000
    last_submitted_ms: int = -10_000_000
    last_status: str = ""

    def maybe_start(self, person_down_possible: bool, timestamp_ms: int) -> bool:
        if not person_down_possible or self.active or self.completed_answers is not None:
            return False

        last_activity = max(self.last_started_ms, self.last_submitted_ms)
        if timestamp_ms - last_activity < self.cooldown_ms:
            return False

        self.start(timestamp_ms, "Possible person-down detected. Starting questionnaire.")
        return True

    def start(self, timestamp_ms: int, status: str) -> None:
        self.active = True
        self.step_index = 0
        self.responses = [None, None, None, None]
        self.completed_answers = None
        self.last_started_ms = timestamp_ms
        self.last_status = status

    def reset(self, status: str = "Questionnaire reset.") -> None:
        self.active = False
        self.step_index = 0
        self.responses = [None, None, None, None]
        self.completed_answers = None
        self.last_status = status

    def handle_key(self, key: int, timestamp_ms: int) -> bool:
        if key == FORCE_START_KEY:
            self.start(timestamp_ms, "Manual questionnaire start.")
            return False
        if key == RESET_KEY:
            self.reset()
            return False

        if not self.active:
            return False
        if key not in (YES_KEY, NO_KEY):
            return False

        self.responses[self.step_index] = key == YES_KEY
        self.step_index += 1

        if self.step_index < len(QUESTION_PROMPTS):
            self.last_status = f"Recorded answer {self.step_index}/{len(QUESTION_PROMPTS)}."
            return False

        normalized = [bool(item) for item in self.responses]
        self.completed_answers = build_dispatch_questionnaire_from_responses(normalized)
        self.active = False
        self.last_status = "Questionnaire completed. Preparing dispatch payload."
        return True

    def mark_submitted(
        self,
        status: str,
        timestamp_ms: int,
    ) -> None:
        self.completed_answers = None
        self.step_index = 0
        self.responses = [None, None, None, None]
        self.active = False
        self.last_submitted_ms = timestamp_ms
        self.last_status = status

    def current_prompt(self) -> Optional[str]:
        if not self.active:
            return None
        return QUESTION_PROMPTS[self.step_index]

    def overlay_lines(self, api_enabled: bool) -> list[str]:
        lines: list[str] = []
        if self.active:
            prompt = self.current_prompt() or "Questionnaire active."
            lines.append(f"HITL Q{self.step_index + 1}/{len(QUESTION_PROMPTS)}: {prompt}")
            lines.append("Controls: Y=yes N=no H=start X=reset")
        elif self.completed_answers is not None:
            lines.append("HITL questionnaire complete. Sending to backend...")
        else:
            lines.append("HITL waits for person-down hint. Press H to start manually.")
            lines.append("Controls: H=start X=reset")

        if not api_enabled:
            lines.append("Backend send disabled (use --api-base-url).")
        if self.last_status:
            lines.append(f"HITL status: {self.last_status}")
        return lines
