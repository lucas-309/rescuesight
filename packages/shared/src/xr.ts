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
  source: XrOverlayStepSource;
  priority: XrOverlayStepPriority;
  anchor: XrOverlayAnchor;
  requiresConfirmation: boolean;
  linkedAction?: IncidentActionKey;
  completed?: boolean;
}

export interface XrTriageHookRequest {
  answers: TriageAnswers;
  incidentId?: string;
  timeline?: IncidentTimelineInput;
  deviceContext?: XrDeviceContext;
}

export interface XrTriageHookResponse {
  incidentId: string;
  triage: TriageEvaluationResponse;
  overlaySteps: XrOverlayStep[];
  cprGuidance?: CprGuidance;
  timeline: IncidentTimeline;
  safetyNotice: string;
}

export interface XrIncidentOverlayResponse {
  incidentId: string;
  triage: TriageEvaluationResponse;
  overlaySteps: XrOverlayStep[];
  timeline: IncidentTimeline;
  safetyNotice: string;
}
