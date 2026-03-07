from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from cv_signals import CVSignal, _clamp

CV_HOOK_REQUEST_PAYLOAD_SHAPE: dict[str, object] = {
    "signal": {
        "handPlacementStatus": "correct | too_high | too_low | too_left | too_right | unknown",
        "placementConfidence": "number",
        "compressionRateBpm": "integer",
        "compressionRhythmQuality": "good | too_slow | too_fast | inconsistent | unknown",
        "visibility": "full | partial | poor",
        "frameTimestampMs": "integer",
        "bodyPosture": "lying | sitting | upright | unknown (optional)",
        "postureConfidence": "number (optional)",
        "eyesClosedConfidence": "number (optional)",
        "torsoInclineDeg": "number (optional)",
    },
    "acknowledgedCheckpoints": ["string (optional)"],
    "source": "string (optional)",
}

HAND_STATUS_VALUES = {
    "correct",
    "too_high",
    "too_low",
    "too_left",
    "too_right",
    "unknown",
}

RHYTHM_VALUES = {"good", "too_slow", "too_fast", "inconsistent", "unknown"}
VISIBILITY_VALUES = {"full", "partial", "poor"}
POSTURE_VALUES = {"lying", "sitting", "upright", "unknown"}


@dataclass(frozen=True)
class CvHookRequest:
    signal: CVSignal
    acknowledgedCheckpoints: tuple[str, ...] = ()
    source: str = "cv_stub"


@dataclass(frozen=True)
class PersonDownHint:
    status: str
    confidence: float
    message: str


@dataclass(frozen=True)
class HandPlacementHint:
    directive: str
    message: str


@dataclass(frozen=True)
class CompressionHint:
    directive: str
    message: str


@dataclass(frozen=True)
class VisibilityHint:
    status: str
    message: str


@dataclass(frozen=True)
class ConfirmationCheckpoint:
    id: str
    prompt: str
    severity: str
    suggestedAction: str


@dataclass(frozen=True)
class CvHookResponse:
    personDownHint: PersonDownHint
    handPlacementHint: HandPlacementHint
    compressionHint: CompressionHint
    visibilityHint: VisibilityHint
    checkpoints: list[ConfirmationCheckpoint] = field(default_factory=list)
    requiresUserConfirmation: bool = False
    safetyNotice: str = (
        "CV hints are assistive only and must be user-confirmed. They are not medical diagnosis."
    )
    frameTimestampMs: int = 0

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def parse_cv_hook_request(payload: Any) -> CvHookRequest:
    if not isinstance(payload, dict):
        raise ValueError("Payload must be a JSON object.")

    signal_payload = payload.get("signal")
    if not isinstance(signal_payload, dict):
        raise ValueError("signal is required and must be an object.")

    signal = _parse_cv_signal(signal_payload)

    acknowledged = payload.get("acknowledgedCheckpoints", [])
    if acknowledged is None:
        acknowledged = []
    if not isinstance(acknowledged, list) or not all(
        isinstance(item, str) for item in acknowledged
    ):
        raise ValueError("acknowledgedCheckpoints must be an array of strings.")

    source = payload.get("source", "cv_stub")
    if not isinstance(source, str):
        raise ValueError("source must be a string when provided.")

    return CvHookRequest(
        signal=signal,
        acknowledgedCheckpoints=tuple(acknowledged),
        source=source,
    )


def evaluate_cv_hook(request: CvHookRequest) -> CvHookResponse:
    signal = request.signal
    person_down_hint = _infer_person_down_hint(signal)
    hand_hint = _infer_hand_placement_hint(signal)
    compression_hint = _infer_compression_hint(signal)
    visibility_hint = _infer_visibility_hint(signal)

    checkpoints: list[ConfirmationCheckpoint] = []
    acknowledged = set(request.acknowledgedCheckpoints)

    if (
        person_down_hint.status in {"possible", "likely"}
        and "person_down_confirmed" not in acknowledged
    ):
        checkpoints.append(
            ConfirmationCheckpoint(
                id="person_down_confirmed",
                prompt=(
                    "Do you confirm the person appears unresponsive and not breathing normally?"
                ),
                severity="critical",
                suggestedAction=(
                    "Confirm with checklist and continue emergency pathway guidance."
                ),
            )
        )

    if signal.handPlacementStatus not in {"correct", "unknown"} and "hand_adjusted" not in acknowledged:
        checkpoints.append(
            ConfirmationCheckpoint(
                id="hand_adjusted",
                prompt="Do you confirm hand position has been adjusted as instructed?",
                severity="high",
                suggestedAction=hand_hint.message,
            )
        )

    if (
        compression_hint.directive in {"speed_up", "slow_down", "steady_rhythm"}
        and "compression_adjusted" not in acknowledged
    ):
        checkpoints.append(
            ConfirmationCheckpoint(
                id="compression_adjusted",
                prompt="Do you confirm compression pace has been adjusted?",
                severity="advisory",
                suggestedAction=compression_hint.message,
            )
        )

    return CvHookResponse(
        personDownHint=person_down_hint,
        handPlacementHint=hand_hint,
        compressionHint=compression_hint,
        visibilityHint=visibility_hint,
        checkpoints=checkpoints,
        requiresUserConfirmation=len(checkpoints) > 0,
        frameTimestampMs=signal.frameTimestampMs,
    )


