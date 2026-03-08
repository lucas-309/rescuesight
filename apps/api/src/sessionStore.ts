import { randomUUID } from "node:crypto";
import type {
  CreateEmergencySessionRequest,
  CvLiveSummary,
  DispatchRequest,
  EmergencySession,
  EmergencySessionEvent,
  EmergencySessionEventType,
  EmergencySessionStatus,
  EmergencySoapReport,
  SubmitSessionQuestionnaireRequest,
} from "@rescuesight/shared";

const copySession = (session: EmergencySession): EmergencySession => ({
  ...session,
  location: session.location ? { ...session.location } : undefined,
  personDownSignal: session.personDownSignal ? { ...session.personDownSignal } : undefined,
  victimSnapshot: session.victimSnapshot ? { ...session.victimSnapshot } : undefined,
  liveSummary: session.liveSummary
    ? {
        ...session.liveSummary,
        signal: { ...session.liveSummary.signal },
        personDownSignal: { ...session.liveSummary.personDownSignal },
        victimSnapshot: session.liveSummary.victimSnapshot
          ? { ...session.liveSummary.victimSnapshot }
          : undefined,
        location: session.liveSummary.location ? { ...session.liveSummary.location } : undefined,
      }
    : undefined,
  questionnaire: {
    ...session.questionnaire,
    answers: session.questionnaire.answers ? { ...session.questionnaire.answers } : undefined,
  },
  soapReport: session.soapReport
    ? {
        ...session.soapReport,
      }
    : undefined,
  dispatchRequest: session.dispatchRequest
    ? {
        ...session.dispatchRequest,
        location: { ...session.dispatchRequest.location },
        questionnaire: { ...session.dispatchRequest.questionnaire },
        personDownSignal: { ...session.dispatchRequest.personDownSignal },
        victimSnapshot: session.dispatchRequest.victimSnapshot
          ? { ...session.dispatchRequest.victimSnapshot }
          : undefined,
        assignment: session.dispatchRequest.assignment
          ? { ...session.dispatchRequest.assignment }
          : undefined,
      }
    : undefined,
  events: session.events.map((event) => ({ ...event })),
});

const deriveStatus = (session: EmergencySession): EmergencySessionStatus => {
  const dispatchStatus = session.dispatchRequest?.status;
  if (dispatchStatus === "resolved") {
    return "resolved";
  }
  if (dispatchStatus === "dispatched") {
    return "dispatched";
  }
  if (dispatchStatus === "pending_review") {
    return "dispatch_requested";
  }
  if (session.questionnaire.answers) {
    return "questionnaire_completed";
  }
  if (session.questionnaire.startedAtIso) {
    return "questionnaire_in_progress";
  }
  if (session.liveSummary || session.personDownSignal) {
    return "monitoring";
  }
  return "open";
};

const sanitizeSoapCombinedText = (value: string): string => value.trim().slice(0, 12_000);

const createEvent = (
  type: EmergencySessionEventType,
  summary: string,
  createdAtIso: string,
): EmergencySessionEvent => ({
  id: randomUUID(),
  createdAtIso,
  type,
  summary,
});

export class InMemorySessionStore {
  private readonly sessions = new Map<string, EmergencySession>();
  private readonly sessionIdByDispatchRequestId = new Map<string, string>();

  createSession(payload: CreateEmergencySessionRequest): EmergencySession {
    const nowIso = new Date().toISOString();
    const session: EmergencySession = {
      id: randomUUID(),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      source: payload.source ?? "api",
      sourceDeviceId: payload.sourceDeviceId,
      status: "open",
      location: payload.location ? { ...payload.location } : undefined,
      questionnaire: {},
      events: [createEvent("session_created", "Emergency session created.", nowIso)],
    };
    session.status = deriveStatus(session);
    this.sessions.set(session.id, session);
    return copySession(session);
  }

  getSession(sessionId: string): EmergencySession | null {
    const session = this.sessions.get(sessionId);
    return session ? copySession(session) : null;
  }

