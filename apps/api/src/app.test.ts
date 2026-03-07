import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { Server } from "node:http";
import type { XrCvAssist } from "@rescuesight/shared";
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
    const { app } = buildApp({
      cvEvaluator: async ({ signal, acknowledgedCheckpoints }) => {
        const acknowledgedSet = new Set(acknowledgedCheckpoints);
        const checkpoints: XrCvAssist["checkpoints"] = [];

        checkpoints.push({
          id: "person_down_confirmed",
          prompt: "Confirm possible person-down context.",
          severity: "critical",
          suggestedAction: "Continue guided emergency flow after confirmation.",
          acknowledged: acknowledgedSet.has("person_down_confirmed"),
        });

        if (signal.handPlacementStatus !== "correct" && signal.handPlacementStatus !== "unknown") {
          checkpoints.push({
            id: "hand_adjusted",
            prompt: "Confirm hand position adjustment.",
            severity: "high",
            suggestedAction: "Adjust hand placement and confirm.",
            acknowledged: acknowledgedSet.has("hand_adjusted"),
          });
        }

        if (signal.compressionRhythmQuality !== "good" && signal.compressionRhythmQuality !== "unknown") {
          checkpoints.push({
            id: "compression_adjusted",
            prompt: "Confirm compression pace adjustment.",
            severity: "advisory",
            suggestedAction: "Adjust pace to 100-120 BPM.",
            acknowledged: acknowledgedSet.has("compression_adjusted"),
          });
        }

        const requiresUserConfirmation = checkpoints.some((checkpoint) => !checkpoint.acknowledged);
        return {
          personDownHint: {
            status: "possible",
            confidence: 0.72,
            message: "Possible person-down context detected.",
          },
          handPlacementHint: {
            directive: signal.handPlacementStatus === "too_left" ? "move_right" : "hold_position",
            message: "Adjust hands according to guidance.",
          },
          compressionHint: {
            directive: signal.compressionRhythmQuality === "too_slow" ? "speed_up" : "keep_pace",
            message: "Keep compression cadence near 100-120 BPM.",
          },
          visibilityHint: {
            status: signal.visibility,
            message: "Keep torso and hands in view.",
          },
          checkpoints,
          requiresUserConfirmation,
          safetyNotice: "CV hints are assistive and require user confirmation.",
          frameTimestampMs: signal.frameTimestampMs,
        };
      },
    });
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

  test("live CV signal ingestion and summary retrieval", async () => {
    const noSummaryResponse = await fetch(`${baseUrl}/api/cv/live-summary`);
    assert.equal(noSummaryResponse.status, 404);

    const ingestResponse = await fetch(`${baseUrl}/api/cv/live-signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signal: {
          handPlacementStatus: "correct",
          placementConfidence: 0.89,
          compressionRateBpm: 106,
          compressionRhythmQuality: "good",
          visibility: "full",
          frameTimestampMs: 1731001200,
          bodyPosture: "lying",
          postureConfidence: 0.84,
          eyesClosedConfidence: 0.63,
          torsoInclineDeg: 20.0,
        },
        sourceDeviceId: "cam-quest-01",
        location: {
          label: "Library atrium",
          latitude: 37.8716,
          longitude: -122.2727,
        },
      }),
    });
    assert.equal(ingestResponse.status, 202);
    const ingestBody = (await ingestResponse.json()) as {
      summary: { personDownSignal: { status: string; confidence: number }; summaryText: string };
    };
    assert.ok(ingestBody.summary.personDownSignal.confidence >= 0.6);
    assert.equal(ingestBody.summary.personDownSignal.status, "person_down");
    assert.match(ingestBody.summary.summaryText, /Person-down:/);

    const summaryResponse = await fetch(`${baseUrl}/api/cv/live-summary`);
    assert.equal(summaryResponse.status, 200);
    const summaryBody = (await summaryResponse.json()) as {
      summary: {
        sourceDeviceId: string;
        location?: { label: string };
        signal: { compressionRateBpm: number };
      };
    };
    assert.equal(summaryBody.summary.sourceDeviceId, "cam-quest-01");
    assert.equal(summaryBody.summary.location?.label, "Library atrium");
    assert.equal(summaryBody.summary.signal.compressionRateBpm, 106);
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

  test("person-down intake and dispatch queue lifecycle", async () => {
    const cvEventResponse = await fetch(`${baseUrl}/api/cv/person-down`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signal: {
          status: "person_down",
          confidence: 0.83,
          source: "cv",
          frameTimestampMs: 1731001200,
        },
        location: {
          label: "Student center west entrance",
          latitude: 37.8718,
          longitude: -122.2578,
          indoorDescriptor: "Ground level",
        },
        sourceDeviceId: "quest3-kiosk-01",
      }),
    });
    assert.equal(cvEventResponse.status, 201);
    const cvEventBody = (await cvEventResponse.json()) as {
      event: { id: string; questionnaireRequired: boolean; recommendedPriority: string };
    };
    assert.ok(cvEventBody.event.id);
    assert.equal(cvEventBody.event.questionnaireRequired, true);
    assert.equal(cvEventBody.event.recommendedPriority, "critical");

    const eventListResponse = await fetch(`${baseUrl}/api/cv/person-down-events`);
    assert.equal(eventListResponse.status, 200);
    const eventListBody = (await eventListResponse.json()) as {
      count: number;
      events: Array<{ id: string }>;
    };
    assert.equal(eventListBody.count, 1);
    assert.equal(eventListBody.events[0]?.id, cvEventBody.event.id);

    const createDispatchResponse = await fetch(`${baseUrl}/api/dispatch/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionnaire: {
          responsiveness: "unresponsive",
          breathing: "abnormal_or_absent",
          pulse: "unknown",
          severeBleeding: false,
          majorTrauma: false,
          notes: "Bystander could not detect a reliable pulse.",
        },
        location: {
          label: "Student center west entrance",
          latitude: 37.8718,
          longitude: -122.2578,
        },
        personDownSignal: {
          status: "person_down",
          confidence: 0.83,
          source: "cv",
        },
        emergencyCallRequested: true,
      }),
    });
    assert.equal(createDispatchResponse.status, 201);
    const createdDispatchBody = (await createDispatchResponse.json()) as {
      request: { id: string; status: string; priority: string };
      backendEscalation: { queued: boolean; requestId: string };
    };
    assert.ok(createdDispatchBody.request.id);
    assert.equal(createdDispatchBody.request.status, "pending_review");
    assert.equal(createdDispatchBody.request.priority, "critical");
    assert.equal(createdDispatchBody.backendEscalation.queued, true);
    assert.equal(createdDispatchBody.backendEscalation.requestId, createdDispatchBody.request.id);

    const pendingQueueResponse = await fetch(
      `${baseUrl}/api/dispatch/requests?status=pending_review`,
    );
    assert.equal(pendingQueueResponse.status, 200);
    const pendingQueueBody = (await pendingQueueResponse.json()) as {
      count: number;
      requests: Array<{ id: string; status: string }>;
    };
    assert.equal(pendingQueueBody.count, 1);
    assert.equal(pendingQueueBody.requests[0]?.id, createdDispatchBody.request.id);
    assert.equal(pendingQueueBody.requests[0]?.status, "pending_review");

    const patchDispatchResponse = await fetch(
      `${baseUrl}/api/dispatch/requests/${createdDispatchBody.request.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment: {
            unitId: "EMT-42",
            dispatcher: "jamie",
            etaMinutes: 5,
          },
          dispatchNotes: "EMT-42 dispatched from station C.",
        }),
      },
    );
    assert.equal(patchDispatchResponse.status, 200);
    const patchedDispatchBody = (await patchDispatchResponse.json()) as {
      request: {
        status: string;
        assignment?: { unitId: string; etaMinutes: number };
        dispatchNotes: string;
      };
    };
    assert.equal(patchedDispatchBody.request.status, "dispatched");
    assert.equal(patchedDispatchBody.request.assignment?.unitId, "EMT-42");
    assert.equal(patchedDispatchBody.request.assignment?.etaMinutes, 5);
    assert.equal(patchedDispatchBody.request.dispatchNotes, "EMT-42 dispatched from station C.");

    const getDispatchResponse = await fetch(
      `${baseUrl}/api/dispatch/requests/${createdDispatchBody.request.id}`,
    );
    assert.equal(getDispatchResponse.status, 200);
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

    const actionUpdateResponse = await fetch(
      `${baseUrl}/api/xr/incidents/${createdBody.incidentId}/actions`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionKey: "strokeOnsetRecorded",
          completed: true,
          responderNotes: "Onset time captured from witness.",
        }),
      },
    );
    assert.equal(actionUpdateResponse.status, 200);
    const actionUpdateBody = (await actionUpdateResponse.json()) as {
      timeline: {
        responderNotes: string;
        actionsTaken: { strokeOnsetRecorded: boolean };
      };
      overlaySteps: Array<{ linkedAction?: string; completed?: boolean }>;
    };
    assert.equal(
      actionUpdateBody.timeline.actionsTaken.strokeOnsetRecorded,
      true,
    );
    assert.equal(
      actionUpdateBody.timeline.responderNotes,
      "Onset time captured from witness.",
    );
    assert.ok(
      actionUpdateBody.overlaySteps.some(
        (step) =>
          step.linkedAction === "strokeOnsetRecorded" && step.completed === true,
      ),
    );

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

  test("xr triage enforces checkpoint gate before critical action transitions", async () => {
    const triageResponse = await fetch(`${baseUrl}/api/xr/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: {
          ...baseAnswers,
          responsive: false,
          breathingNormal: false,
        },
        cvSignal: {
          handPlacementStatus: "too_left",
          placementConfidence: 0.88,
          compressionRateBpm: 96,
          compressionRhythmQuality: "too_slow",
          visibility: "full",
          frameTimestampMs: 1731000000,
        },
      }),
    });

    assert.equal(triageResponse.status, 200);
    const triageBody = (await triageResponse.json()) as {
      incidentId: string;
      transitionGate: { blocked: boolean; requiredCheckpointIds: string[] };
      overlaySteps: Array<{ source: string }>;
    };
    assert.equal(triageBody.transitionGate.blocked, true);
    assert.ok(triageBody.transitionGate.requiredCheckpointIds.includes("person_down_confirmed"));
    assert.ok(triageBody.overlaySteps.some((step) => step.source === "checkpoint"));

    const blockedActionResponse = await fetch(
      `${baseUrl}/api/xr/incidents/${triageBody.incidentId}/actions`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionKey: "cprStarted",
          completed: true,
        }),
      },
    );
    assert.equal(blockedActionResponse.status, 409);

    const acknowledgedResponse = await fetch(`${baseUrl}/api/xr/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incidentId: triageBody.incidentId,
        answers: {
          ...baseAnswers,
          responsive: false,
          breathingNormal: false,
        },
        cvSignal: {
          handPlacementStatus: "too_left",
          placementConfidence: 0.88,
          compressionRateBpm: 96,
          compressionRhythmQuality: "too_slow",
          visibility: "full",
          frameTimestampMs: 1731000001,
        },
        acknowledgedCheckpoints: ["person_down_confirmed", "hand_adjusted"],
      }),
    });

    assert.equal(acknowledgedResponse.status, 200);
    const acknowledgedBody = (await acknowledgedResponse.json()) as {
      transitionGate: { blocked: boolean };
    };
    assert.equal(acknowledgedBody.transitionGate.blocked, false);

    const allowedActionResponse = await fetch(
      `${baseUrl}/api/xr/incidents/${triageBody.incidentId}/actions`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionKey: "cprStarted",
          completed: true,
        }),
      },
    );
    assert.equal(allowedActionResponse.status, 200);
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

    const invalidActionUpdateResponse = await fetch(
      `${baseUrl}/api/xr/incidents/missing-incident-id/actions`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionKey: "unsupportedAction",
          completed: true,
        }),
      },
    );
    assert.equal(invalidActionUpdateResponse.status, 400);

    const missingActionUpdateResponse = await fetch(
      `${baseUrl}/api/xr/incidents/missing-incident-id/actions`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionKey: "emsCalled",
          completed: true,
        }),
      },
    );
    assert.equal(missingActionUpdateResponse.status, 404);
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

  test("dispatch endpoints return 400 for invalid payloads and filters", async () => {
    const invalidLiveSignal = await fetch(`${baseUrl}/api/cv/live-signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signal: {
          handPlacementStatus: "shift_left",
          placementConfidence: "high",
        },
      }),
    });
    assert.equal(invalidLiveSignal.status, 400);

    const invalidCvEvent = await fetch(`${baseUrl}/api/cv/person-down`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signal: {
          status: "lying",
          confidence: "high",
          source: "cv",
        },
      }),
    });
    assert.equal(invalidCvEvent.status, 400);

    const invalidDispatchCreate = await fetch(`${baseUrl}/api/dispatch/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionnaire: {
          responsiveness: "awake",
        },
      }),
    });
    assert.equal(invalidDispatchCreate.status, 400);

    const invalidFilter = await fetch(`${baseUrl}/api/dispatch/requests?status=queued`);
    assert.equal(invalidFilter.status, 400);
  });

  test("dispatch endpoints return 404 for unknown request ids", async () => {
    const response = await fetch(`${baseUrl}/api/dispatch/requests/missing-request-id`);
    assert.equal(response.status, 404);

    const patchResponse = await fetch(`${baseUrl}/api/dispatch/requests/missing-request-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    assert.equal(patchResponse.status, 404);
  });
});