def _parse_cv_signal(payload: dict[str, object]) -> CVSignal:
    hand_status = payload.get("handPlacementStatus")
    if not isinstance(hand_status, str) or hand_status not in HAND_STATUS_VALUES:
        raise ValueError("signal.handPlacementStatus is invalid.")

    placement_conf = payload.get("placementConfidence")
    if not isinstance(placement_conf, (float, int)):
        raise ValueError("signal.placementConfidence must be a number.")

    bpm = payload.get("compressionRateBpm")
    if not isinstance(bpm, int):
        raise ValueError("signal.compressionRateBpm must be an integer.")

    rhythm = payload.get("compressionRhythmQuality")
    if not isinstance(rhythm, str) or rhythm not in RHYTHM_VALUES:
        raise ValueError("signal.compressionRhythmQuality is invalid.")

    visibility = payload.get("visibility")
    if not isinstance(visibility, str) or visibility not in VISIBILITY_VALUES:
        raise ValueError("signal.visibility is invalid.")

    ts = payload.get("frameTimestampMs")
    if not isinstance(ts, int):
        raise ValueError("signal.frameTimestampMs must be an integer.")

    posture = payload.get("bodyPosture", "unknown")
    if not isinstance(posture, str) or posture not in POSTURE_VALUES:
        raise ValueError("signal.bodyPosture is invalid.")

    posture_conf = payload.get("postureConfidence", 0.0)
    if not isinstance(posture_conf, (float, int)):
        raise ValueError("signal.postureConfidence must be a number.")

    eyes_closed_conf = payload.get("eyesClosedConfidence", 0.0)
    if not isinstance(eyes_closed_conf, (float, int)):
        raise ValueError("signal.eyesClosedConfidence must be a number.")

    torso_incline_deg = payload.get("torsoInclineDeg", 0.0)
    if not isinstance(torso_incline_deg, (float, int)):
        raise ValueError("signal.torsoInclineDeg must be a number.")

    return CVSignal(
        handPlacementStatus=hand_status,
        placementConfidence=float(_clamp(float(placement_conf), 0.0, 1.0)),
        compressionRateBpm=max(0, bpm),
        compressionRhythmQuality=rhythm,
        visibility=visibility,
        frameTimestampMs=ts,
        bodyPosture=posture,
        postureConfidence=float(_clamp(float(posture_conf), 0.0, 1.0)),
        eyesClosedConfidence=float(_clamp(float(eyes_closed_conf), 0.0, 1.0)),
        torsoInclineDeg=float(_clamp(float(torso_incline_deg), 0.0, 90.0)),
    )


