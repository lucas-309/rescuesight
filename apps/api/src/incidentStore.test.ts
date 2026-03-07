import assert from "node:assert/strict";
import test from "node:test";
import type { PersistIncidentRequest } from "@rescuesight/shared";
import { InMemoryIncidentStore } from "./incidentStore.js";

const baseIncidentPayload = (): PersistIncidentRequest => ({
  source: "web",
  answers: {
    responsive: true,
    breathingNormal: true,
    strokeSigns: {
      faceDrooping: false,
      armWeakness: false,
      speechDifficulty: false,
    },
    heartRelatedSigns: {
      chestDiscomfort: false,
      shortnessOfBreath: false,
      coldSweat: false,
      nauseaOrUpperBodyDiscomfort: false,
    },
  },
});

test("createIncident sets defaults and evaluates triage", () => {
  const store = new InMemoryIncidentStore();
  const created = store.createIncident(baseIncidentPayload());

  assert.ok(created.id);
  assert.equal(created.status, "open");
  assert.equal(created.source, "web");
  assert.equal(created.evaluation.result.pathway, "unclear_emergency");
  assert.equal(created.timeline.aedStatus, "unknown");
  assert.equal(created.timeline.actionsTaken.emsCalled, false);
});

test("createIncident merges provided timeline and handoff", () => {
  const store = new InMemoryIncidentStore();
  const created = store.createIncident({
    ...baseIncidentPayload(),
    source: "api",
    handoffSummary: "Initial bystander handoff",
    timeline: {
      firstObservedAtLocal: "2026-03-07T10:02",
      responderNotes: "Found person near station entrance.",
      aedStatus: "retrieval_in_progress",
      actionsTaken: {
        emsCalled: true,
      },
    },
  });

  assert.equal(created.source, "api");
  assert.equal(created.handoffSummary, "Initial bystander handoff");
  assert.equal(created.timeline.firstObservedAtLocal, "2026-03-07T10:02");
  assert.equal(created.timeline.aedStatus, "retrieval_in_progress");
  assert.equal(created.timeline.actionsTaken.emsCalled, true);
  assert.equal(created.timeline.actionsTaken.cprStarted, false);
});

test("updateIncident updates timeline, status, and handoff fields", () => {
  const store = new InMemoryIncidentStore();
  const created = store.createIncident(baseIncidentPayload());

  const updated = store.updateIncident(created.id, {
    status: "closed",
    handoffSummary: "Responders on scene.",
    timeline: {
      aedStatus: "on_scene",
      actionsTaken: {
        aedArrived: true,
        cprStarted: true,
      },
    },
  });

  assert.ok(updated);
  assert.equal(updated?.status, "closed");
  assert.equal(updated?.handoffSummary, "Responders on scene.");
  assert.equal(updated?.timeline.aedStatus, "on_scene");
  assert.equal(updated?.timeline.actionsTaken.aedArrived, true);
  assert.equal(updated?.timeline.actionsTaken.cprStarted, true);
});

test("getIncident returns null for unknown id", () => {
  const store = new InMemoryIncidentStore();
  assert.equal(store.getIncident("missing-id"), null);
});

test("updateIncidentAssessment re-evaluates triage and merges timeline", () => {
  const store = new InMemoryIncidentStore();
  const created = store.createIncident(baseIncidentPayload());

  const updated = store.updateIncidentAssessment(
    created.id,
    {
      responsive: false,
      breathingNormal: false,
      strokeSigns: {
        faceDrooping: false,
        armWeakness: false,
        speechDifficulty: false,
      },
      heartRelatedSigns: {
        chestDiscomfort: false,
        shortnessOfBreath: false,
        coldSweat: false,
        nauseaOrUpperBodyDiscomfort: false,
      },
    },
    {
      actionsTaken: {
        emsCalled: true,
      },
    },
  );

  assert.ok(updated);
  assert.equal(updated?.source, "xr");
  assert.equal(updated?.evaluation.result.pathway, "possible_cardiac_arrest");
  assert.equal(updated?.timeline.actionsTaken.emsCalled, true);
});

test("listIncidents returns all records", () => {
  const store = new InMemoryIncidentStore();
  const first = store.createIncident(baseIncidentPayload());
  const second = store.createIncident(baseIncidentPayload());

  const incidents = store.listIncidents();

  assert.equal(incidents.length, 2);
  const ids = new Set(incidents.map((incident) => incident.id));
  assert.equal(ids.has(first.id), true);
  assert.equal(ids.has(second.id), true);
});
