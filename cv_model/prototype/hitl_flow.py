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
    victim_snapshot: Optional[dict[str, object]] = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "questionnaire": questionnaire,
        "location": location,
        "personDownSignal": person_down_signal,
        "emergencyCallRequested": True,
    }
    if victim_snapshot is not None:
        payload["victimSnapshot"] = victim_snapshot
    return payload


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
    last_submission_success: Optional[bool] = None
    last_submission_request_id: Optional[str] = None
    auto_prompt_ready: bool = False
    manual_start_confirmation_pending: bool = False
    pending_victim_snapshot: Optional[dict[str, object]] = None

    def set_auto_prompt_ready(
        self,
        *,
        trigger_ready: bool,
        timestamp_ms: int,
        status: str,
        victim_snapshot: Optional[dict[str, object]] = None,
    ) -> bool:
        if self.active or self.completed_answers is not None:
            return False

        if not trigger_ready:
            # Keep a previously armed prompt latched to avoid flicker from noisy frame-to-frame CV.
            if self.auto_prompt_ready:
                return False
            self.pending_victim_snapshot = None
            return False

        last_activity = max(self.last_started_ms, self.last_submitted_ms)
        if timestamp_ms - last_activity < self.cooldown_ms:
            return False

        became_ready = not self.auto_prompt_ready
        self.auto_prompt_ready = True
        self.manual_start_confirmation_pending = False
        if victim_snapshot is not None:
            self.pending_victim_snapshot = victim_snapshot
        if became_ready:
            self.last_status = status
        return became_ready

    def start(self, timestamp_ms: int, status: str) -> None:
        self.active = True
        self.step_index = 0
        self.responses = [None, None, None, None]
        self.completed_answers = None
        self.last_started_ms = timestamp_ms
        self.last_submission_success = None
        self.last_submission_request_id = None
        self.auto_prompt_ready = False
        self.manual_start_confirmation_pending = False
        self.last_status = status

    def reset(self, status: str = "Questionnaire reset.") -> None:
        self.active = False
        self.step_index = 0
        self.responses = [None, None, None, None]
        self.completed_answers = None
        self.auto_prompt_ready = False
        self.manual_start_confirmation_pending = False
        self.pending_victim_snapshot = None
        self.last_status = status

    def handle_key(self, key: int, timestamp_ms: int) -> bool:
        if key == FORCE_START_KEY:
            if self.active:
                self.last_status = "Questionnaire already active."
                return False
            if self.auto_prompt_ready:
                self.start(timestamp_ms, "Trigger confirmed. Questionnaire started.")
                return False
            self.manual_start_confirmation_pending = True
            self.last_status = "No strong person-down trigger. Press Y to confirm start or N to cancel."
            return False
        if key == RESET_KEY:
            self.reset()
            return False

        if self.manual_start_confirmation_pending and not self.active:
            if key == YES_KEY:
                self.manual_start_confirmation_pending = False
                self.start(timestamp_ms, "Manual questionnaire start confirmed.")
                return False
            if key == NO_KEY:
                self.manual_start_confirmation_pending = False
                self.last_status = "Manual questionnaire start canceled."
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
        submitted: Optional[bool] = None,
        request_id: Optional[str] = None,
    ) -> None:
        self.completed_answers = None
        self.step_index = 0
        self.responses = [None, None, None, None]
        self.active = False
        self.auto_prompt_ready = False
        self.manual_start_confirmation_pending = False
        self.pending_victim_snapshot = None
        self.last_submitted_ms = timestamp_ms
        self.last_submission_success = submitted
        self.last_submission_request_id = request_id
        self.last_status = status

    def current_prompt(self) -> Optional[str]:
        if not self.active:
            return None
        return QUESTION_PROMPTS[self.step_index]

    def phase_label(self) -> str:
        if self.active:
            return "QUESTIONNAIRE_ACTIVE"
        if self.manual_start_confirmation_pending:
            return "MANUAL_START_CONFIRMATION"
        if self.auto_prompt_ready:
            return "TRIGGER_READY_PRESS_H"
        if self.completed_answers is not None:
            return "QUESTIONNAIRE_COMPLETED"
        if self.last_submission_success is True:
            return "REQUEST_SENT_TO_DASHBOARD"
        if self.last_submission_success is False:
            return "REQUEST_SEND_FAILED"
        return "WAITING_FOR_PERSON_DOWN"

    def overlay_lines(self, api_enabled: bool) -> list[str]:
        lines: list[str] = []
        if self.active:
            prompt = self.current_prompt() or "Questionnaire active."
            lines.append("=== QUESTIONNAIRE ACTIVE ===")
            lines.append(f"Q{self.step_index + 1}/{len(QUESTION_PROMPTS)} {prompt}")
            lines.append("Answer now: Y=yes N=no")
            lines.append("Other controls: H=start X=reset")
        elif self.manual_start_confirmation_pending:
            lines.append("No strong down trigger right now.")
            lines.append("Start questionnaire anyway? Y=yes N=no")
            lines.append("Controls: H=start X=reset")
        elif self.auto_prompt_ready:
            lines.append("Trigger met: sustained person-down evidence.")
            lines.append("Press H to start questionnaire now.")
            lines.append("Controls: H=start X=reset")
        elif self.completed_answers is not None:
            lines.append("Questionnaire complete. Sending request to dashboard...")
        elif self.last_submission_success is True:
            if self.last_submission_request_id:
                lines.append(
                    f"REQUEST SENT TO DASHBOARD (id={self.last_submission_request_id})"
                )
            else:
                lines.append("REQUEST SENT TO DASHBOARD")
        elif self.last_submission_success is False:
            lines.append("REQUEST TO DASHBOARD FAILED")
        else:
            lines.append("Waiting for trigger. Press H for manual questionnaire.")
            lines.append("Manual start asks for Y/N confirmation if no trigger.")
            lines.append("Controls: H=start X=reset")

        if not api_enabled:
            lines.append("Backend send disabled (use --api-base-url).")
        if self.last_status:
            lines.append(f"HITL status: {self.last_status}")
        return lines
