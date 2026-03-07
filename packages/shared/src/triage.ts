export type TriagePathway =
  | "possible_cardiac_arrest"
  | "suspected_stroke"
  | "possible_heart_related_emergency"
  | "unclear_emergency";

export interface StrokeSigns {
  faceDrooping: boolean;
  armWeakness: boolean;
  speechDifficulty: boolean;
}

export interface HeartRelatedSigns {
  chestDiscomfort: boolean;
  shortnessOfBreath: boolean;
  coldSweat: boolean;
  nauseaOrUpperBodyDiscomfort: boolean;
}

export interface TriageAnswers {
  responsive: boolean;
  breathingNormal: boolean;
  strokeSigns: StrokeSigns;
  heartRelatedSigns: HeartRelatedSigns;
}

export interface CprGuidance {
  targetBpmRange: [number, number];
  instructions: string[];
}

export interface TriageResult {
  pathway: TriagePathway;
  label: string;
  urgency: "critical" | "high";
  summary: string;
  immediateActions: string[];
  followUpActions: string[];
  cprGuidance?: CprGuidance;
  safetyNotice: string;
}

export interface TriageEvaluationResponse {
  result: TriageResult;
  evaluatedAtIso: string;
}

export type IncidentActionKey =
  | "emsCalled"
  | "cprStarted"
  | "aedRequested"
  | "aedArrived"
  | "strokeOnsetRecorded";

export type AedStatus = "unknown" | "not_available" | "retrieval_in_progress" | "on_scene";

export interface IncidentTimeline {
  firstObservedAtLocal: string;
  responderNotes: string;
  aedStatus: AedStatus;
  actionsTaken: Record<IncidentActionKey, boolean>;
}

export interface IncidentTimelineInput {
  firstObservedAtLocal?: string;
  responderNotes?: string;
  aedStatus?: AedStatus;
  actionsTaken?: Partial<Record<IncidentActionKey, boolean>>;
}

export type IncidentSource = "web" | "xr" | "api";
export type IncidentStatus = "open" | "closed";

export interface PersistIncidentRequest {
  answers: TriageAnswers;
  timeline?: IncidentTimelineInput;
  handoffSummary?: string;
  source?: IncidentSource;
}

export interface UpdateIncidentRequest {
  timeline?: IncidentTimelineInput;
  handoffSummary?: string;
  status?: IncidentStatus;
}

export interface IncidentRecord {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  status: IncidentStatus;
  source: IncidentSource;
  answers: TriageAnswers;
  evaluation: TriageEvaluationResponse;
  timeline: IncidentTimeline;
  handoffSummary: string;
}
