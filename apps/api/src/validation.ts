import type {
  AedStatus,
  CvCompressionRhythmQuality,
  CvHandPlacementStatus,
  CvVisibility,
  IncidentActionKey,
  IncidentStatus,
  IncidentTimelineInput,
  PersistIncidentRequest,
  TriageAnswers,
  UpdateIncidentRequest,
  XrDeviceContext,
  XrIncidentActionUpdateRequest,
  XrTriageHookRequest,
} from "@rescuesight/shared";

const INCIDENT_ACTION_KEYS: IncidentActionKey[] = [
  "emsCalled",
  "cprStarted",
  "aedRequested",
  "aedArrived",
  "strokeOnsetRecorded",
];

const AED_STATUS_VALUES: AedStatus[] = [
  "unknown",
  "not_available",
  "retrieval_in_progress",
  "on_scene",
];

const INCIDENT_STATUS_VALUES: IncidentStatus[] = ["open", "closed"];
const INCIDENT_SOURCE_VALUES: PersistIncidentRequest["source"][] = ["web", "xr", "api"];
const XR_DEVICE_MODEL_VALUES: NonNullable<XrDeviceContext["deviceModel"]>[] = [
  "meta_quest_3",
  "meta_quest_3s",
  "unknown",
];
const XR_INTERACTION_MODE_VALUES: NonNullable<XrDeviceContext["interactionMode"]>[] = [
  "controllers",
  "hands",
  "mixed",
];
const CV_HAND_PLACEMENT_VALUES: CvHandPlacementStatus[] = [
  "correct",
  "too_high",
  "too_low",
  "too_left",
  "too_right",
  "unknown",
];
const CV_RHYTHM_VALUES: CvCompressionRhythmQuality[] = [
  "good",
  "too_slow",
  "too_fast",
  "inconsistent",
  "unknown",
];
const CV_VISIBILITY_VALUES: CvVisibility[] = ["full", "partial", "poor"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export const isValidAnswers = (value: unknown): value is TriageAnswers => {
  if (!isObject(value)) {
    return false;
  }

  const strokeSigns = value.strokeSigns;
  const heartSigns = value.heartRelatedSigns;

  return (
    isBoolean(value.responsive) &&
    isBoolean(value.breathingNormal) &&
    isObject(strokeSigns) &&
    isBoolean(strokeSigns.faceDrooping) &&
    isBoolean(strokeSigns.armWeakness) &&
    isBoolean(strokeSigns.speechDifficulty) &&
    isObject(heartSigns) &&
    isBoolean(heartSigns.chestDiscomfort) &&
    isBoolean(heartSigns.shortnessOfBreath) &&
    isBoolean(heartSigns.coldSweat) &&
    isBoolean(heartSigns.nauseaOrUpperBodyDiscomfort)
  );
};

const isValidAedStatus = (value: unknown): value is AedStatus =>
  typeof value === "string" && AED_STATUS_VALUES.includes(value as AedStatus);

const isValidIncidentStatus = (value: unknown): value is IncidentStatus =>
  typeof value === "string" && INCIDENT_STATUS_VALUES.includes(value as IncidentStatus);

const isValidIncidentSource = (
  value: unknown,
): value is NonNullable<PersistIncidentRequest["source"]> =>
  typeof value === "string" && INCIDENT_SOURCE_VALUES.includes(value as PersistIncidentRequest["source"]);

const isValidIncidentActionKey = (value: unknown): value is IncidentActionKey =>
  typeof value === "string" && INCIDENT_ACTION_KEYS.includes(value as IncidentActionKey);

const isValidTimelineInput = (value: unknown): value is IncidentTimelineInput => {
  if (!isObject(value)) {
    return false;
  }

  if (value.firstObservedAtLocal !== undefined && typeof value.firstObservedAtLocal !== "string") {
    return false;
  }

  if (value.responderNotes !== undefined && typeof value.responderNotes !== "string") {
    return false;
  }

  if (value.aedStatus !== undefined && !isValidAedStatus(value.aedStatus)) {
    return false;
  }

  if (value.actionsTaken !== undefined) {
    if (!isObject(value.actionsTaken)) {
      return false;
    }

    for (const [key, actionValue] of Object.entries(value.actionsTaken)) {
      if (!INCIDENT_ACTION_KEYS.includes(key as IncidentActionKey)) {
        return false;
      }
      if (!isBoolean(actionValue)) {
        return false;
      }
    }
  }

  return true;
};

const isValidXrDeviceContext = (value: unknown): value is XrDeviceContext => {
  if (!isObject(value)) {
    return false;
  }

  if (value.deviceModel !== undefined) {
    if (
      typeof value.deviceModel !== "string" ||
      !XR_DEVICE_MODEL_VALUES.includes(value.deviceModel as NonNullable<XrDeviceContext["deviceModel"]>)
    ) {
      return false;
    }
  }

  if (value.interactionMode !== undefined) {
    if (
      typeof value.interactionMode !== "string" ||
      !XR_INTERACTION_MODE_VALUES.includes(
        value.interactionMode as NonNullable<XrDeviceContext["interactionMode"]>,
      )
    ) {
      return false;
    }
  }

  if (value.appVersion !== undefined && typeof value.appVersion !== "string") {
    return false;
  }

  if (value.unityVersion !== undefined && typeof value.unityVersion !== "string") {
    return false;
  }

  return true;
};

const isValidXrCvSignal = (
  value: unknown,
): value is NonNullable<XrTriageHookRequest["cvSignal"]> => {
  if (!isObject(value)) {
    return false;
  }

  if (
    typeof value.handPlacementStatus !== "string" ||
    !CV_HAND_PLACEMENT_VALUES.includes(value.handPlacementStatus as CvHandPlacementStatus)
  ) {
    return false;
  }

  if (typeof value.placementConfidence !== "number") {
    return false;
  }

  if (
    typeof value.compressionRhythmQuality !== "string" ||
    !CV_RHYTHM_VALUES.includes(value.compressionRhythmQuality as CvCompressionRhythmQuality)
  ) {
    return false;
  }

  if (
    typeof value.visibility !== "string" ||
    !CV_VISIBILITY_VALUES.includes(value.visibility as CvVisibility)
  ) {
    return false;
  }

  if (typeof value.compressionRateBpm !== "number") {
    return false;
  }

  if (typeof value.frameTimestampMs !== "number") {
    return false;
  }

  return true;
};

export const isValidPersistIncidentRequest = (
  value: unknown,
): value is PersistIncidentRequest => {
  if (!isObject(value)) {
    return false;
  }

  if (!isValidAnswers(value.answers)) {
    return false;
  }

  if (value.timeline !== undefined && !isValidTimelineInput(value.timeline)) {
    return false;
  }

  if (value.handoffSummary !== undefined && typeof value.handoffSummary !== "string") {
    return false;
  }

  if (value.source !== undefined && !isValidIncidentSource(value.source)) {
    return false;
  }

  return true;
};

export const isValidUpdateIncidentRequest = (
  value: unknown,
): value is UpdateIncidentRequest => {
  if (!isObject(value)) {
    return false;
  }

  const hasKnownField =
    value.timeline !== undefined ||
    value.handoffSummary !== undefined ||
    value.status !== undefined;

  if (!hasKnownField) {
    return false;
  }

  if (value.timeline !== undefined && !isValidTimelineInput(value.timeline)) {
    return false;
  }

  if (value.handoffSummary !== undefined && typeof value.handoffSummary !== "string") {
    return false;
  }

  if (value.status !== undefined && !isValidIncidentStatus(value.status)) {
    return false;
  }

  return true;
};

export const isValidXrTriageHookRequest = (
  value: unknown,
): value is XrTriageHookRequest => {
  if (!isObject(value)) {
    return false;
  }

  if (!isValidAnswers(value.answers)) {
    return false;
  }

  if (value.incidentId !== undefined && typeof value.incidentId !== "string") {
    return false;
  }

  if (value.timeline !== undefined && !isValidTimelineInput(value.timeline)) {
    return false;
  }

  if (value.deviceContext !== undefined && !isValidXrDeviceContext(value.deviceContext)) {
    return false;
  }

  if (value.cvSignal !== undefined && !isValidXrCvSignal(value.cvSignal)) {
    return false;
  }

  if (value.acknowledgedCheckpoints !== undefined) {
    if (!Array.isArray(value.acknowledgedCheckpoints)) {
      return false;
    }

    if (!value.acknowledgedCheckpoints.every((entry) => typeof entry === "string")) {
      return false;
    }
  }

  return true;
};

export const isValidXrIncidentActionUpdateRequest = (
  value: unknown,
): value is XrIncidentActionUpdateRequest => {
  if (!isObject(value)) {
    return false;
  }

  if (!isValidIncidentActionKey(value.actionKey)) {
    return false;
  }

  if (!isBoolean(value.completed)) {
    return false;
  }

  if (value.aedStatus !== undefined && !isValidAedStatus(value.aedStatus)) {
    return false;
  }

  if (value.responderNotes !== undefined && typeof value.responderNotes !== "string") {
    return false;
  }

  return true;
};

export const triagePayloadShape = {
  responsive: "boolean",
  breathingNormal: "boolean",
  strokeSigns: {
    faceDrooping: "boolean",
    armWeakness: "boolean",
    speechDifficulty: "boolean",
  },
  heartRelatedSigns: {
    chestDiscomfort: "boolean",
    shortnessOfBreath: "boolean",
    coldSweat: "boolean",
    nauseaOrUpperBodyDiscomfort: "boolean",
  },
};

export const persistIncidentPayloadShape = {
  answers: triagePayloadShape,
  timeline: {
    firstObservedAtLocal: "string (optional)",
    responderNotes: "string (optional)",
    aedStatus: "unknown | not_available | retrieval_in_progress | on_scene (optional)",
    actionsTaken: {
      emsCalled: "boolean (optional)",
      cprStarted: "boolean (optional)",
      aedRequested: "boolean (optional)",
      aedArrived: "boolean (optional)",
      strokeOnsetRecorded: "boolean (optional)",
    },
  },
  handoffSummary: "string (optional)",
  source: "web | xr | api (optional)",
};

export const updateIncidentPayloadShape = {
  timeline: persistIncidentPayloadShape.timeline,
  handoffSummary: "string (optional)",
  status: "open | closed (optional)",
};

export const xrTriageHookPayloadShape = {
  answers: triagePayloadShape,
  incidentId: "string (optional)",
  timeline: persistIncidentPayloadShape.timeline,
  deviceContext: {
    deviceModel: "meta_quest_3 | meta_quest_3s | unknown (optional)",
    interactionMode: "controllers | hands | mixed (optional)",
    appVersion: "string (optional)",
    unityVersion: "string (optional)",
  },
  cvSignal: {
    handPlacementStatus: "correct | too_high | too_low | too_left | too_right | unknown",
    placementConfidence: "number",
    compressionRateBpm: "number",
    compressionRhythmQuality: "good | too_slow | too_fast | inconsistent | unknown",
    visibility: "full | partial | poor",
    frameTimestampMs: "number",
  },
  acknowledgedCheckpoints: ["string (optional)"],
};

export const xrIncidentActionUpdatePayloadShape = {
  actionKey: "emsCalled | cprStarted | aedRequested | aedArrived | strokeOnsetRecorded",
  completed: "boolean",
  aedStatus: "unknown | not_available | retrieval_in_progress | on_scene (optional)",
  responderNotes: "string (optional)",
};
