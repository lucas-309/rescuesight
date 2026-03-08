import type {
  CreateEmergencySessionRequest,
  CvLiveSignalIngestRequest,
  CvLiveSummary,
  EmergencySession,
  XrCvSignalInput,
} from "@rescuesight/shared";
import { API_BASE_URL, CV_FRAME_POST_URL, CV_MODEL_FRAME_URL, CV_SOURCE_DEVICE_ID } from "../config/env";

interface HealthResponse {
  status: string;
}

interface LiveSummaryResponse {
  summary: CvLiveSummary;
}

interface SessionResponse {
  session: EmergencySession;
}

export interface MobileFrameUploadResult {
  mode: "model" | "fallback";
  warning: string | null;
  overlay: CvModelOverlay | null;
  cvAssist: CvAssistHints | null;
  signal: XrCvSignalInput;
}

export interface MobileFrameInput {
  imageBase64: string;
  frameWidth?: number;
  frameHeight?: number;
  previewWidth?: number;
  previewHeight?: number;
}

export interface CvOverlayPoint {
  x: number;
  y: number;
}

export interface CvOverlayTarget {
  center: CvOverlayPoint;
  angleDeg: number;
  palmScale: number;
}

export interface CvOverlayDistanceEstimate {
  normalized: number;
  palmWidths: number;
  delta: CvOverlayPoint;
}

export interface CvOverlayDistanceLine {
  start: CvOverlayPoint;
  end: CvOverlayPoint;
}

export interface CvModelOverlay {
  handCenter: CvOverlayPoint | null;
  chestTarget: CvOverlayTarget | null;
  placementStatus: XrCvSignalInput["handPlacementStatus"];
  placementConfidence: number;
  visibility: XrCvSignalInput["visibility"];
  usingChestFallback: boolean;
  distanceLine: CvOverlayDistanceLine | null;
  distanceEstimate: CvOverlayDistanceEstimate | null;
  targetLocked: boolean;
  placementInstruction: string | null;
  readyForCompressions: boolean;
}

export interface CvAssistHints {
  personDownHint: {
    status: "likely" | "possible" | "unclear";
    confidence: number;
    message: string;
  };
  handPlacementHint: {
    directive?: string;
    message: string;
  };
  compressionHint: {
    directive?: string;
    message: string;
  };
  visibilityHint: {
    status?: string;
    message: string;
  };
}

const REQUEST_TIMEOUT_MS = 7_500;
const MODEL_HOST_PLACEHOLDER_PATTERN = /<[^>]+>/;

const VALID_HAND_PLACEMENTS = new Set<XrCvSignalInput["handPlacementStatus"]>([
  "correct",
  "too_high",
  "too_low",
  "too_left",
  "too_right",
  "unknown",
]);
const VALID_RHYTHMS = new Set<XrCvSignalInput["compressionRhythmQuality"]>([
  "good",
  "too_slow",
  "too_fast",
  "inconsistent",
  "unknown",
]);
const VALID_VISIBILITY = new Set<XrCvSignalInput["visibility"]>(["full", "partial", "poor"]);
const VALID_POSTURE = new Set<NonNullable<XrCvSignalInput["bodyPosture"]>>([
  "lying",
  "sitting",
  "upright",
  "unknown",
]);

const createTimeoutController = (): {
  signal: AbortSignal;
  clear: () => void;
} => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
};

const fetchJson = async (path: string): Promise<Response> => {
  const timeout = createTimeoutController();
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: timeout.signal,
    });
    return response;
  } finally {
    timeout.clear();
  }
};

const fallbackSignal = (frameTimestampMs: number): XrCvSignalInput => ({
  handPlacementStatus: "unknown",
  placementConfidence: 0,
  compressionRateBpm: 0,
  compressionRhythmQuality: "unknown",
  visibility: "partial",
  frameTimestampMs,
  bodyPosture: "unknown",
  postureConfidence: 0,
  eyesClosedConfidence: 0,
});

const toFiniteNumber = (value: unknown, fallbackValue: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallbackValue;

const clampNormalized = (value: number): number => Math.max(0, Math.min(1, value));

const toOverlayPoint = (value: unknown): CvOverlayPoint | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const x = toFiniteNumber(source.x, Number.NaN);
  const y = toFiniteNumber(source.y, Number.NaN);
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return null;
  }

  return {
    x: clampNormalized(x),
    y: clampNormalized(y),
  };
};

