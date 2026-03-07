import type {
  AedStatus,
  IncidentActionKey,
  IncidentStatus,
  IncidentTimelineInput,
  PersistIncidentRequest,
  TriageAnswers,
  UpdateIncidentRequest,
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
