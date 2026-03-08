import type {
  CvLiveSignalIngestRequest,
  CvLiveSummary,
  DispatchLocation,
  DispatchRequest,
  EmergencyQuestionnaire,
  PersonDownSignal,
  VictimSnapshot,
} from "./dispatch.js";

export type EmergencySessionSource = "web" | "mobile" | "xr" | "api";

export type EmergencySessionStatus =
  | "open"
  | "monitoring"
  | "questionnaire_in_progress"
  | "questionnaire_completed"
  | "dispatch_requested"
  | "dispatched"
  | "rejected"
  | "resolved";

export type EmergencySessionEventType =
  | "session_created"
  | "cv_signal"
  | "questionnaire_started"
  | "questionnaire_submitted"
  | "soap_generated"
  | "soap_edited"
  | "dispatch_requested";

export interface EmergencySoapReport {
  generatedAtIso: string;
  acuity: "critical" | "high";
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  combinedText: string;
  safetyNotice: string;
}

export interface EmergencySessionQuestionnaireState {
  startedAtIso?: string;
  submittedAtIso?: string;
  answers?: EmergencyQuestionnaire;
}

export interface EmergencySessionEvent {
  id: string;
  createdAtIso: string;
  type: EmergencySessionEventType;
  summary: string;
}

export interface EmergencySession {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  source: EmergencySessionSource;
  sourceDeviceId?: string;
  status: EmergencySessionStatus;
  location?: DispatchLocation;
  personDownSignal?: PersonDownSignal;
  victimSnapshot?: VictimSnapshot;
  liveSummary?: CvLiveSummary;
  questionnaire: EmergencySessionQuestionnaireState;
  soapReport?: EmergencySoapReport;
  dispatchRequest?: DispatchRequest;
  events: EmergencySessionEvent[];
}

export interface CreateEmergencySessionRequest {
  source?: EmergencySessionSource;
  sourceDeviceId?: string;
  location?: DispatchLocation;
}

export interface SessionCvSignalRequest extends CvLiveSignalIngestRequest {}

export interface SubmitSessionQuestionnaireRequest {
  questionnaire: EmergencyQuestionnaire;
  startedAtIso?: string;
  submittedAtIso?: string;
  generateSoapReport?: boolean;
}

export interface UpdateSessionSoapReportRequest {
  combinedText: string;
  editor?: string;
}

export interface CreateSessionDispatchRequest {
  questionnaire?: EmergencyQuestionnaire;
  location?: DispatchLocation;
  personDownSignal?: PersonDownSignal;
  victimSnapshot?: VictimSnapshot;
  emergencyCallRequested?: boolean;
}
