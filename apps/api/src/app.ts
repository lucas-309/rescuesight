import cors from "cors";
import express, { type Request, type Response } from "express";
import type {
  PersistIncidentRequest,
  TriageEvaluationResponse,
  UpdateIncidentRequest,
  XrTriageHookRequest,
  XrTriageHookResponse,
} from "@rescuesight/shared";
import { InMemoryIncidentStore } from "./incidentStore.js";
import {
  isValidAnswers,
  isValidPersistIncidentRequest,
  isValidUpdateIncidentRequest,
  isValidXrTriageHookRequest,
  persistIncidentPayloadShape,
  triagePayloadShape,
  updateIncidentPayloadShape,
  xrTriageHookPayloadShape,
} from "./validation.js";
import { evaluateTriage } from "./triageEngine.js";
import { buildXrIncidentOverlayResponse, buildXrOverlaySteps } from "./xrHooks.js";

interface BuildAppOptions {
  incidentStore?: InMemoryIncidentStore;
}

export const buildApp = (options: BuildAppOptions = {}) => {
  const app = express();
  const incidentStore = options.incidentStore ?? new InMemoryIncidentStore();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "rescuesight-api" });
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

  app.post("/api/xr/triage", (req: Request, res: Response) => {
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

    const response: XrTriageHookResponse = {
      incidentId: incident.id,
      triage: incident.evaluation,
      overlaySteps: buildXrOverlaySteps(incident.evaluation.result, incident.timeline),
      cprGuidance: incident.evaluation.result.cprGuidance,
      timeline: incident.timeline,
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

    res.json(buildXrIncidentOverlayResponse(incident));
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

  return { app, incidentStore };
};
