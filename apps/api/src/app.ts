import cors from "cors";
import express, { type Request, type Response } from "express";
import type {
  CreateEmergencySessionRequest,
  CreateSessionDispatchRequest,
  CreateDispatchRequest,
  CvLiveSignalIngestRequest,
  CvLiveSummary,
  CreatePersonDownEventRequest,
  DispatchRequestStatus,
  EmergencySessionStatus,
  EmergencySoapReport,
  PersonDownSignal,
  PersistIncidentRequest,
  SessionCvSignalRequest,
  SubmitSessionQuestionnaireRequest,
  TriageEvaluationResponse,
  UpdateDispatchRequest,
  UpdateIncidentRequest,
  UpdateSessionSoapReportRequest,
  XrCvAssist,
  XrIncidentActionUpdateRequest,
  XrIncidentOverlayResponse,
  XrOverlayStep,
  XrTransitionGate,
  XrTriageHookRequest,
  XrTriageHookResponse,
} from "@rescuesight/shared";
import { createCvEvaluatorFromEnv, type CvEvaluator } from "./cvClient.js";
import { InMemoryDispatchStore } from "./dispatchStore.js";
import { InMemoryIncidentStore } from "./incidentStore.js";
import { InMemorySessionStore } from "./sessionStore.js";
import {
  createEmergencySessionPayloadShape,
  createSessionDispatchPayloadShape,
  createDispatchRequestPayloadShape,
  cvLiveSignalIngestPayloadShape,
  createPersonDownEventPayloadShape,
  isValidAnswers,
  isValidCvLiveSignalIngestRequest,
  isValidCreateEmergencySessionRequest,
  isValidCreateSessionDispatchRequest,
  isValidCreateDispatchRequest,
  isValidCreatePersonDownEventRequest,
  isValidPersistIncidentRequest,
  isValidSessionCvSignalRequest,
  isValidSubmitSessionQuestionnaireRequest,
  isValidUpdateSessionSoapReportRequest,
  isValidUpdateDispatchRequest,
  isValidUpdateIncidentRequest,
  isValidXrIncidentActionUpdateRequest,
  isValidXrTriageHookRequest,
  persistIncidentPayloadShape,
  sessionCvSignalPayloadShape,
  submitSessionQuestionnairePayloadShape,
  updateSessionSoapReportPayloadShape,
  triagePayloadShape,
  updateDispatchRequestPayloadShape,
  updateIncidentPayloadShape,
  xrIncidentActionUpdatePayloadShape,
  xrTriageHookPayloadShape,
} from "./validation.js";
import { evaluateTriage } from "./triageEngine.js";
import { buildXrIncidentOverlayResponse, buildXrOverlaySteps } from "./xrHooks.js";