  listSessions(): EmergencySession[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso))
      .map((session) => copySession(session));
  }

  recordLiveSummary(sessionId: string, summary: CvLiveSummary): EmergencySession | null {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const next: EmergencySession = {
      ...existing,
      updatedAtIso: nowIso,
      sourceDeviceId: summary.sourceDeviceId ?? existing.sourceDeviceId,
      location: summary.location ? { ...summary.location } : existing.location,
      personDownSignal: { ...summary.personDownSignal },
      victimSnapshot: summary.victimSnapshot
        ? { ...summary.victimSnapshot }
        : existing.victimSnapshot,
      liveSummary: {
        ...summary,
        signal: { ...summary.signal },
        personDownSignal: { ...summary.personDownSignal },
        victimSnapshot: summary.victimSnapshot ? { ...summary.victimSnapshot } : undefined,
        location: summary.location ? { ...summary.location } : undefined,
      },
      events: [
        ...existing.events,
        createEvent(
          "cv_signal",
          `CV signal ingested (${summary.personDownSignal.status} @ ${summary.personDownSignal.confidence.toFixed(2)}).`,
          nowIso,
        ),
      ],
    };
    next.status = deriveStatus(next);

    this.sessions.set(sessionId, next);
    return copySession(next);
  }

  startQuestionnaire(sessionId: string, startedAtIso?: string): EmergencySession | null {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }

    if (existing.questionnaire.startedAtIso) {
      return copySession(existing);
    }

    const nowIso = new Date().toISOString();
    const next: EmergencySession = {
      ...existing,
      updatedAtIso: nowIso,
      questionnaire: {
        ...existing.questionnaire,
        startedAtIso: startedAtIso ?? nowIso,
      },
      events: [
        ...existing.events,
        createEvent("questionnaire_started", "Questionnaire started.", nowIso),
      ],
    };
    next.status = deriveStatus(next);

    this.sessions.set(sessionId, next);
    return copySession(next);
  }

  submitQuestionnaire(
    sessionId: string,
    payload: SubmitSessionQuestionnaireRequest,
    soapReport?: EmergencySoapReport,
  ): EmergencySession | null {
    const started = this.startQuestionnaire(sessionId, payload.startedAtIso);
    if (!started) {
      return null;
    }

    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const next: EmergencySession = {
      ...existing,
      updatedAtIso: nowIso,
      questionnaire: {
        ...existing.questionnaire,
        answers: { ...payload.questionnaire },
        submittedAtIso: payload.submittedAtIso ?? nowIso,
      },
      soapReport: soapReport ? { ...soapReport } : existing.soapReport,
      events: [
        ...existing.events,
        createEvent("questionnaire_submitted", "Questionnaire submitted.", nowIso),
        ...(soapReport
          ? [createEvent("soap_generated", "SOAP report generated.", nowIso)]
          : []),
      ],
    };
    next.status = deriveStatus(next);

    this.sessions.set(sessionId, next);
    return copySession(next);
  }

  updateSoapReport(sessionId: string, combinedText: string, editor?: string): EmergencySession | null {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }
    if (!existing.soapReport) {
      return null;
    }

    const sanitized = sanitizeSoapCombinedText(combinedText);
    if (!sanitized) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const summary = editor?.trim()
      ? `SOAP report edited by ${editor.trim()}.`
      : "SOAP report edited.";

    const next: EmergencySession = {
      ...existing,
      updatedAtIso: nowIso,
      soapReport: {
        ...existing.soapReport,
        combinedText: sanitized,
      },
      events: [
        ...existing.events,
        createEvent("soap_edited", summary, nowIso),
      ],
    };
    next.status = deriveStatus(next);

    this.sessions.set(sessionId, next);
    return copySession(next);
  }

  attachDispatchRequest(sessionId: string, dispatchRequest: DispatchRequest): EmergencySession | null {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const next: EmergencySession = {
      ...existing,
      updatedAtIso: nowIso,
      dispatchRequest: {
        ...dispatchRequest,
        location: { ...dispatchRequest.location },
        questionnaire: { ...dispatchRequest.questionnaire },
        personDownSignal: { ...dispatchRequest.personDownSignal },
        victimSnapshot: dispatchRequest.victimSnapshot
          ? { ...dispatchRequest.victimSnapshot }
          : undefined,
        assignment: dispatchRequest.assignment ? { ...dispatchRequest.assignment } : undefined,
      },
      events: [
        ...existing.events,
        createEvent("dispatch_requested", `Dispatch request ${dispatchRequest.id} created.`, nowIso),
      ],
    };
    next.status = deriveStatus(next);
    this.sessions.set(sessionId, next);
    this.sessionIdByDispatchRequestId.set(dispatchRequest.id, sessionId);
    return copySession(next);
  }

  syncDispatchRequest(dispatchRequest: DispatchRequest): EmergencySession | null {
    const sessionId = this.sessionIdByDispatchRequestId.get(dispatchRequest.id);
    if (!sessionId) {
      return null;
    }

    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const next: EmergencySession = {
      ...existing,
      updatedAtIso: nowIso,
      dispatchRequest: {
        ...dispatchRequest,
        location: { ...dispatchRequest.location },
        questionnaire: { ...dispatchRequest.questionnaire },
        personDownSignal: { ...dispatchRequest.personDownSignal },
        victimSnapshot: dispatchRequest.victimSnapshot
          ? { ...dispatchRequest.victimSnapshot }
          : undefined,
        assignment: dispatchRequest.assignment ? { ...dispatchRequest.assignment } : undefined,
      },
    };
    next.status = deriveStatus(next);

    this.sessions.set(sessionId, next);
    return copySession(next);
  }
}
