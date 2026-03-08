import type { CvLiveSummary } from "@rescuesight/shared";

export type EmergencySessionPhase = "idle" | "connecting" | "connected" | "error";

export interface EmergencySessionState {
  phase: EmergencySessionPhase;
  statusMessage: string;
  connectedAtIso: string | null;
  summary: CvLiveSummary | null;
  errorMessage: string | null;
}
