import type {
  IncidentActionKey,
  IncidentRecord,
  IncidentTimeline,
  TriageResult,
  XrIncidentOverlayResponse,
  XrOverlayAnchor,
  XrOverlayStep,
} from "@rescuesight/shared";

const defaultAnchor: XrOverlayAnchor = {
  kind: "head_locked",
  target: "helper_panel",
};

const textHas = (value: string, keyword: string): boolean =>
  value.toLowerCase().includes(keyword.toLowerCase());

const inferLinkedAction = (text: string): IncidentActionKey | undefined => {
  if (textHas(text, "call emergency services")) {
    return "emsCalled";
  }
  if (
    textHas(text, "chest compressions") ||
    textHas(text, "start cpr") ||
    textHas(text, "continue cpr")
  ) {
    return "cprStarted";
  }
  if (textHas(text, "retrieve the nearest aed") || textHas(text, "retrieve/use aed")) {
    return "aedRequested";
  }
  if (textHas(text, "use the aed as soon as it arrives")) {
    return "aedArrived";
  }
  if (
    textHas(text, "time symptoms were first observed") ||
    textHas(text, "last known normal")
  ) {
    return "strokeOnsetRecorded";
  }

  return undefined;
};

const inferAnchor = (text: string): XrOverlayAnchor => {
  if (
    textHas(text, "chest") ||
    textHas(text, "compressions") ||
    textHas(text, "sternum")
  ) {
    return {
      kind: "world_locked",
      target: "patient_chest_center",
    };
  }

  if (
    textHas(text, "breathing") ||
    textHas(text, "responsive") ||
    textHas(text, "face drooping") ||
    textHas(text, "speech")
  ) {
    return {
      kind: "world_locked",
      target: "patient_head_side",
    };
  }

  return defaultAnchor;
};

const isStepCompleted = (
  linkedAction: IncidentActionKey | undefined,
  timeline: IncidentTimeline,
): boolean | undefined => {
  if (!linkedAction) {
    return undefined;
  }

  return timeline.actionsTaken[linkedAction];
};

const toOverlayStep = (
  id: string,
  text: string,
  source: XrOverlayStep["source"],
  priority: XrOverlayStep["priority"],
  timeline: IncidentTimeline,
): XrOverlayStep => {
  const linkedAction = inferLinkedAction(text);
  return {
    id,
    text,
    source,
    priority,
    anchor: inferAnchor(text),
    requiresConfirmation: source !== "follow_up",
    linkedAction,
    completed: isStepCompleted(linkedAction, timeline),
  };
};

export const buildXrOverlaySteps = (
  result: TriageResult,
  timeline: IncidentTimeline,
): XrOverlayStep[] => {
  const immediate = result.immediateActions.map((text, index) =>
    toOverlayStep(
      `immediate_${index + 1}`,
      text,
      "immediate",
      result.urgency === "critical" ? "critical" : "high",
      timeline,
    ),
  );

  const followUp = result.followUpActions.map((text, index) =>
    toOverlayStep(`follow_up_${index + 1}`, text, "follow_up", "info", timeline),
  );

  const cpr = result.cprGuidance
    ? result.cprGuidance.instructions.map((text, index) =>
        toOverlayStep(`cpr_${index + 1}`, text, "cpr", "critical", timeline),
      )
    : [];

  return [...immediate, ...cpr, ...followUp];
};

export const buildXrIncidentOverlayResponse = (
  incident: IncidentRecord,
): XrIncidentOverlayResponse => ({
  incidentId: incident.id,
  triage: incident.evaluation,
  overlaySteps: buildXrOverlaySteps(incident.evaluation.result, incident.timeline),
  timeline: incident.timeline,
  transitionGate: {
    blocked: false,
    reason: "No blocking checkpoints remain for current urgency.",
    requiredCheckpointIds: [],
  },
  safetyNotice: incident.evaluation.result.safetyNotice,
});