interface BuildAppOptions {
  incidentStore?: InMemoryIncidentStore;
  dispatchStore?: InMemoryDispatchStore;
  sessionStore?: InMemorySessionStore;
  cvEvaluator?: CvEvaluator | null;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const inferPersonDownSignalFromLiveCv = (
  signal: CvLiveSignalIngestRequest["signal"],
): PersonDownSignal => {
  let confidence = 0.05;

  const posture = signal.bodyPosture ?? "unknown";
  const postureConfidence = clamp(signal.postureConfidence ?? 0, 0, 1);
  const eyesClosedConfidence = clamp(signal.eyesClosedConfidence ?? 0, 0, 1);
  const hasCprPattern =
    signal.handPlacementStatus !== "unknown" &&
    clamp(signal.placementConfidence, 0, 1) >= 0.55 &&
    signal.compressionRateBpm >= 85 &&
    signal.compressionRhythmQuality !== "unknown";

  if (posture === "lying") {
    confidence += 0.20 + 0.42 * postureConfidence;
  } else if (posture === "sitting") {
    confidence -= 0.20 * Math.max(0.3, postureConfidence);
  } else if (posture === "upright") {
    confidence -= 0.28 * Math.max(0.3, postureConfidence);
  }

  if (eyesClosedConfidence >= 0.4) {
    confidence += 0.16 * eyesClosedConfidence;
  } else if (eyesClosedConfidence >= 0.2) {
    confidence += 0.06 * eyesClosedConfidence;
  }

  if (signal.visibility === "full") {
    confidence += 0.12;
  } else if (signal.visibility === "partial") {
    confidence += 0.06;
  }

  if (signal.handPlacementStatus !== "unknown") {
    confidence += 0.12 * clamp(signal.placementConfidence, 0, 1);
  }

  if (signal.compressionRateBpm >= 85) {
    confidence += 0.2;
  }

  if (signal.compressionRhythmQuality !== "unknown") {
    confidence += 0.08;
  }

  if (hasCprPattern) {
    confidence += 0.24;
  }

  if (signal.visibility === "poor") {
    confidence = Math.min(confidence, 0.35);
  }

  if (
    (posture === "upright" || posture === "sitting") &&
    postureConfidence >= 0.75 &&
    eyesClosedConfidence < 0.45 &&
    !hasCprPattern
  ) {
    confidence = Math.min(confidence, 0.35);
  }

  const bounded = clamp(confidence, 0, 1);
  const status: PersonDownSignal["status"] =
    bounded >= 0.58 ? "person_down" : bounded >= 0.38 ? "uncertain" : "not_person_down";

  return {
    status,
    confidence: Number(bounded.toFixed(3)),
    source: "cv",
    frameTimestampMs: signal.frameTimestampMs,
    observedAtIso: new Date().toISOString(),
  };
};

const buildLiveSummaryText = (
  signal: CvLiveSignalIngestRequest["signal"],
  personDownSignal: PersonDownSignal,
): string => {
  const likelihoodLabel =
    personDownSignal.confidence >= 0.6
      ? "likely"
      : personDownSignal.confidence >= 0.4
      ? "possible"
      : "unlikely";
  const postureLabel = signal.bodyPosture ?? "unknown";

  return [
    `Person-down: ${likelihoodLabel} (${personDownSignal.confidence.toFixed(2)})`,
    `Posture: ${postureLabel} (${(signal.postureConfidence ?? 0).toFixed(2)})`,
    `Eyes-closed: ${(signal.eyesClosedConfidence ?? 0).toFixed(2)}`,
    `Placement: ${signal.handPlacementStatus} (${signal.placementConfidence.toFixed(2)})`,
    `Compression: ${signal.compressionRateBpm} BPM (${signal.compressionRhythmQuality})`,
    `Visibility: ${signal.visibility}`,
  ].join(" | ");
};

const buildSoapReportFromContext = (
  questionnaire: CreateDispatchRequest["questionnaire"],
  liveSummary: CvLiveSummary | undefined,
  location: CreateDispatchRequest["location"] | undefined,
): EmergencySoapReport => {
  const nowIso = new Date().toISOString();
  const likelyCardiacArrest =
    questionnaire.responsiveness === "unresponsive" &&
    questionnaire.breathing === "abnormal_or_absent";
  const critical =
    likelyCardiacArrest ||
    questionnaire.pulse === "absent" ||
    questionnaire.severeBleeding ||
    questionnaire.majorTrauma;
  const acuity: EmergencySoapReport["acuity"] = critical ? "critical" : "high";

  const subjective = [
    `Responsiveness=${questionnaire.responsiveness}, breathing=${questionnaire.breathing}, pulse=${questionnaire.pulse}.`,
    `Severe bleeding=${questionnaire.severeBleeding ? "yes" : "no"}, major trauma=${questionnaire.majorTrauma ? "yes" : "no"}.`,
    questionnaire.notes?.trim() ? `Notes: ${questionnaire.notes.trim()}` : "Notes: none provided.",
  ].join(" ");

  const objectiveParts: string[] = [];
  if (liveSummary) {
    objectiveParts.push(
      `CV person-down=${liveSummary.personDownSignal.status} (${liveSummary.personDownSignal.confidence.toFixed(2)}).`,
    );
    objectiveParts.push(
      `Posture=${liveSummary.signal.bodyPosture ?? "unknown"} (${(liveSummary.signal.postureConfidence ?? 0).toFixed(2)}), eyesClosed=${(liveSummary.signal.eyesClosedConfidence ?? 0).toFixed(2)}.`,
    );
    objectiveParts.push(
      `Compressions=${liveSummary.signal.compressionRateBpm} BPM (${liveSummary.signal.compressionRhythmQuality}), placement=${liveSummary.signal.handPlacementStatus} (${liveSummary.signal.placementConfidence.toFixed(2)}).`,
    );
    if (liveSummary.victimSnapshot?.capturedAtIso) {
      objectiveParts.push(`Victim snapshot captured=${liveSummary.victimSnapshot.capturedAtIso}.`);
    } else if (liveSummary.victimSnapshot?.frameTimestampMs) {
      objectiveParts.push(`Victim snapshot frame=${liveSummary.victimSnapshot.frameTimestampMs}.`);
    }
  } else {
    objectiveParts.push("No live CV summary attached.");
  }
  if (location) {
    objectiveParts.push(
      `Location=${location.label} (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}).`,
    );
  } else {
    objectiveParts.push("Location unavailable.");
  }
  const objective = objectiveParts.join(" ");

  const assessment = likelyCardiacArrest
    ? "Possible out-of-hospital cardiac arrest."
    : critical
    ? "Possible critical medical emergency."
    : "Possible high-acuity medical event.";

  const plan = [
    "Dispatch EMT response and maintain continuous observation.",
    "Re-check responsiveness, breathing, and pulse every 1-2 minutes.",
    likelyCardiacArrest ? "Continue immediate CPR and prepare AED if available." : "",
  ]
    .filter(Boolean)
    .join(" ");

  const combinedText = [
    "SOAP REPORT (assistive draft)",
    `Generated: ${nowIso}`,
    `S: ${subjective}`,
    `O: ${objective}`,
    `A: ${assessment} Acuity=${acuity}.`,
    `P: ${plan}`,
  ].join("\n");

  return {
    generatedAtIso: nowIso,
    acuity,
    subjective,
    objective,
    assessment,
    plan,
    combinedText,
    safetyNotice:
      "SOAP report is assistive and combines CV + questionnaire context. It does not replace clinical judgment.",
  };
};

export const buildApp = (options: BuildAppOptions = {}) => {
  const app = express();
  const incidentStore = options.incidentStore ?? new InMemoryIncidentStore();
  const dispatchStore = options.dispatchStore ?? new InMemoryDispatchStore();
  const sessionStore = options.sessionStore ?? new InMemorySessionStore();
  const cvEvaluator = options.cvEvaluator ?? createCvEvaluatorFromEnv();
  const cvAssistByIncident = new Map<string, XrCvAssist>();
  const blockedCheckpointIdsByIncident = new Map<string, string[]>();
  let latestCvLiveSummary: CvLiveSummary | null = null;
  const dispatchStatuses: DispatchRequestStatus[] = [
    "pending_review",
    "dispatched",
    "resolved",
  ];
  const sessionStatuses: EmergencySessionStatus[] = [
    "open",
    "monitoring",
    "questionnaire_in_progress",
    "questionnaire_completed",
    "dispatch_requested",
    "dispatched",
    "resolved",
  ];

  const toCheckpointOverlaySteps = (cvAssist: XrCvAssist): XrOverlayStep[] =>
    cvAssist.checkpoints
      .filter((checkpoint) => !checkpoint.acknowledged)
      .map((checkpoint) => ({
        id: `checkpoint_${checkpoint.id}`,
        text: `${checkpoint.prompt} ${checkpoint.suggestedAction}`.trim(),
        source: "checkpoint",
        priority: checkpoint.severity === "critical" ? "critical" : "high",
        anchor: {
          kind: "head_locked",
          target: "helper_panel",
        },
        requiresConfirmation: true,
      }));

  const buildTransitionGate = (
    urgency: "critical" | "high",
    cvAssist?: XrCvAssist,
  ): XrTransitionGate => {
    if (!cvAssist) {
      return {
        blocked: false,
        reason: "No CV confirmation checkpoints are active.",
        requiredCheckpointIds: [],
      };
    }

    const blockingIds = cvAssist.checkpoints
      .filter(
        (checkpoint) =>
          !checkpoint.acknowledged &&
          (checkpoint.severity === "critical" || checkpoint.severity === "high"),
      )
      .map((checkpoint) => checkpoint.id);

    const blocked = urgency === "critical" && blockingIds.length > 0;
    return {
      blocked,
      reason: blocked
        ? "Critical progression is blocked until required confirmation checkpoints are acknowledged."
        : "No blocking checkpoints remain for current urgency.",
      requiredCheckpointIds: blockingIds,
    };
  };

  const withXrContext = (
    incidentId: string,
    payload: Omit<XrIncidentOverlayResponse, "transitionGate">,
  ): XrIncidentOverlayResponse => {
    const cvAssist = cvAssistByIncident.get(incidentId);
    const blockedIds = blockedCheckpointIdsByIncident.get(incidentId) ?? [];
    return {
      ...payload,
      cvAssist,
      transitionGate: {
        blocked: blockedIds.length > 0,
        reason:
          blockedIds.length > 0
            ? "Critical progression is blocked until required confirmation checkpoints are acknowledged."
            : "No blocking checkpoints remain for current urgency.",
        requiredCheckpointIds: blockedIds,
      },
    };
  };

  app.use(cors());
  app.use(express.json({ limit: "8mb" }));

  app.get("/", (_req: Request, res: Response) => {
    res.json({
      service: "rescuesight-api",
      status: "ok",
      docs: {
        health: "/health",
        liveCvSummary: "/api/cv/live-summary",
        sessions: "/api/sessions",
        triageQuestions: "/api/triage/questions",
      },
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "rescuesight-api" });
  });

  app.post("/api/sessions", (req: Request, res: Response) => {
    if (!isValidCreateEmergencySessionRequest(req.body)) {
      res.status(400).json({
        error: "Invalid session create payload.",
        expected: createEmergencySessionPayloadShape,
      });
      return;
    }

    const payload = req.body as CreateEmergencySessionRequest;
    const session = sessionStore.createSession(payload);
    res.status(201).json({ session });
  });

  app.get("/api/sessions", (req: Request, res: Response) => {
    const status = req.query.status;
    if (status !== undefined) {
      if (typeof status !== "string" || !sessionStatuses.includes(status as EmergencySessionStatus)) {
        res.status(400).json({
          error: "Invalid session status filter.",
          expected: sessionStatuses,
        });
        return;
      }
    }

    const sessions = sessionStore
      .listSessions()
      .filter((session) => (status ? session.status === status : true));
    res.json({ sessions, count: sessions.length });
  });

  app.get("/api/sessions/:sessionId", (req: Request, res: Response) => {
    const session = sessionStore.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    res.json({ session });
  });

  app.post("/api/sessions/:sessionId/cv-signal", (req: Request, res: Response) => {
    if (!isValidSessionCvSignalRequest(req.body)) {
      res.status(400).json({
        error: "Invalid session CV signal payload.",
        expected: sessionCvSignalPayloadShape,
      });
      return;
    }

    const existing = sessionStore.getSession(req.params.sessionId);
    if (!existing) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    const payload = req.body as SessionCvSignalRequest;
    const personDownSignal = inferPersonDownSignalFromLiveCv(payload.signal);
    const summary: CvLiveSummary = {
      updatedAtIso: new Date().toISOString(),
      signal: payload.signal,
      personDownSignal,
      victimSnapshot: payload.victimSnapshot ?? existing.victimSnapshot,
      summaryText: buildLiveSummaryText(payload.signal, personDownSignal),
      safetyNotice:
        "Live CV summary is assistive only and must be confirmed by a human responder.",
      location: payload.location ?? existing.location,
      sourceDeviceId: payload.sourceDeviceId ?? existing.sourceDeviceId,
    };

    latestCvLiveSummary = summary;
    const updated = sessionStore.recordLiveSummary(req.params.sessionId, summary);
    if (!updated) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    res.status(202).json({ session: updated, summary });
  });

  app.post("/api/sessions/:sessionId/questionnaire", (req: Request, res: Response) => {
    if (!isValidSubmitSessionQuestionnaireRequest(req.body)) {
      res.status(400).json({
        error: "Invalid session questionnaire payload.",
        expected: submitSessionQuestionnairePayloadShape,
      });
      return;
    }

    const existing = sessionStore.getSession(req.params.sessionId);
    if (!existing) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    const payload = req.body as SubmitSessionQuestionnaireRequest;
    const liveSummary = existing.liveSummary ?? undefined;
    const location = existing.location ?? liveSummary?.location;
    const soapReport = buildSoapReportFromContext(payload.questionnaire, liveSummary, location);
    const updated = sessionStore.submitQuestionnaire(req.params.sessionId, payload, soapReport);

    if (!updated) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    res.json({ session: updated, soapReport: updated.soapReport });
  });

  app.patch("/api/sessions/:sessionId/soap-report", (req: Request, res: Response) => {
    if (!isValidUpdateSessionSoapReportRequest(req.body)) {
      res.status(400).json({
        error: "Invalid session SOAP update payload.",
        expected: updateSessionSoapReportPayloadShape,
      });
      return;
    }

    const existing = sessionStore.getSession(req.params.sessionId);
    if (!existing) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (!existing.soapReport) {
      res.status(409).json({
        error: "SOAP report not generated yet. Submit questionnaire before editing SOAP.",
      });
      return;
    }

    const payload = req.body as UpdateSessionSoapReportRequest;
    const updated = sessionStore.updateSoapReport(
      req.params.sessionId,
      payload.combinedText,
      payload.editor,
    );
    if (!updated) {
      res.status(409).json({
        error: "SOAP report update failed.",
      });
      return;
    }

    res.json({ session: updated, soapReport: updated.soapReport });
  });

  app.post("/api/sessions/:sessionId/dispatch-request", (req: Request, res: Response) => {
    if (!isValidCreateSessionDispatchRequest(req.body)) {
      res.status(400).json({
        error: "Invalid session dispatch payload.",
        expected: createSessionDispatchPayloadShape,
      });
      return;
    }

    const existing = sessionStore.getSession(req.params.sessionId);
    if (!existing) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    const payload = req.body as CreateSessionDispatchRequest;
    const questionnaire = payload.questionnaire ?? existing.questionnaire.answers;
    if (!questionnaire) {
      res.status(409).json({
        error: "Questionnaire answers are required before dispatch request creation.",
      });
      return;
    }

    const location = payload.location ?? existing.location ?? existing.liveSummary?.location;
    if (!location) {
      res.status(409).json({
        error: "Location is required before dispatch request creation.",
      });
      return;
    }

    const personDownSignal =
      payload.personDownSignal ?? existing.personDownSignal ?? existing.liveSummary?.personDownSignal;
    if (!personDownSignal) {
      res.status(409).json({
        error: "Person-down signal is required before dispatch request creation.",
      });
      return;
    }

    const request = dispatchStore.createDispatchRequest({
      questionnaire,
      location,
      personDownSignal,
      victimSnapshot:
        payload.victimSnapshot ?? existing.victimSnapshot ?? existing.liveSummary?.victimSnapshot,
      emergencyCallRequested: payload.emergencyCallRequested,
    });

    const updated = sessionStore.attachDispatchRequest(req.params.sessionId, request);
    if (!updated) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    res.status(201).json({
      session: updated,
      request,
      backendEscalation: {
        queued: true,
        channel: "pseudo_hospital_dashboard",
        requestId: request.id,
      },
    });
  });

  app.post("/api/cv/live-signal", (req: Request, res: Response) => {
    if (!isValidCvLiveSignalIngestRequest(req.body)) {
      res.status(400).json({
        error: "Invalid CV live-signal payload.",
        expected: cvLiveSignalIngestPayloadShape,
      });
      return;
    }

    const payload = req.body as CvLiveSignalIngestRequest;
    const personDownSignal = inferPersonDownSignalFromLiveCv(payload.signal);
    const victimSnapshot = payload.victimSnapshot ?? latestCvLiveSummary?.victimSnapshot;
    latestCvLiveSummary = {
      updatedAtIso: new Date().toISOString(),
      signal: payload.signal,
      personDownSignal,
      victimSnapshot,
      summaryText: buildLiveSummaryText(payload.signal, personDownSignal),
      safetyNotice:
        "Live CV summary is assistive only and must be confirmed by a human responder.",
      location: payload.location,
      sourceDeviceId: payload.sourceDeviceId,
    };

    res.status(202).json({ summary: latestCvLiveSummary });
  });

  app.get("/api/cv/live-summary", (_req: Request, res: Response) => {
    if (!latestCvLiveSummary) {
      res.status(404).json({
        error:
          "No live CV summary available yet. Start run_webcam.py with --post-url and stream live signals.",
      });
      return;
    }

    res.json({ summary: latestCvLiveSummary });
  });

  app.post("/api/cv/person-down", (req: Request, res: Response) => {
    if (!isValidCreatePersonDownEventRequest(req.body)) {
      res.status(400).json({
        error: "Invalid person-down event payload.",
        expected: createPersonDownEventPayloadShape,
      });
      return;
    }

    const payload = req.body as CreatePersonDownEventRequest;
    const event = dispatchStore.createPersonDownEvent(payload);
    res.status(201).json({ event });
  });

  app.get("/api/cv/person-down-events", (_req: Request, res: Response) => {
    const events = dispatchStore.listPersonDownEvents();
    res.json({ events, count: events.length });
  });

  app.post("/api/dispatch/requests", (req: Request, res: Response) => {
    if (!isValidCreateDispatchRequest(req.body)) {
      res.status(400).json({
        error: "Invalid dispatch request payload.",
        expected: createDispatchRequestPayloadShape,
      });
      return;
    }

    const payload = req.body as CreateDispatchRequest;
    const request = dispatchStore.createDispatchRequest(payload);
    const compatibilitySession = sessionStore.createSession({
      source: "api",
      sourceDeviceId: latestCvLiveSummary?.sourceDeviceId,
      location: payload.location,
    });
    const compatibilitySoap = buildSoapReportFromContext(
      payload.questionnaire,
      latestCvLiveSummary ?? undefined,
      payload.location,
    );
    sessionStore.submitQuestionnaire(
      compatibilitySession.id,
      { questionnaire: payload.questionnaire },
      compatibilitySoap,
    );
    sessionStore.recordLiveSummary(
      compatibilitySession.id,
      latestCvLiveSummary ?? {
        updatedAtIso: new Date().toISOString(),
        signal: payload.personDownSignal.frameTimestampMs
          ? {
              handPlacementStatus: "unknown",
              placementConfidence: 0,
              compressionRateBpm: 0,
              compressionRhythmQuality: "unknown",
              visibility: "poor",
              frameTimestampMs: payload.personDownSignal.frameTimestampMs,
              bodyPosture: "unknown",
              postureConfidence: 0,
              eyesClosedConfidence: 0,
            }
          : {
              handPlacementStatus: "unknown",
              placementConfidence: 0,
              compressionRateBpm: 0,
              compressionRhythmQuality: "unknown",
              visibility: "poor",
              frameTimestampMs: Date.now(),
              bodyPosture: "unknown",
              postureConfidence: 0,
              eyesClosedConfidence: 0,
            },
        personDownSignal: payload.personDownSignal,
        victimSnapshot: payload.victimSnapshot,
        summaryText: `Dispatch created from compatibility route (${payload.personDownSignal.status} ${payload.personDownSignal.confidence.toFixed(2)}).`,
        safetyNotice:
          "Compatibility CV summary synthesized for legacy /api/dispatch/requests route.",
        location: payload.location,
        sourceDeviceId: compatibilitySession.sourceDeviceId,
      },
    );
    sessionStore.attachDispatchRequest(compatibilitySession.id, request);
    res.status(201).json({
      request,
      backendEscalation: {
        queued: true,
        channel: "pseudo_hospital_dashboard",
        requestId: request.id,
      },
    });
  });

  app.get("/api/dispatch/requests", (req: Request, res: Response) => {
    const status = req.query.status;
    if (status !== undefined) {
      if (typeof status !== "string" || !dispatchStatuses.includes(status as DispatchRequestStatus)) {
        res.status(400).json({
          error: "Invalid dispatch status filter.",
          expected: dispatchStatuses,
        });
        return;
      }
    }

    const requests = dispatchStore.listDispatchRequests(status as DispatchRequestStatus | undefined);
    res.json({ requests, count: requests.length });
  });

  app.get("/api/dispatch/requests/:requestId", (req: Request, res: Response) => {
    const request = dispatchStore.getDispatchRequest(req.params.requestId);
    if (!request) {
      res.status(404).json({ error: "Dispatch request not found." });
      return;
    }
    res.json({ request });
  });

  app.patch("/api/dispatch/requests/:requestId", (req: Request, res: Response) => {
    if (!isValidUpdateDispatchRequest(req.body)) {
      res.status(400).json({
        error: "Invalid dispatch update payload.",
        expected: updateDispatchRequestPayloadShape,
      });
      return;
    }

    const payload = req.body as UpdateDispatchRequest;
    const updated = dispatchStore.updateDispatchRequest(req.params.requestId, payload);
    if (!updated) {
      res.status(404).json({ error: "Dispatch request not found." });
      return;
    }

    sessionStore.syncDispatchRequest(updated);
    res.json({ request: updated });
  });

  app.get("/api/triage/questions", (_req: Request, res: Response) => {
    res.json({
      questions: [
        { id: "responsive", prompt: "Is the person responsive?" },
        { id: "breathingNormal", prompt: "Is the person breathing normally?" },
        {
          id: "strokeSigns",
          prompt: "Do you observe any FAST signs (face drooping, arm weakness, speech difficulty)?",
        },
        {
          id: "heartRelatedSigns",
          prompt: "Are there signs of a possible heart-related emergency?",
        },
      ],
    });
  });

  app.post("/api/triage/evaluate", (req: Request, res: Response) => {
    if (!isValidAnswers(req.body)) {
      res.status(400).json({
        error: "Invalid triage payload.",
        expected: triagePayloadShape,
      });
      return;
    }

    const payload: TriageEvaluationResponse = {
      result: evaluateTriage(req.body),
      evaluatedAtIso: new Date().toISOString(),
    };

    res.json(payload);
  });

  app.post("/api/xr/triage", async (req: Request, res: Response) => {
    if (!isValidXrTriageHookRequest(req.body)) {
      res.status(400).json({
        error: "Invalid XR triage hook payload.",
        expected: xrTriageHookPayloadShape,
      });
      return;
    }

    const payload = req.body as XrTriageHookRequest;
    const incident = payload.incidentId
      ? incidentStore.updateIncidentAssessment(
          payload.incidentId,
          payload.answers,
          payload.timeline,
        )
      : incidentStore.createIncident({
          answers: payload.answers,
          timeline: payload.timeline,
          source: "xr",
        });

    if (!incident) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }

    let cvAssist = cvAssistByIncident.get(incident.id);
    if (payload.cvSignal) {
      if (!cvEvaluator) {
        res.status(503).json({
          error:
            "CV service is not configured. Set RESCUESIGHT_CV_SERVICE_URL before submitting cvSignal.",
        });
        return;
      }

      try {
        cvAssist = await cvEvaluator({
          signal: payload.cvSignal,
          acknowledgedCheckpoints: payload.acknowledgedCheckpoints ?? [],
          source: payload.deviceContext?.deviceModel ?? "xr",
        });
        cvAssistByIncident.set(incident.id, cvAssist);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown CV service error";
        res.status(502).json({ error: `CV service evaluation failed: ${message}` });
        return;
      }
    }

    const transitionGate = buildTransitionGate(incident.evaluation.result.urgency, cvAssist);
    if (transitionGate.blocked) {
      blockedCheckpointIdsByIncident.set(incident.id, transitionGate.requiredCheckpointIds);
    } else {
      blockedCheckpointIdsByIncident.delete(incident.id);
    }

    const baseOverlaySteps = buildXrOverlaySteps(incident.evaluation.result, incident.timeline);
    const checkpointSteps = cvAssist ? toCheckpointOverlaySteps(cvAssist) : [];
    const overlaySteps = [
      ...checkpointSteps,
      ...baseOverlaySteps.map((step) =>
        transitionGate.blocked && step.priority === "critical"
          ? { ...step, requiresConfirmation: true }
          : step,
      ),
    ];

    const response: XrTriageHookResponse = {
      incidentId: incident.id,
      triage: incident.evaluation,
      overlaySteps,
      cprGuidance: incident.evaluation.result.cprGuidance,
      timeline: incident.timeline,
      cvAssist,
      transitionGate,
      safetyNotice: incident.evaluation.result.safetyNotice,
    };

    res.json(response);
  });

