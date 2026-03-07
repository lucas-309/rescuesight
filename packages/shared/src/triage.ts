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