const toDistanceLine = (value: unknown): CvOverlayDistanceLine | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const start = toOverlayPoint(source.start);
  const end = toOverlayPoint(source.end);
  if (!start || !end) {
    return null;
  }
  return { start, end };
};

const toDistanceEstimate = (value: unknown): CvOverlayDistanceEstimate | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const normalized = toFiniteNumber(source.normalized, Number.NaN);
  const palmWidths = toFiniteNumber(source.palmWidths, Number.NaN);
  const delta = toOverlayPoint(source.delta);
  if (Number.isNaN(normalized) || Number.isNaN(palmWidths) || !delta) {
    return null;
  }
  return {
    normalized: Math.max(0, normalized),
    palmWidths: Math.max(0, palmWidths),
    delta,
  };
};

const sanitizeCvAssist = (value: unknown): CvAssistHints | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const personDownHintSource = source.personDownHint;
  const handPlacementHintSource = source.handPlacementHint;
  const compressionHintSource = source.compressionHint;
  const visibilityHintSource = source.visibilityHint;
  if (
    !personDownHintSource ||
    !handPlacementHintSource ||
    !compressionHintSource ||
    !visibilityHintSource ||
    typeof personDownHintSource !== "object" ||
    typeof handPlacementHintSource !== "object" ||
    typeof compressionHintSource !== "object" ||
    typeof visibilityHintSource !== "object"
  ) {
    return null;
  }

  const personDownHint = personDownHintSource as Record<string, unknown>;
  const handPlacementHint = handPlacementHintSource as Record<string, unknown>;
  const compressionHint = compressionHintSource as Record<string, unknown>;
  const visibilityHint = visibilityHintSource as Record<string, unknown>;
  const personDownStatus = personDownHint.status;
  if (
    typeof personDownStatus !== "string" ||
    !["likely", "possible", "unclear"].includes(personDownStatus)
  ) {
    return null;
  }

  if (
    typeof personDownHint.message !== "string" ||
    typeof handPlacementHint.message !== "string" ||
    typeof compressionHint.message !== "string" ||
    typeof visibilityHint.message !== "string"
  ) {
    return null;
  }

  return {
    personDownHint: {
      status: personDownStatus as CvAssistHints["personDownHint"]["status"],
      confidence: clampNormalized(toFiniteNumber(personDownHint.confidence, 0)),
      message: personDownHint.message,
    },
    handPlacementHint: {
      directive:
        typeof handPlacementHint.directive === "string" ? handPlacementHint.directive : undefined,
      message: handPlacementHint.message,
    },
    compressionHint: {
      directive: typeof compressionHint.directive === "string" ? compressionHint.directive : undefined,
      message: compressionHint.message,
    },
    visibilityHint: {
      status: typeof visibilityHint.status === "string" ? visibilityHint.status : undefined,
      message: visibilityHint.message,
    },
  };
};

const sanitizeModelOverlay = (value: unknown): CvModelOverlay | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const handCenter = toOverlayPoint(source.handCenter);
  const chestTargetSource = source.chestTarget;
  let chestTarget: CvOverlayTarget | null = null;

  if (chestTargetSource && typeof chestTargetSource === "object") {
    const target = chestTargetSource as Record<string, unknown>;
    const center = toOverlayPoint(target.center);
    if (center) {
      chestTarget = {
        center,
        angleDeg: toFiniteNumber(target.angleDeg, 0),
        palmScale: Math.max(0, toFiniteNumber(target.palmScale, 0)),
      };
    }
  }

  const placementStatus = source.placementStatus;
  const visibility = source.visibility;

  if (
    typeof placementStatus !== "string" ||
    !VALID_HAND_PLACEMENTS.has(placementStatus as XrCvSignalInput["handPlacementStatus"])
  ) {
    return null;
  }

  if (typeof visibility !== "string" || !VALID_VISIBILITY.has(visibility as XrCvSignalInput["visibility"])) {
    return null;
  }

  return {
    handCenter,
    chestTarget,
    placementStatus: placementStatus as XrCvSignalInput["handPlacementStatus"],
    placementConfidence: clampNormalized(toFiniteNumber(source.placementConfidence, 0)),
    visibility: visibility as XrCvSignalInput["visibility"],
    usingChestFallback: Boolean(source.usingChestFallback),
    distanceLine: toDistanceLine(source.distanceLine),
    distanceEstimate: toDistanceEstimate(source.distanceEstimate),
    targetLocked: Boolean(source.targetLocked),
    placementInstruction:
      typeof source.placementInstruction === "string" ? source.placementInstruction : null,
    readyForCompressions: Boolean(source.readyForCompressions),
  };
};

