import type { XrCvSignalInput } from "./xr.js";

export type PersonDownSignalStatus = "person_down" | "not_person_down" | "uncertain";
export type PersonDownSignalSource = "cv" | "manual" | "api";

export interface PersonDownSignal {
  status: PersonDownSignalStatus;
  confidence: number;
  source: PersonDownSignalSource;
  frameTimestampMs?: number;
  observedAtIso?: string;
}

export interface VictimSnapshot {
  imageDataUrl: string;
  capturedAtIso?: string;
  frameTimestampMs?: number;
  triggerReason?: string;
}

export interface DispatchLocation {
  label: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  indoorDescriptor?: string;
}

export type QuestionnaireResponsiveness = "responsive" | "unresponsive" | "unknown";
export type QuestionnaireBreathing = "normal" | "abnormal_or_absent" | "unknown";
export type QuestionnairePulse = "present" | "absent" | "unknown";

export interface EmergencyQuestionnaire {
  responsiveness: QuestionnaireResponsiveness;
  breathing: QuestionnaireBreathing;
  pulse: QuestionnairePulse;
  severeBleeding: boolean;
  majorTrauma: boolean;
  notes?: string;
}

export type DispatchPriority = "critical" | "high";
export type DispatchRequestStatus = "pending_review" | "dispatched" | "resolved";

export interface DispatchAssignmentInput {
  unitId: string;
  dispatcher: string;
  etaMinutes: number;
}

export interface DispatchAssignment extends DispatchAssignmentInput {
  assignedAtIso: string;
}

export interface CreateDispatchRequest {
  questionnaire: EmergencyQuestionnaire;
  location: DispatchLocation;
  personDownSignal: PersonDownSignal;
  victimSnapshot?: VictimSnapshot;
  emergencyCallRequested?: boolean;
}

export interface UpdateDispatchRequest {
  status?: DispatchRequestStatus;
  assignment?: DispatchAssignmentInput;
  dispatchNotes?: string;
}

export interface DispatchRequest {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  status: DispatchRequestStatus;
  priority: DispatchPriority;
  location: DispatchLocation;
  questionnaire: EmergencyQuestionnaire;
  personDownSignal: PersonDownSignal;
  victimSnapshot?: VictimSnapshot;
  emergencyCallRequested: boolean;
  assignment?: DispatchAssignment;
  dispatchNotes: string;
  safetyNotice: string;
}

export interface CreatePersonDownEventRequest {
  signal: PersonDownSignal;
  location?: DispatchLocation;
  sourceDeviceId?: string;
}

export interface PersonDownEvent {
  id: string;
  createdAtIso: string;
  signal: PersonDownSignal;
  location?: DispatchLocation;
  sourceDeviceId?: string;
  questionnaireRequired: boolean;
  recommendedPriority: DispatchPriority;
  safetyNotice: string;
}

export interface CvLiveSignalIngestRequest {
  signal: XrCvSignalInput;
  location?: DispatchLocation;
  sourceDeviceId?: string;
}

export interface CvLiveSummary {
  updatedAtIso: string;
  signal: XrCvSignalInput;
  personDownSignal: PersonDownSignal;
  summaryText: string;
  safetyNotice: string;
  location?: DispatchLocation;
  sourceDeviceId?: string;
}
