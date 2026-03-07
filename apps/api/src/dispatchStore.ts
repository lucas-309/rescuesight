import { randomUUID } from "node:crypto";
import type {
  CreateDispatchRequest,
  CreatePersonDownEventRequest,
  DispatchPriority,
  DispatchRequest,
  DispatchRequestStatus,
  EmergencyQuestionnaire,
  PersonDownEvent,
  PersonDownSignal,
  UpdateDispatchRequest,
} from "@rescuesight/shared";

const SAFETY_NOTICE =
  "Dispatch queue data is assistive and bystander-reported. It does not replace emergency professional judgment.";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sanitizeSignal = (signal: PersonDownSignal): PersonDownSignal => ({
  ...signal,
  confidence: clamp(signal.confidence, 0, 1),
});

const inferPriority = (
  questionnaire: EmergencyQuestionnaire,
  signal: PersonDownSignal,
): DispatchPriority => {
  const cardiacArrestPattern =
    questionnaire.responsiveness === "unresponsive" &&
    questionnaire.breathing === "abnormal_or_absent";
  const absentPulse = questionnaire.pulse === "absent";
  const highConfidenceDown = signal.status === "person_down" && signal.confidence >= 0.75;

  if (cardiacArrestPattern || absentPulse || questionnaire.severeBleeding) {
    return "critical";
  }
  if (highConfidenceDown && questionnaire.breathing !== "normal") {
    return "critical";
  }
  return "high";
};

const inferRecommendedPriority = (signal: PersonDownSignal): DispatchPriority =>
  signal.status === "person_down" && signal.confidence >= 0.75 ? "critical" : "high";

const requiresQuestionnaire = (signal: PersonDownSignal): boolean =>
  signal.status === "person_down" && signal.confidence >= 0.65;

const copyDispatch = (request: DispatchRequest): DispatchRequest => ({
  ...request,
  location: { ...request.location },
  questionnaire: { ...request.questionnaire },
  personDownSignal: { ...request.personDownSignal },
  assignment: request.assignment ? { ...request.assignment } : undefined,
});

const copyEvent = (event: PersonDownEvent): PersonDownEvent => ({
  ...event,
  signal: { ...event.signal },
  location: event.location ? { ...event.location } : undefined,
});

const sanitizeNotes = (value: string | undefined): string => (typeof value === "string" ? value.slice(0, 4_000) : "");

export class InMemoryDispatchStore {
  private readonly events = new Map<string, PersonDownEvent>();
  private readonly requests = new Map<string, DispatchRequest>();

  createPersonDownEvent(payload: CreatePersonDownEventRequest): PersonDownEvent {
    const nowIso = new Date().toISOString();
    const signal = sanitizeSignal(payload.signal);
    const event: PersonDownEvent = {
      id: randomUUID(),
      createdAtIso: nowIso,
      signal,
      location: payload.location ? { ...payload.location } : undefined,
      sourceDeviceId: payload.sourceDeviceId,
      questionnaireRequired: requiresQuestionnaire(signal),
      recommendedPriority: inferRecommendedPriority(signal),
      safetyNotice: SAFETY_NOTICE,
    };

    this.events.set(event.id, event);
    return copyEvent(event);
  }

  getPersonDownEvent(eventId: string): PersonDownEvent | null {
    const found = this.events.get(eventId);
    return found ? copyEvent(found) : null;
  }

  listPersonDownEvents(): PersonDownEvent[] {
    return [...this.events.values()]
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
      .map((event) => copyEvent(event));
  }

  createDispatchRequest(payload: CreateDispatchRequest): DispatchRequest {
    const nowIso = new Date().toISOString();
    const signal = sanitizeSignal(payload.personDownSignal);
    const request: DispatchRequest = {
      id: randomUUID(),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      status: "pending_review",
      priority: inferPriority(payload.questionnaire, signal),
      location: { ...payload.location },
      questionnaire: {
        ...payload.questionnaire,
      },
      personDownSignal: signal,
      emergencyCallRequested: payload.emergencyCallRequested ?? true,
      dispatchNotes: "",
      safetyNotice: SAFETY_NOTICE,
    };

    this.requests.set(request.id, request);
    return copyDispatch(request);
  }

  getDispatchRequest(requestId: string): DispatchRequest | null {
    const found = this.requests.get(requestId);
    return found ? copyDispatch(found) : null;
  }

  listDispatchRequests(status?: DispatchRequestStatus): DispatchRequest[] {
    return [...this.requests.values()]
      .filter((request) => (status ? request.status === status : true))
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
      .map((request) => copyDispatch(request));
  }

  updateDispatchRequest(requestId: string, update: UpdateDispatchRequest): DispatchRequest | null {
    const existing = this.requests.get(requestId);
    if (!existing) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const nextStatus = update.status ?? (update.assignment ? "dispatched" : existing.status);
    const next: DispatchRequest = {
      ...existing,
      updatedAtIso: nowIso,
      status: nextStatus,
      dispatchNotes:
        update.dispatchNotes !== undefined
          ? sanitizeNotes(update.dispatchNotes)
          : existing.dispatchNotes,
      assignment: update.assignment
        ? {
            ...update.assignment,
            assignedAtIso: nowIso,
          }
        : existing.assignment,
    };

    this.requests.set(requestId, next);
    return copyDispatch(next);
  }
}
