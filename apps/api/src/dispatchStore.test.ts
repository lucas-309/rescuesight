import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryDispatchStore } from "./dispatchStore.js";

test("InMemoryDispatchStore records person-down event and marks questionnaire requirement", () => {
  const store = new InMemoryDispatchStore();
  const event = store.createPersonDownEvent({
    signal: {
      status: "person_down",
      confidence: 0.82,
      source: "cv",
      frameTimestampMs: 1_731_000_000,
    },
    location: {
      label: "Campus quad",
      latitude: 37.8715,
      longitude: -122.273,
    },
  });

  assert.ok(event.id.length > 0);
  assert.equal(event.questionnaireRequired, true);
  assert.equal(event.recommendedPriority, "critical");
});

test("InMemoryDispatchStore creates and dispatches request", () => {
  const store = new InMemoryDispatchStore();
  const request = store.createDispatchRequest({
    location: {
      label: "Library entrance",
      latitude: 40.0,
      longitude: -73.0,
      indoorDescriptor: "North doors",
    },
    personDownSignal: {
      status: "person_down",
      confidence: 0.91,
      source: "cv",
    },
    questionnaire: {
      responsiveness: "unresponsive",
      breathing: "abnormal_or_absent",
      pulse: "absent",
      severeBleeding: false,
      majorTrauma: false,
    },
  });

  assert.equal(request.priority, "critical");
  assert.equal(request.status, "pending_review");

  const updated = store.updateDispatchRequest(request.id, {
    assignment: {
      unitId: "EMT-17",
      dispatcher: "alex",
      etaMinutes: 4,
    },
    dispatchNotes: "Unit notified and en route.",
  });

  assert.ok(updated);
  assert.equal(updated?.status, "dispatched");
  assert.equal(updated?.assignment?.unitId, "EMT-17");
  assert.equal(updated?.dispatchNotes, "Unit notified and en route.");
});