const sanitizeModelSignal = (
  value: unknown,
  frameTimestampMs: number,
): XrCvSignalInput | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const handPlacementStatus = source.handPlacementStatus;
  const compressionRhythmQuality = source.compressionRhythmQuality;
  const visibility = source.visibility;
  const bodyPosture = source.bodyPosture;

  if (
    typeof handPlacementStatus !== "string" ||
    !VALID_HAND_PLACEMENTS.has(handPlacementStatus as XrCvSignalInput["handPlacementStatus"])
  ) {
    return null;
  }

  if (
    typeof compressionRhythmQuality !== "string" ||
    !VALID_RHYTHMS.has(compressionRhythmQuality as XrCvSignalInput["compressionRhythmQuality"])
  ) {
    return null;
  }

  if (typeof visibility !== "string" || !VALID_VISIBILITY.has(visibility as XrCvSignalInput["visibility"])) {
    return null;
  }

  const fallback = fallbackSignal(frameTimestampMs);
  return {
    handPlacementStatus: handPlacementStatus as XrCvSignalInput["handPlacementStatus"],
    placementConfidence: toFiniteNumber(source.placementConfidence, fallback.placementConfidence),
    compressionRateBpm: toFiniteNumber(source.compressionRateBpm, fallback.compressionRateBpm),
    compressionRhythmQuality: compressionRhythmQuality as XrCvSignalInput["compressionRhythmQuality"],
    visibility: visibility as XrCvSignalInput["visibility"],
    frameTimestampMs: toFiniteNumber(source.frameTimestampMs, frameTimestampMs),
    bodyPosture:
      typeof bodyPosture === "string" && VALID_POSTURE.has(bodyPosture as NonNullable<XrCvSignalInput["bodyPosture"]>)
        ? (bodyPosture as XrCvSignalInput["bodyPosture"])
        : fallback.bodyPosture,
    postureConfidence: toFiniteNumber(source.postureConfidence, fallback.postureConfidence ?? 0),
    eyesClosedConfidence: toFiniteNumber(source.eyesClosedConfidence, fallback.eyesClosedConfidence ?? 0),
    torsoInclineDeg:
      source.torsoInclineDeg === undefined ? undefined : toFiniteNumber(source.torsoInclineDeg, 0),
  };
};

const analyzeFrameWithModelHost = async (
  imageDataUrl: string,
  frameTimestampMs: number,
  frameInput: MobileFrameInput,
): Promise<{ signal: XrCvSignalInput | null; overlay: CvModelOverlay | null; cvAssist: CvAssistHints | null }> => {
  if (!CV_MODEL_FRAME_URL) {
    return { signal: null, overlay: null, cvAssist: null };
  }

  const response = await fetch(CV_MODEL_FRAME_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      imageDataUrl,
      frameTimestampMs,
      sourceDeviceId: CV_SOURCE_DEVICE_ID,
      frameWidth:
        typeof frameInput.frameWidth === "number" && Number.isFinite(frameInput.frameWidth)
          ? Math.round(frameInput.frameWidth)
          : undefined,
      frameHeight:
        typeof frameInput.frameHeight === "number" && Number.isFinite(frameInput.frameHeight)
          ? Math.round(frameInput.frameHeight)
          : undefined,
      previewWidth:
        typeof frameInput.previewWidth === "number" && Number.isFinite(frameInput.previewWidth)
          ? Math.round(frameInput.previewWidth)
          : undefined,
      previewHeight:
        typeof frameInput.previewHeight === "number" && Number.isFinite(frameInput.previewHeight)
          ? Math.round(frameInput.previewHeight)
          : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`CV model host request failed (${response.status})`);
  }

  const payload = (await response.json()) as
    | { signal?: unknown; overlay?: unknown; cvAssist?: unknown }
    | Record<string, unknown>;
  const candidate = "signal" in payload ? payload.signal : payload;
  const overlayCandidate = "overlay" in payload ? payload.overlay : null;
  const cvAssistCandidate = "cvAssist" in payload ? payload.cvAssist : null;
  return {
    signal: sanitizeModelSignal(candidate, frameTimestampMs),
    overlay: sanitizeModelOverlay(overlayCandidate),
    cvAssist: sanitizeCvAssist(cvAssistCandidate),
  };
};

