import { randomUUID } from "node:crypto";
import type {
  IncidentActionKey,
  IncidentRecord,
  IncidentTimeline,
  IncidentTimelineInput,
  PersistIncidentRequest,
  TriageEvaluationResponse,
  UpdateIncidentRequest,
} from "@rescuesight/shared";
import { evaluateTriage } from "./triageEngine.js";

const INCIDENT_ACTION_KEYS: IncidentActionKey[] = [
  "emsCalled",
  "cprStarted",
  "aedRequested",
  "aedArrived",
  "strokeOnsetRecorded",
];

const createDefaultActions = (): Record<IncidentActionKey, boolean> => ({
  emsCalled: false,
  cprStarted: false,
  aedRequested: false,
  aedArrived: false,
  strokeOnsetRecorded: false,
});

export const defaultTimeline = (): IncidentTimeline => ({
  firstObservedAtLocal: "",
  responderNotes: "",
  aedStatus: "unknown",
  actionsTaken: createDefaultActions(),
});

const mergeTimeline = (
  current: IncidentTimeline,
  incoming?: IncidentTimelineInput,
): IncidentTimeline => {
  const next: IncidentTimeline = {
    ...current,
    actionsTaken: {
      ...current.actionsTaken,
    },
  };

  if (!incoming) {
    return next;
  }

  if (typeof incoming.firstObservedAtLocal === "string") {
    next.firstObservedAtLocal = incoming.firstObservedAtLocal;
  }

  if (typeof incoming.responderNotes === "string") {
    next.responderNotes = incoming.responderNotes;
  }

  if (incoming.aedStatus) {
    next.aedStatus = incoming.aedStatus;
  }

  if (incoming.actionsTaken) {
    for (const key of INCIDENT_ACTION_KEYS) {
      const value = incoming.actionsTaken[key];
      if (typeof value === "boolean") {
        next.actionsTaken[key] = value;
      }
    }
  }

  return next;
};

const copyTimeline = (timeline: IncidentTimeline): IncidentTimeline => ({
  ...timeline,
  actionsTaken: {
    ...timeline.actionsTaken,
  },
});

const sanitizeHandoffSummary = (input: string | undefined): string => {
  if (typeof input !== "string") {
    return "";
  }
  return input.slice(0, 8000);
};

const createEvaluation = (
  answers: PersistIncidentRequest["answers"],
  nowIso: string,
): TriageEvaluationResponse => ({
  result: evaluateTriage(answers),
  evaluatedAtIso: nowIso,
});

const copyIncident = (incident: IncidentRecord): IncidentRecord => ({
  ...incident,
  answers: {
    ...incident.answers,
    strokeSigns: {
      ...incident.answers.strokeSigns,
    },
    heartRelatedSigns: {
      ...incident.answers.heartRelatedSigns,
    },
  },
  evaluation: {
    ...incident.evaluation,
    result: {
      ...incident.evaluation.result,
      immediateActions: [...incident.evaluation.result.immediateActions],
      followUpActions: [...incident.evaluation.result.followUpActions],
      cprGuidance: incident.evaluation.result.cprGuidance
        ? {
            targetBpmRange: [...incident.evaluation.result.cprGuidance.targetBpmRange] as [
              number,
              number,
            ],
            instructions: [...incident.evaluation.result.cprGuidance.instructions],
          }
        : undefined,
    },
  },
  timeline: copyTimeline(incident.timeline),
});

export class InMemoryIncidentStore {
  private readonly incidents = new Map<string, IncidentRecord>();

  createIncident(payload: PersistIncidentRequest): IncidentRecord {
    const nowIso = new Date().toISOString();
    const record: IncidentRecord = {
      id: randomUUID(),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      status: "open",
      source: payload.source ?? "web",
      answers: {
        ...payload.answers,
        strokeSigns: { ...payload.answers.strokeSigns },
        heartRelatedSigns: { ...payload.answers.heartRelatedSigns },
      },
      evaluation: createEvaluation(payload.answers, nowIso),
      timeline: mergeTimeline(defaultTimeline(), payload.timeline),
      handoffSummary: sanitizeHandoffSummary(payload.handoffSummary),
    };

    this.incidents.set(record.id, record);
    return copyIncident(record);
  }

  getIncident(id: string): IncidentRecord | null {
    const found = this.incidents.get(id);
    return found ? copyIncident(found) : null;
  }

  listIncidents(): IncidentRecord[] {
    return [...this.incidents.values()]
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
      .map((incident) => copyIncident(incident));
  }

  updateIncident(id: string, update: UpdateIncidentRequest): IncidentRecord | null {
    const existing = this.incidents.get(id);
    if (!existing) {
      return null;
    }

    const next: IncidentRecord = {
      ...existing,
      updatedAtIso: new Date().toISOString(),
      status: update.status ?? existing.status,
      handoffSummary:
        typeof update.handoffSummary === "string"
          ? sanitizeHandoffSummary(update.handoffSummary)
          : existing.handoffSummary,
      timeline: mergeTimeline(existing.timeline, update.timeline),
    };

    this.incidents.set(id, next);
    return copyIncident(next);
  }
}