def _infer_person_down_hint(signal: CVSignal) -> PersonDownHint:
    confidence = 0.05
    rationale: list[str] = []
    has_cpr_pattern = (
        signal.handPlacementStatus != "unknown"
        and signal.placementConfidence >= 0.55
        and signal.compressionRateBpm >= 85
        and signal.compressionRhythmQuality != "unknown"
    )

    if signal.bodyPosture == "lying":
        confidence += 0.20 + 0.42 * signal.postureConfidence
        rationale.append(f"lying posture ({signal.postureConfidence:.2f})")
    elif signal.bodyPosture == "sitting":
        confidence -= 0.20 * max(0.3, signal.postureConfidence)
        rationale.append(f"sitting posture ({signal.postureConfidence:.2f})")
    elif signal.bodyPosture == "upright":
        confidence -= 0.28 * max(0.3, signal.postureConfidence)
        rationale.append(f"upright posture ({signal.postureConfidence:.2f})")
    else:
        rationale.append("posture unknown")

    if signal.eyesClosedConfidence >= 0.40:
        confidence += 0.16 * signal.eyesClosedConfidence
        rationale.append(f"eyes-closed signal ({signal.eyesClosedConfidence:.2f})")
    elif signal.eyesClosedConfidence >= 0.20:
        confidence += 0.06 * signal.eyesClosedConfidence

    if signal.visibility == "full":
        confidence += 0.12
        rationale.append("full torso visibility")
    elif signal.visibility == "partial":
        confidence += 0.06
        rationale.append("partial torso visibility")

    if signal.handPlacementStatus != "unknown":
        confidence += 0.12 * signal.placementConfidence
        rationale.append("hand placement tracked")

    if signal.compressionRateBpm >= 85:
        confidence += 0.20
        rationale.append("compression-like motion present")

    if signal.compressionRhythmQuality in {"good", "too_slow", "too_fast", "inconsistent"}:
        confidence += 0.08
        rationale.append("rhythm classification available")

    if has_cpr_pattern:
        confidence += 0.24
        rationale.append("consistent CPR pattern boost")

    if signal.visibility == "poor":
        confidence = min(confidence, 0.35)

    # Guardrails to reduce false positives for standing/sitting cases without CPR evidence.
    if (
        signal.bodyPosture in {"upright", "sitting"}
        and signal.postureConfidence >= 0.75
        and signal.eyesClosedConfidence < 0.45
        and not has_cpr_pattern
    ):
        confidence = min(confidence, 0.35)
        rationale.append("upright/sitting suppression applied")

    confidence = float(_clamp(confidence, 0.0, 1.0))
    if confidence >= 0.58:
        message = "CV indicates a likely person-down context. Confirm and proceed with emergency workflow."
        status = "likely"
    elif confidence >= 0.38:
        message = "CV indicates a possible person-down context. Confirm with bystander checklist."
        status = "possible"
    else:
        message = "CV cannot confidently determine person-down context. Continue guided triage."
        status = "unclear"

    if rationale:
        message = f"{message} Basis: {', '.join(rationale)}."

    return PersonDownHint(
        status=status,
        confidence=round(confidence, 3),
        message=message,
    )


def _infer_hand_placement_hint(signal: CVSignal) -> HandPlacementHint:
    mapping: dict[str, tuple[str, str]] = {
        "correct": ("hold_position", "Keep hands centered on the CPR target."),
        "too_left": ("move_right", "Move hands slightly to the right."),
        "too_right": ("move_left", "Move hands slightly to the left."),
        "too_high": ("move_lower", "Move hands slightly lower on the sternum."),
        "too_low": ("move_higher", "Move hands slightly higher on the sternum."),
        "unknown": (
            "reacquire_target",
            "Reacquire chest and hand alignment before continuing.",
        ),
    }
    directive, message = mapping[signal.handPlacementStatus]
    return HandPlacementHint(directive=directive, message=message)


def _infer_compression_hint(signal: CVSignal) -> CompressionHint:
    if signal.compressionRateBpm <= 0 or signal.compressionRhythmQuality == "unknown":
        return CompressionHint(
            directive="unable_to_estimate",
            message="Unable to estimate compression pace. Keep target cadence at 100-120 BPM.",
        )

    mapping: dict[str, tuple[str, str]] = {
        "good": ("keep_pace", "Keep compressions at this pace (100-120 BPM)."),
        "too_slow": ("speed_up", "Speed up compressions toward 100-120 BPM."),
        "too_fast": ("slow_down", "Slow compressions to remain near 100-120 BPM."),
        "inconsistent": ("steady_rhythm", "Keep compression depth and rhythm steady."),
    }

    directive, message = mapping[signal.compressionRhythmQuality]
    return CompressionHint(directive=directive, message=message)


def _infer_visibility_hint(signal: CVSignal) -> VisibilityHint:
    mapping: dict[str, tuple[str, str]] = {
        "full": ("good_tracking", "Tracking quality is good."),
        "partial": ("limited_tracking", "Tracking is partial; keep the torso and hands in view."),
        "poor": ("poor_tracking", "Tracking is poor; reposition for a clearer view."),
    }
    status, message = mapping[signal.visibility]
    return VisibilityHint(status=status, message=message)