export const verifyApiAvailability = async (): Promise<void> => {
  const response = await fetchJson("/health");
  if (!response.ok) {
    throw new Error(`Backend unavailable (${response.status})`);
  }

  const payload = (await response.json()) as HealthResponse;
  if (payload.status !== "ok") {
    throw new Error("Backend health check failed");
  }
};

export const fetchLiveSummary = async (): Promise<CvLiveSummary | null> => {
  const response = await fetchJson("/api/cv/live-summary");

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`CV live-summary request failed (${response.status})`);
  }

  const payload = (await response.json()) as LiveSummaryResponse;
  return payload.summary ?? null;
};

export const connectToCvModel = async (): Promise<CvLiveSummary | null> => {
  await verifyApiAvailability();
  return fetchLiveSummary();
};

export const createEmergencySession = async (
  payload: CreateEmergencySessionRequest,
): Promise<EmergencySession> => {
  const timeout = createTimeoutController();
  try {
    const response = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`Session create failed (${response.status})`);
    }

    const body = (await response.json()) as SessionResponse;
    return body.session;
  } finally {
    timeout.clear();
  }
};

export const fetchEmergencySession = async (sessionId: string): Promise<EmergencySession> => {
  const timeout = createTimeoutController();
  try {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`Session fetch failed (${response.status})`);
    }

    const body = (await response.json()) as SessionResponse;
    return body.session;
  } finally {
    timeout.clear();
  }
};

const buildMobileFramePayload = (
  frameTimestampMs: number,
  signal: XrCvSignalInput,
): CvLiveSignalIngestRequest => {
  return {
    signal,
    sourceDeviceId: CV_SOURCE_DEVICE_ID,
  };
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown CV model host error.";

const ingestLiveSignal = async (
  payload: CvLiveSignalIngestRequest,
  sessionId?: string,
): Promise<void> => {
  const timeout = createTimeoutController();
  try {
    const ingestUrl = sessionId
      ? `${API_BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}/cv-signal`
      : CV_FRAME_POST_URL;

    const response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`CV frame ingest failed (${response.status})`);
    }
  } finally {
    timeout.clear();
  }
};

export const postMobileCameraFrame = async (
  frameInput: MobileFrameInput,
  options: { sessionId?: string } = {},
): Promise<MobileFrameUploadResult> => {
  const frameTimestampMs = Date.now();
  const imageDataUrl = `data:image/jpeg;base64,${frameInput.imageBase64}`;
  let signal = fallbackSignal(frameTimestampMs);
  let mode: MobileFrameUploadResult["mode"] = "fallback";
  let warning: string | null = null;
  let overlay: CvModelOverlay | null = null;
  let cvAssist: CvAssistHints | null = null;
  const modelUrlLooksLikePlaceholder =
    typeof CV_MODEL_FRAME_URL === "string" && MODEL_HOST_PLACEHOLDER_PATTERN.test(CV_MODEL_FRAME_URL);

  if (CV_MODEL_FRAME_URL && !modelUrlLooksLikePlaceholder) {
    try {
      const modelResult = await analyzeFrameWithModelHost(imageDataUrl, frameTimestampMs, frameInput);
      overlay = modelResult.overlay;
      cvAssist = modelResult.cvAssist;
      if (modelResult.signal) {
        signal = modelResult.signal;
        mode = "model";
      } else {
        warning = "Model host responded without a valid signal. Using fallback signal.";
      }
    } catch (error) {
      warning = `Model host unavailable (${toErrorMessage(error)}). Using fallback signal.`;
    }
  } else if (modelUrlLooksLikePlaceholder) {
    warning = "CV model host URL uses placeholder text. Set EXPO_PUBLIC_CV_MODEL_FRAME_URL.";
  } else {
    warning = "CV model host URL not configured. Using fallback signal.";
  }

  const payload = buildMobileFramePayload(frameTimestampMs, signal);
  if (mode === "model") {
    void ingestLiveSignal(payload, options.sessionId).catch(() => {
      // Keep overlay streaming responsive even if summary ingest intermittently fails.
    });
  } else {
    await ingestLiveSignal(payload, options.sessionId);
  }

  return { mode, warning, overlay, cvAssist, signal };
};
