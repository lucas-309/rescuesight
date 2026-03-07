import type {
  XrCvAssist,
  XrCvCheckpoint,
  XrCvSignalInput,
} from "@rescuesight/shared";

interface RawCvHookRequest {
  signal: XrCvSignalInput;
  acknowledgedCheckpoints: string[];
  source: string;
}

interface RawCvHint {
  status?: string;
  directive?: string;
  message: string;
}

interface RawCvCheckpoint {
  id: string;
  prompt: string;
  severity: "critical" | "high" | "advisory";
  suggestedAction: string;
}

interface RawCvHookResponse {
  personDownHint: RawCvHint & { status: "likely" | "possible" | "unclear"; confidence: number };
  handPlacementHint: RawCvHint;
  compressionHint: RawCvHint;
  visibilityHint: RawCvHint;
  checkpoints: RawCvCheckpoint[];
  requiresUserConfirmation: boolean;
  safetyNotice: string;
  frameTimestampMs: number;
}

export interface CvEvaluateInput {
  signal: XrCvSignalInput;
  acknowledgedCheckpoints: string[];
  source: string;
}

export type CvEvaluator = (input: CvEvaluateInput) => Promise<XrCvAssist>;

const sanitizeCheckpoint = (
  checkpoint: RawCvCheckpoint,
  acknowledged: Set<string>,
): XrCvCheckpoint => ({
  id: checkpoint.id,
  prompt: checkpoint.prompt,
  severity: checkpoint.severity,
  suggestedAction: checkpoint.suggestedAction,
  acknowledged: acknowledged.has(checkpoint.id),
});

const toCvAssist = (
  raw: RawCvHookResponse,
  acknowledgedCheckpoints: string[],
): XrCvAssist => {
  const acknowledgedSet = new Set(acknowledgedCheckpoints);
  return {
    personDownHint: {
      status: raw.personDownHint.status,
      confidence: raw.personDownHint.confidence,
      message: raw.personDownHint.message,
    },
    handPlacementHint: {
      directive: raw.handPlacementHint.directive,
      status: raw.handPlacementHint.status,
      message: raw.handPlacementHint.message,
    },
    compressionHint: {
      directive: raw.compressionHint.directive,
      status: raw.compressionHint.status,
      message: raw.compressionHint.message,
    },
    visibilityHint: {
      directive: raw.visibilityHint.directive,
      status: raw.visibilityHint.status,
      message: raw.visibilityHint.message,
    },
    checkpoints: (raw.checkpoints ?? []).map((checkpoint) =>
      sanitizeCheckpoint(checkpoint, acknowledgedSet),
    ),
    requiresUserConfirmation: raw.requiresUserConfirmation,
    safetyNotice: raw.safetyNotice,
    frameTimestampMs: raw.frameTimestampMs,
  };
};

export const createCvEvaluatorFromEnv = (): CvEvaluator | null => {
  const baseUrl = process.env.RESCUESIGHT_CV_SERVICE_URL?.trim();
  if (!baseUrl) {
    return null;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return async (input: CvEvaluateInput): Promise<XrCvAssist> => {
    const payload: RawCvHookRequest = {
      signal: input.signal,
      acknowledgedCheckpoints: input.acknowledgedCheckpoints,
      source: input.source,
    };

    const response = await fetch(`${normalizedBaseUrl}/api/cv/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`CV service returned ${response.status}`);
    }

    const raw = (await response.json()) as RawCvHookResponse;
    return toCvAssist(raw, input.acknowledgedCheckpoints);
  };
};
