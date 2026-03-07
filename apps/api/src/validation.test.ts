import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidAnswers,
  isValidPersistIncidentRequest,
  isValidUpdateIncidentRequest,
  isValidXrIncidentActionUpdateRequest,
  isValidXrTriageHookRequest,
} from "./validation.js";

const validAnswers = {
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

test("isValidAnswers accepts valid triage payload", () => {
  assert.equal(isValidAnswers(validAnswers), true);
});

test("isValidAnswers rejects invalid triage payload", () => {
  assert.equal(
    isValidAnswers({
      responsive: true,
      breathingNormal: true,
    }),
    false,
  );
});

test("isValidPersistIncidentRequest accepts valid incident payload", () => {
  assert.equal(
    isValidPersistIncidentRequest({
      answers: validAnswers,
      source: "web",
      handoffSummary: "Demo summary",
      timeline: {
        aedStatus: "unknown",
        actionsTaken: {
          emsCalled: true,
        },
      },
    }),
    true,
  );
});

test("isValidPersistIncidentRequest rejects unknown action keys", () => {
  assert.equal(
    isValidPersistIncidentRequest({
      answers: validAnswers,
      timeline: {
        actionsTaken: {
          unknownAction: true,
        },
      },
    }),
    false,
  );
});

test("isValidUpdateIncidentRequest requires at least one known update field", () => {
  assert.equal(isValidUpdateIncidentRequest({}), false);
});

test("isValidUpdateIncidentRequest rejects invalid status value", () => {
  assert.equal(
    isValidUpdateIncidentRequest({
      status: "archived",
    }),
    false,
  );
});

test("isValidXrTriageHookRequest accepts valid quest payload", () => {
  assert.equal(
    isValidXrTriageHookRequest({
      answers: validAnswers,
      incidentId: "incident-123",
      timeline: {
        actionsTaken: {
          emsCalled: true,
        },
      },
      deviceContext: {
        deviceModel: "meta_quest_3",
        interactionMode: "hands",
        appVersion: "0.1.0",
        unityVersion: "6000.3.10f1",
      },
      cvSignal: {
        handPlacementStatus: "too_left",
        placementConfidence: 0.88,
        compressionRateBpm: 96,
        compressionRhythmQuality: "too_slow",
        visibility: "full",
        frameTimestampMs: 1731000000,
      },
      acknowledgedCheckpoints: ["person_down_confirmed"],
    }),
    true,
  );
});

test("isValidXrTriageHookRequest rejects invalid device context values", () => {
  assert.equal(
    isValidXrTriageHookRequest({
      answers: validAnswers,
      deviceContext: {
        deviceModel: "quest-pro",
      },
    }),
    false,
  );
});

test("isValidXrTriageHookRequest rejects invalid cv signal payload", () => {
  assert.equal(
    isValidXrTriageHookRequest({
      answers: validAnswers,
      cvSignal: {
        handPlacementStatus: "shift_left",
        placementConfidence: "high",
        compressionRateBpm: 96,
        compressionRhythmQuality: "too_slow",
        visibility: "full",
        frameTimestampMs: 1731000000,
      },
    }),
    false,
  );
});

test("isValidXrIncidentActionUpdateRequest accepts valid action payload", () => {
  assert.equal(
    isValidXrIncidentActionUpdateRequest({
      actionKey: "emsCalled",
      completed: true,
      aedStatus: "retrieval_in_progress",
      responderNotes: "Caller dialed emergency services.",
    }),
    true,
  );
});

test("isValidXrIncidentActionUpdateRequest rejects unknown action key", () => {
  assert.equal(
    isValidXrIncidentActionUpdateRequest({
      actionKey: "startCompression",
      completed: true,
    }),
    false,
  );
});
