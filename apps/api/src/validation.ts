import type {
  AedStatus,
  CreateDispatchRequest,
  CreatePersonDownEventRequest,
  CvCompressionRhythmQuality,
  CvHandPlacementStatus,
  CvVisibility,
  DispatchRequestStatus,
  EmergencyQuestionnaire,
  IncidentActionKey,
  IncidentStatus,
  IncidentTimelineInput,
  PersonDownSignal,
  PersistIncidentRequest,
  TriageAnswers,
  UpdateDispatchRequest,
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
const PERSON_DOWN_SIGNAL_STATUS_VALUES: PersonDownSignal["status"][] = [
  "person_down",
  "not_person_down",
  "uncertain",
];
const PERSON_DOWN_SIGNAL_SOURCE_VALUES: PersonDownSignal["source"][] = [
  "cv",
  "manual",
  "api",
];
const QUESTIONNAIRE_RESPONSIVENESS_VALUES: EmergencyQuestionnaire["responsiveness"][] = [
  "responsive",
  "unresponsive",
  "unknown",
];
const QUESTIONNAIRE_BREATHING_VALUES: EmergencyQuestionnaire["breathing"][] = [
  "normal",
  "abnormal_or_absent",
  "unknown",
];
const QUESTIONNAIRE_PULSE_VALUES: EmergencyQuestionnaire["pulse"][] = [
  "present",
  "absent",
  "unknown",
];
const DISPATCH_STATUS_VALUES: DispatchRequestStatus[] = [
  "pending_review",
  "dispatched",
  "resolved",
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

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

const isValidDispatchStatus = (value: unknown): value is DispatchRequestStatus =>
  typeof value === "string" && DISPATCH_STATUS_VALUES.includes(value as DispatchRequestStatus);

const isValidPersonDownSignal = (value: unknown): value is PersonDownSignal => {
  if (!isObject(value)) {
    return false;
  }

  if (
    typeof value.status !== "string" ||
    !PERSON_DOWN_SIGNAL_STATUS_VALUES.includes(value.status as PersonDownSignal["status"])
  ) {
    return false;
  }

  if (!isFiniteNumber(value.confidence)) {
    return false;
  }

  if (
    typeof value.source !== "string" ||
    !PERSON_DOWN_SIGNAL_SOURCE_VALUES.includes(value.source as PersonDownSignal["source"])
  ) {
    return false;
  }

  if (value.frameTimestampMs !== undefined && !isFiniteNumber(value.frameTimestampMs)) {
    return false;
  }

  if (value.observedAtIso !== undefined && typeof value.observedAtIso !== "string") {
    return false;
  }

  return true;
};

const isValidDispatchLocation = (value: unknown): value is CreateDispatchRequest["location"] => {
  if (!isObject(value)) {
    return false;
  }

  if (typeof value.label !== "string") {
    return false;
  }

  if (!isFiniteNumber(value.latitude) || !isFiniteNumber(value.longitude)) {
    return false;
  }

  if (value.accuracyMeters !== undefined && !isFiniteNumber(value.accuracyMeters)) {
    return false;
  }

  if (value.indoorDescriptor !== undefined && typeof value.indoorDescriptor !== "string") {
    return false;
  }

  return true;
};

const isValidEmergencyQuestionnaire = (
  value: unknown,
): value is CreateDispatchRequest["questionnaire"] => {
  if (!isObject(value)) {
    return false;
  }

  if (
    typeof value.responsiveness !== "string" ||
    !QUESTIONNAIRE_RESPONSIVENESS_VALUES.includes(
      value.responsiveness as EmergencyQuestionnaire["responsiveness"],
    )
  ) {
    return false;
  }

  if (
    typeof value.breathing !== "string" ||
    !QUESTIONNAIRE_BREATHING_VALUES.includes(value.breathing as EmergencyQuestionnaire["breathing"])
  ) {
    return false;
  }

  if (
    typeof value.pulse !== "string" ||
    !QUESTIONNAIRE_PULSE_VALUES.includes(value.pulse as EmergencyQuestionnaire["pulse"])
  ) {
    return false;
  }

  if (!isBoolean(value.severeBleeding) || !isBoolean(value.majorTrauma)) {
    return false;
  }

  if (value.notes !== undefined && typeof value.notes !== "string") {
    return false;
  }

  return true;
};

export const isValidCreatePersonDownEventRequest = (
  value: unknown,
): value is CreatePersonDownEventRequest => {
  if (!isObject(value)) {
    return false;
  }

  if (!isValidPersonDownSignal(value.signal)) {
    return false;
  }

  if (value.location !== undefined && !isValidDispatchLocation(value.location)) {
    return false;
  }

  if (value.sourceDeviceId !== undefined && typeof value.sourceDeviceId !== "string") {
    return false;
  }

  return true;
};

export const isValidCreateDispatchRequest = (
  value: unknown,
): value is CreateDispatchRequest => {
  if (!isObject(value)) {
    return false;
  }

  if (!isValidEmergencyQuestionnaire(value.questionnaire)) {
    return false;
  }

  if (!isValidDispatchLocation(value.location)) {
    return false;
  }

  if (!isValidPersonDownSignal(value.personDownSignal)) {
    return false;
  }

  if (
    value.emergencyCallRequested !== undefined &&
    !isBoolean(value.emergencyCallRequested)
  ) {
    return false;
  }

  return true;
};

export const isValidUpdateDispatchRequest = (
  value: unknown,
): value is UpdateDispatchRequest => {
  if (!isObject(value)) {
    return false;
  }

  const hasKnownField =
    value.status !== undefined || value.assignment !== undefined || value.dispatchNotes !== undefined;
  if (!hasKnownField) {
    return false;
  }

  if (value.status !== undefined && !isValidDispatchStatus(value.status)) {
    return false;
  }

  if (value.dispatchNotes !== undefined && typeof value.dispatchNotes !== "string") {
    return false;
  }

  if (value.assignment !== undefined) {
    if (!isObject(value.assignment)) {
      return false;
    }
    if (typeof value.assignment.unitId !== "string") {
      return false;
    }
    if (typeof value.assignment.dispatcher !== "string") {
      return false;
    }
    if (!isFiniteNumber(value.assignment.etaMinutes)) {
      return false;
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

export const dispatchLocationPayloadShape = {
  label: "string",
  latitude: "number",
  longitude: "number",
  accuracyMeters: "number (optional)",
  indoorDescriptor: "string (optional)",
};

export const personDownSignalPayloadShape = {
  status: "person_down | not_person_down | uncertain",
  confidence: "number",
  source: "cv | manual | api",
  frameTimestampMs: "number (optional)",
  observedAtIso: "string (optional)",
};

export const createPersonDownEventPayloadShape = {
  signal: personDownSignalPayloadShape,
  location: dispatchLocationPayloadShape,
  sourceDeviceId: "string (optional)",
};

export const dispatchQuestionnairePayloadShape = {
  responsiveness: "responsive | unresponsive | unknown",
  breathing: "normal | abnormal_or_absent | unknown",
  pulse: "present | absent | unknown",
  severeBleeding: "boolean",
  majorTrauma: "boolean",
  notes: "string (optional)",
};

export const createDispatchRequestPayloadShape = {
  questionnaire: dispatchQuestionnairePayloadShape,
  location: dispatchLocationPayloadShape,
  personDownSignal: personDownSignalPayloadShape,
  emergencyCallRequested: "boolean (optional)",
};

export const updateDispatchRequestPayloadShape = {
  status: "pending_review | dispatched | resolved (optional)",
  assignment: {
    unitId: "string",
    dispatcher: "string",
    etaMinutes: "number",
  },
  dispatchNotes: "string (optional)",
};