  app.get("/api/xr/incidents/:incidentId/overlay", (req: Request, res: Response) => {
    const incident = incidentStore.getIncident(req.params.incidentId);

    if (!incident) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }

    const base = buildXrIncidentOverlayResponse(incident);
    const cvAssist = cvAssistByIncident.get(incident.id);
    const checkpointSteps = cvAssist ? toCheckpointOverlaySteps(cvAssist) : [];
    const blockedIds = blockedCheckpointIdsByIncident.get(incident.id) ?? [];
    const withGate: XrIncidentOverlayResponse = {
      ...withXrContext(incident.id, base),
      overlaySteps: [
        ...checkpointSteps,
        ...base.overlaySteps.map((step) =>
          blockedIds.length > 0 && step.priority === "critical"
            ? { ...step, requiresConfirmation: true }
            : step,
        ),
      ],
    };
    res.json(withGate);
  });

  app.patch("/api/xr/incidents/:incidentId/actions", (req: Request, res: Response) => {
    if (!isValidXrIncidentActionUpdateRequest(req.body)) {
      res.status(400).json({
        error: "Invalid XR incident action payload.",
        expected: xrIncidentActionUpdatePayloadShape,
      });
      return;
    }

    const payload = req.body as XrIncidentActionUpdateRequest;
    const blockedIds = blockedCheckpointIdsByIncident.get(req.params.incidentId) ?? [];
    if (payload.actionKey === "cprStarted" && payload.completed && blockedIds.length > 0) {
      res.status(409).json({
        error:
          "Critical action is blocked until required confirmation checkpoints are acknowledged.",
        requiredCheckpointIds: blockedIds,
      });
      return;
    }

    const updated = incidentStore.updateIncident(req.params.incidentId, {
      status: "open",
      timeline: {
        aedStatus: payload.aedStatus,
        responderNotes: payload.responderNotes,
        actionsTaken: {
          [payload.actionKey]: payload.completed,
        },
      },
    });

    if (!updated) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }

    const base = buildXrIncidentOverlayResponse(updated);
    const cvAssist = cvAssistByIncident.get(updated.id);
    const checkpointSteps = cvAssist ? toCheckpointOverlaySteps(cvAssist) : [];
    const gatedResponse: XrIncidentOverlayResponse = {
      ...withXrContext(updated.id, base),
      overlaySteps: [...checkpointSteps, ...base.overlaySteps],
    };
    res.json(gatedResponse);
  });

  app.post("/api/incidents", (req: Request, res: Response) => {
    if (!isValidPersistIncidentRequest(req.body)) {
      res.status(400).json({
        error: "Invalid incident payload.",
        expected: persistIncidentPayloadShape,
      });
      return;
    }

    const payload = req.body as PersistIncidentRequest;
    const incident = incidentStore.createIncident(payload);

    res.status(201).json({ incident });
  });

  app.get("/api/incidents", (_req: Request, res: Response) => {
    const incidents = incidentStore.listIncidents();
    res.json({ incidents, count: incidents.length });
  });

  app.get("/api/incidents/:incidentId", (req: Request, res: Response) => {
    const incident = incidentStore.getIncident(req.params.incidentId);

    if (!incident) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }

    res.json({ incident });
  });

  app.patch("/api/incidents/:incidentId", (req: Request, res: Response) => {
    if (!isValidUpdateIncidentRequest(req.body)) {
      res.status(400).json({
        error: "Invalid incident update payload.",
        expected: updateIncidentPayloadShape,
      });
      return;
    }

    const payload = req.body as UpdateIncidentRequest;
    const updated = incidentStore.updateIncident(req.params.incidentId, payload);

    if (!updated) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }

    res.json({ incident: updated });
  });

  app.get("/api/incidents/:incidentId/handoff", (req: Request, res: Response) => {
    const incident = incidentStore.getIncident(req.params.incidentId);

    if (!incident) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }

    res.json({
      incidentId: incident.id,
      updatedAtIso: incident.updatedAtIso,
      status: incident.status,
      handoffSummary: incident.handoffSummary,
      timeline: incident.timeline,
      safetyNotice:
        "Handoff content is bystander-reported context from RescueSight and should not be treated as diagnosis.",
    });
  });

  return { app, incidentStore, sessionStore };
};
