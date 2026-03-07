import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { Server } from "node:http";
import { buildApp } from "./app.js";

const baseAnswers = {
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
};

describe("RescueSight API routes", () => {
  let server: Server;
  let baseUrl = "";

  beforeEach(() => {
    const { app } = buildApp();
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  test("GET /health returns service health", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as { status: string; service: string };
    assert.equal(body.status, "ok");
    assert.equal(body.service, "rescuesight-api");
  });

  test("POST /api/triage/evaluate returns pathway for valid payload", async () => {
    const response = await fetch(`${baseUrl}/api/triage/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...baseAnswers,
        responsive: false,
        breathingNormal: false,
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      result: { pathway: string };
      evaluatedAtIso: string;
    };

    assert.equal(body.result.pathway, "possible_cardiac_arrest");
    assert.ok(body.evaluatedAtIso.length > 0);
  });

  test("POST /api/triage/evaluate returns 400 for invalid payload", async () => {
    const response = await fetch(`${baseUrl}/api/triage/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responsive: true }),
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /Invalid triage payload/);
  });

  test("incident lifecycle: create, list, get, patch, and handoff", async () => {
    const createResponse = await fetch(`${baseUrl}/api/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: {
          ...baseAnswers,
          strokeSigns: {
            faceDrooping: true,
            armWeakness: false,
            speechDifficulty: false,
          },
        },
        source: "web",
        timeline: {
          firstObservedAtLocal: "2026-03-07T10:33",
          aedStatus: "retrieval_in_progress",
          actionsTaken: {
            emsCalled: true,
          },
        },
        handoffSummary: "Caller reported facial droop.",
      }),
    });

    assert.equal(createResponse.status, 201);
    const createdBody = (await createResponse.json()) as {
      incident: { id: string; evaluation: { result: { pathway: string } } };
    };

    const incidentId = createdBody.incident.id;
    assert.ok(incidentId);
    assert.equal(createdBody.incident.evaluation.result.pathway, "suspected_stroke");

    const listResponse = await fetch(`${baseUrl}/api/incidents`);
    assert.equal(listResponse.status, 200);
    const listBody = (await listResponse.json()) as {
      incidents: Array<{ id: string }>;
      count: number;
    };
    assert.equal(listBody.count, 1);
    assert.equal(listBody.incidents[0]?.id, incidentId);

    const getResponse = await fetch(`${baseUrl}/api/incidents/${incidentId}`);
    assert.equal(getResponse.status, 200);
    const getBody = (await getResponse.json()) as {
      incident: { id: string; timeline: { actionsTaken: { emsCalled: boolean } } };
    };
    assert.equal(getBody.incident.id, incidentId);
    assert.equal(getBody.incident.timeline.actionsTaken.emsCalled, true);

    const patchResponse = await fetch(`${baseUrl}/api/incidents/${incidentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "closed",
        handoffSummary: "Responders received patient timeline.",
        timeline: {
          aedStatus: "on_scene",
          actionsTaken: {
            aedArrived: true,
            cprStarted: true,
          },
        },
      }),
    });

    assert.equal(patchResponse.status, 200);
    const patchedBody = (await patchResponse.json()) as {
      incident: {
        status: string;
        handoffSummary: string;
        timeline: {
          aedStatus: string;
          actionsTaken: { aedArrived: boolean; cprStarted: boolean };
        };
      };
    };

    assert.equal(patchedBody.incident.status, "closed");
    assert.equal(patchedBody.incident.handoffSummary, "Responders received patient timeline.");
    assert.equal(patchedBody.incident.timeline.aedStatus, "on_scene");
    assert.equal(patchedBody.incident.timeline.actionsTaken.aedArrived, true);
    assert.equal(patchedBody.incident.timeline.actionsTaken.cprStarted, true);

    const handoffResponse = await fetch(`${baseUrl}/api/incidents/${incidentId}/handoff`);
    assert.equal(handoffResponse.status, 200);
    const handoffBody = (await handoffResponse.json()) as {
      incidentId: string;
      handoffSummary: string;
      timeline: { aedStatus: string };
    };

    assert.equal(handoffBody.incidentId, incidentId);
    assert.equal(handoffBody.handoffSummary, "Responders received patient timeline.");
    assert.equal(handoffBody.timeline.aedStatus, "on_scene");
  });

  test("xr hooks create/update triage state and expose overlay view", async () => {
    const createResponse = await fetch(`${baseUrl}/api/xr/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: {
          ...baseAnswers,
          responsive: false,
          breathingNormal: false,
        },
        deviceContext: {
          deviceModel: "meta_quest_3",
          interactionMode: "hands",
          appVersion: "0.1.0",
          unityVersion: "6000.3.10f1",
        },
      }),
    });

    assert.equal(createResponse.status, 200);
    const createdBody = (await createResponse.json()) as {
      incidentId: string;
      triage: { result: { pathway: string; cprGuidance?: { targetBpmRange: [number, number] } } };
      overlaySteps: Array<{ id: string; source: string; priority: string }>;
    };

    assert.ok(createdBody.incidentId);
    assert.equal(createdBody.triage.result.pathway, "possible_cardiac_arrest");
    assert.deepEqual(createdBody.triage.result.cprGuidance?.targetBpmRange, [100, 120]);
    assert.ok(createdBody.overlaySteps.some((step) => step.source === "cpr"));
    assert.ok(createdBody.overlaySteps.some((step) => step.priority === "critical"));

    const updateResponse = await fetch(`${baseUrl}/api/xr/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incidentId: createdBody.incidentId,
        answers: {
          ...baseAnswers,
          strokeSigns: {
            faceDrooping: true,
            armWeakness: false,
            speechDifficulty: false,
          },
        },
        timeline: {
          actionsTaken: {
            emsCalled: true,
          },
        },
      }),
    });

    assert.equal(updateResponse.status, 200);
    const updatedBody = (await updateResponse.json()) as {
      incidentId: string;
      triage: { result: { pathway: string } };
      timeline: { actionsTaken: { emsCalled: boolean } };
    };

    assert.equal(updatedBody.incidentId, createdBody.incidentId);
    assert.equal(updatedBody.triage.result.pathway, "suspected_stroke");
    assert.equal(updatedBody.timeline.actionsTaken.emsCalled, true);

    const overlayResponse = await fetch(
      `${baseUrl}/api/xr/incidents/${createdBody.incidentId}/overlay`,
    );
    assert.equal(overlayResponse.status, 200);
    const overlayBody = (await overlayResponse.json()) as {
      incidentId: string;
      overlaySteps: Array<{ linkedAction?: string; completed?: boolean }>;
    };

    assert.equal(overlayBody.incidentId, createdBody.incidentId);
    assert.ok(
      overlayBody.overlaySteps.some(
        (step) => step.linkedAction === "emsCalled" && step.completed === true,
      ),
    );
  });

  test("xr hook endpoint returns 400 for invalid payload and 404 for unknown incident id", async () => {
    const invalidResponse = await fetch(`${baseUrl}/api/xr/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: {
          responsive: true,
        },
      }),
    });
    assert.equal(invalidResponse.status, 400);

    const missingIncidentResponse = await fetch(`${baseUrl}/api/xr/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incidentId: "missing-incident-id",
        answers: baseAnswers,
      }),
    });
    assert.equal(missingIncidentResponse.status, 404);

    const missingOverlayResponse = await fetch(
      `${baseUrl}/api/xr/incidents/missing-incident-id/overlay`,
    );
    assert.equal(missingOverlayResponse.status, 404);
  });

  test("incident endpoints return 400 for invalid payloads", async () => {
    const createResponse = await fetch(`${baseUrl}/api/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: { responsive: true } }),
    });

    assert.equal(createResponse.status, 400);

    const { incident } = (await (
      await fetch(`${baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: baseAnswers }),
      })
    ).json()) as { incident: { id: string } };

    const patchResponse = await fetch(`${baseUrl}/api/incidents/${incident.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid" }),
    });

    assert.equal(patchResponse.status, 400);
  });

  test("incident endpoints return 404 for unknown ids", async () => {
    const missingId = "missing-incident-id";

    const getResponse = await fetch(`${baseUrl}/api/incidents/${missingId}`);
    assert.equal(getResponse.status, 404);

    const patchResponse = await fetch(`${baseUrl}/api/incidents/${missingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    assert.equal(patchResponse.status, 404);

    const handoffResponse = await fetch(`${baseUrl}/api/incidents/${missingId}/handoff`);
    assert.equal(handoffResponse.status, 404);
  });
});
