import type { CvLiveSummary, EmergencySessionStatus } from "@rescuesight/shared";

export type EmergencySessionPhase = "idle" | "connecting" | "connected" | "error";

export interface EmergencySessionState {
  phase: EmergencySessionPhase;
  statusMessage: string;
  connectedAtIso: string | null;
  sessionId: string | null;
  sessionStatus: EmergencySessionStatus | null;
  summary: CvLiveSummary | null;
  errorMessage: string | null;
}
