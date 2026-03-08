import assert from "node:assert/strict";
import test from "node:test";
import type { CvLiveSummary, DispatchRequest, EmergencySoapReport } from "@rescuesight/shared";
import { InMemorySessionStore } from "./sessionStore.js";

const buildLiveSummary = (): CvLiveSummary => ({
  updatedAtIso: "2026-03-08T10:00:00.000Z",
  signal: {
    handPlacementStatus: "correct",
    placementConfidence: 0.92,
    compressionRateBpm: 108,
    compressionRhythmQuality: "good",
    visibility: "full",
    frameTimestampMs: 1_731_000_100,
    bodyPosture: "lying",
    postureConfidence: 0.88,
    eyesClosedConfidence: 0.86,
  },
  personDownSignal: {
    status: "person_down",
    confidence: 0.81,
    source: "cv",
    frameTimestampMs: 1_731_000_100,
    observedAtIso: "2026-03-08T10:00:00.000Z",
  },
  victimSnapshot: {
    imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==",
    capturedAtIso: "2026-03-08T10:00:00.000Z",
    frameTimestampMs: 1_731_000_100,
    triggerReason: "lying>0.60 && eyesClosed>0.80",
  },
  summaryText: "Person-down: likely (0.81)",
  safetyNotice: "Assistive only.",
  sourceDeviceId: "cam-01",
  location: {
    label: "Main lobby",
    latitude: 37.8715,
    longitude: -122.273,
  },
});

const buildDispatchRequest = (): DispatchRequest => ({
  id: "dispatch-123",
  createdAtIso: "2026-03-08T10:01:00.000Z",
  updatedAtIso: "2026-03-08T10:01:00.000Z",
  status: "pending_review",
  priority: "critical",
  location: {
    label: "Main lobby",
    latitude: 37.8715,
    longitude: -122.273,
  },
  questionnaire: {
    responsiveness: "unresponsive",
    breathing: "abnormal_or_absent",
    pulse: "unknown",
    severeBleeding: false,
    majorTrauma: false,
  },
  personDownSignal: {
    status: "person_down",
    confidence: 0.81,
    source: "cv",
  },
  victimSnapshot: {
    imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==",
  },
  emergencyCallRequested: true,
  dispatchNotes: "",
  safetyNotice: "Assistive only.",
});

const buildSoap = (): EmergencySoapReport => ({
  generatedAtIso: "2026-03-08T10:00:30.000Z",
  acuity: "critical",
  subjective: "Bystander reports unresponsive victim.",
  objective: "CV indicates likely person-down and eyes closed.",
  assessment: "Possible out-of-hospital cardiac arrest.",
  plan: "Dispatch EMT and continue CPR guidance.",
  combinedText: "SOAP REPORT",
  safetyNotice: "Assistive only.",
});

test("InMemorySessionStore creates session and records lifecycle events", () => {
  const store = new InMemorySessionStore();
  const created = store.createSession({ source: "mobile", sourceDeviceId: "iphone-01" });

  assert.equal(created.status, "open");
  assert.equal(created.events.length, 1);
  assert.equal(created.events[0]?.type, "session_created");

  const withCv = store.recordLiveSummary(created.id, buildLiveSummary());
  assert.ok(withCv);
  assert.equal(withCv?.status, "monitoring");
  assert.equal(withCv?.events[withCv.events.length - 1]?.type, "cv_signal");

  const withQuestionnaire = store.submitQuestionnaire(
    created.id,
    {
      questionnaire: {
        responsiveness: "unresponsive",
        breathing: "abnormal_or_absent",
        pulse: "unknown",
        severeBleeding: false,
        majorTrauma: false,
      },
    },
    buildSoap(),
  );
  assert.ok(withQuestionnaire);
  assert.equal(withQuestionnaire?.status, "questionnaire_completed");
  assert.equal(withQuestionnaire?.events.some((event) => event.type === "questionnaire_started"), true);
  assert.equal(withQuestionnaire?.events.some((event) => event.type === "questionnaire_submitted"), true);
  assert.equal(withQuestionnaire?.events.some((event) => event.type === "soap_generated"), true);

  const withDispatch = store.attachDispatchRequest(created.id, buildDispatchRequest());
  assert.ok(withDispatch);
  assert.equal(withDispatch?.status, "dispatch_requested");
  assert.equal(
    withDispatch?.events[withDispatch.events.length - 1]?.type,
    "dispatch_requested",
  );
});

test("InMemorySessionStore syncs dispatch status to dispatched and resolved", () => {
  const store = new InMemorySessionStore();
  const created = store.createSession({ source: "web" });

  const pending = store.attachDispatchRequest(created.id, buildDispatchRequest());
  assert.equal(pending?.status, "dispatch_requested");

  const dispatched: DispatchRequest = {
    ...buildDispatchRequest(),
    status: "dispatched",
    assignment: {
      unitId: "EMT-42",
      dispatcher: "jamie",
      etaMinutes: 5,
      assignedAtIso: "2026-03-08T10:05:00.000Z",
    },
  };
  const syncedDispatched = store.syncDispatchRequest(dispatched);
  assert.equal(syncedDispatched?.status, "dispatched");

  const resolved: DispatchRequest = {
    ...dispatched,
    status: "resolved",
    updatedAtIso: "2026-03-08T10:12:00.000Z",
  };
  const syncedResolved = store.syncDispatchRequest(resolved);
  assert.equal(syncedResolved?.status, "resolved");
});
