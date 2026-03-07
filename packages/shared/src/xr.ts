import type {
  CprGuidance,
  IncidentActionKey,
  IncidentTimeline,
  IncidentTimelineInput,
  TriageAnswers,
  TriageEvaluationResponse,
} from "./triage.js";

export type XrDeviceModel = "meta_quest_3" | "meta_quest_3s" | "unknown";
export type XrInteractionMode = "controllers" | "hands" | "mixed";

export interface XrDeviceContext {
  deviceModel?: XrDeviceModel;
  interactionMode?: XrInteractionMode;
  appVersion?: string;
  unityVersion?: string;
}

export type XrOverlayAnchorKind = "head_locked" | "world_locked";
export type XrOverlayAnchorTarget =
  | "helper_panel"
  | "patient_chest_center"
  | "patient_head_side";

export interface XrOverlayAnchor {
  kind: XrOverlayAnchorKind;
  target: XrOverlayAnchorTarget;
}

export type XrOverlayStepSource = "immediate" | "follow_up" | "cpr";
export type XrOverlayStepPriority = "critical" | "high" | "info";

export interface XrOverlayStep {
  id: string;
  text: string;
  source: XrOverlayStepSource | "checkpoint";
  priority: XrOverlayStepPriority;
  anchor: XrOverlayAnchor;
  requiresConfirmation: boolean;
  linkedAction?: IncidentActionKey;
  completed?: boolean;
}

export type CvHandPlacementStatus =
  | "correct"
  | "too_high"
  | "too_low"
  | "too_left"
  | "too_right"
  | "unknown";
export type CvCompressionRhythmQuality =
  | "good"
  | "too_slow"
  | "too_fast"
  | "inconsistent"
  | "unknown";
export type CvVisibility = "full" | "partial" | "poor";
export type CvBodyPosture = "lying" | "sitting" | "upright" | "unknown";

export interface XrCvSignalInput {
  handPlacementStatus: CvHandPlacementStatus;
  placementConfidence: number;
  compressionRateBpm: number;
  compressionRhythmQuality: CvCompressionRhythmQuality;
  visibility: CvVisibility;
  frameTimestampMs: number;
  bodyPosture?: CvBodyPosture;
  postureConfidence?: number;
  eyesClosedConfidence?: number;
  torsoInclineDeg?: number;
}

export interface XrCvPersonDownHint {
  status: "likely" | "possible" | "unclear";
  confidence: number;
  message: string;
}

export interface XrCvSimpleHint {
  directive?: string;
  status?: string;
  message: string;
}

export interface XrCvCheckpoint {
  id: string;
  prompt: string;
  severity: "critical" | "high" | "advisory";
  suggestedAction: string;
  acknowledged: boolean;
}

export interface XrCvAssist {
  personDownHint: XrCvPersonDownHint;
  handPlacementHint: XrCvSimpleHint;
  compressionHint: XrCvSimpleHint;
  visibilityHint: XrCvSimpleHint;
  checkpoints: XrCvCheckpoint[];
  requiresUserConfirmation: boolean;
  safetyNotice: string;
  frameTimestampMs: number;
}

export interface XrTransitionGate {
  blocked: boolean;
  reason: string;
  requiredCheckpointIds: string[];
}

export interface XrTriageHookRequest {
  answers: TriageAnswers;
  incidentId?: string;
  timeline?: IncidentTimelineInput;
  deviceContext?: XrDeviceContext;
  cvSignal?: XrCvSignalInput;
  acknowledgedCheckpoints?: string[];
}

export interface XrTriageHookResponse {
  incidentId: string;
  triage: TriageEvaluationResponse;
  overlaySteps: XrOverlayStep[];
  cprGuidance?: CprGuidance;
  timeline: IncidentTimeline;
  cvAssist?: XrCvAssist;
  transitionGate: XrTransitionGate;
  safetyNotice: string;
}

export interface XrIncidentOverlayResponse {
  incidentId: string;
  triage: TriageEvaluationResponse;
  overlaySteps: XrOverlayStep[];
  timeline: IncidentTimeline;
  cvAssist?: XrCvAssist;
  transitionGate: XrTransitionGate;
  safetyNotice: string;
}

export interface XrIncidentActionUpdateRequest {
  actionKey: IncidentActionKey;
  completed: boolean;
  aedStatus?: IncidentTimelineInput["aedStatus"];
  responderNotes?: string;
}
