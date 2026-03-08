import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidCreateEmergencySessionRequest,
  isValidCreateSessionDispatchRequest,
  isValidCvLiveSignalIngestRequest,
  isValidCreateDispatchRequest,
  isValidCreatePersonDownEventRequest,
  isValidAnswers,
  isValidPersistIncidentRequest,
  isValidSessionCvSignalRequest,
  isValidSubmitSessionQuestionnaireRequest,
  isValidUpdateSessionSoapReportRequest,
  isValidUpdateDispatchRequest,
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
        bodyPosture: "lying",
        postureConfidence: 0.81,
        eyesClosedConfidence: 0.62,
        torsoInclineDeg: 22,
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

test("isValidXrTriageHookRequest rejects invalid cv posture metadata", () => {
  assert.equal(
    isValidXrTriageHookRequest({
      answers: validAnswers,
      cvSignal: {
        handPlacementStatus: "correct",
        placementConfidence: 0.9,
        compressionRateBpm: 100,
        compressionRhythmQuality: "good",
        visibility: "full",
        frameTimestampMs: 1731000100,
        bodyPosture: "kneeling",
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

test("isValidCreatePersonDownEventRequest accepts valid CV event payload", () => {
  assert.equal(
    isValidCreatePersonDownEventRequest({
      signal: {
        status: "person_down",
        confidence: 0.8,
        source: "cv",
        frameTimestampMs: 1731000000,
      },
      location: {
        label: "North lot",
        latitude: 37.42,
        longitude: -122.08,
      },
      sourceDeviceId: "cam-01",
    }),
    true,
  );
});

test("isValidCreateDispatchRequest accepts valid questionnaire + location payload", () => {
  assert.equal(
    isValidCreateDispatchRequest({
      questionnaire: {
        responsiveness: "unresponsive",
        breathing: "abnormal_or_absent",
        pulse: "unknown",
        severeBleeding: false,
        majorTrauma: false,
      },
      location: {
        label: "Main lobby",
        latitude: 40.758,
        longitude: -73.9855,
        indoorDescriptor: "Ground floor",
      },
      personDownSignal: {
        status: "person_down",
        confidence: 0.74,
        source: "cv",
      },
      victimSnapshot: {
        imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==",
        capturedAtIso: "2026-03-07T00:00:00Z",
        frameTimestampMs: 1731001010,
      },
      emergencyCallRequested: true,
    }),
    true,
  );
});

test("isValidCreateDispatchRequest rejects invalid victim snapshot data URL", () => {
  assert.equal(
    isValidCreateDispatchRequest({
      questionnaire: {
        responsiveness: "unresponsive",
        breathing: "abnormal_or_absent",
        pulse: "unknown",
        severeBleeding: false,
        majorTrauma: false,
      },
      location: {
        label: "Main lobby",
        latitude: 40.758,
        longitude: -73.9855,
      },
      personDownSignal: {
        status: "person_down",
        confidence: 0.74,
        source: "cv",
      },
      victimSnapshot: {
        imageDataUrl: "http://example.com/not-allowed.jpg",
      },
    }),
    false,
  );
});

test("isValidCvLiveSignalIngestRequest accepts valid live signal payload", () => {
  assert.equal(
    isValidCvLiveSignalIngestRequest({
      signal: {
        handPlacementStatus: "correct",
        placementConfidence: 0.92,
        compressionRateBpm: 108,
        compressionRhythmQuality: "good",
        visibility: "full",
        frameTimestampMs: 1731009999,
      },
      victimSnapshot: {
        imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==",
        capturedAtIso: "2026-03-07T00:00:00Z",
        frameTimestampMs: 1731009999,
        triggerReason: "live_cv_person_down",
      },
      sourceDeviceId: "cam-01",
      location: {
        label: "Main quad",
        latitude: 37.8715,
        longitude: -122.273,
      },
    }),
    true,
  );
});

test("isValidCvLiveSignalIngestRequest rejects invalid victim snapshot", () => {
  assert.equal(
    isValidCvLiveSignalIngestRequest({
      signal: {
        handPlacementStatus: "correct",
        placementConfidence: 0.92,
        compressionRateBpm: 108,
        compressionRhythmQuality: "good",
        visibility: "full",
        frameTimestampMs: 1731009999,
      },
      victimSnapshot: {
        imageDataUrl: "https://example.com/image.jpg",
      },
      sourceDeviceId: "cam-01",
    }),
    false,
  );
});

test("isValidUpdateDispatchRequest rejects unknown status", () => {
  assert.equal(
    isValidUpdateDispatchRequest({
      status: "queued",
    }),
    false,
  );
});

test("isValidCreateEmergencySessionRequest accepts optional session bootstrap fields", () => {
  assert.equal(
    isValidCreateEmergencySessionRequest({
      source: "mobile",
      sourceDeviceId: "iphone-01",
      location: {
        label: "Main lobby",
        latitude: 37.8715,
        longitude: -122.273,
      },
    }),
    true,
  );
});

test("isValidCreateEmergencySessionRequest rejects unknown source values", () => {
  assert.equal(
    isValidCreateEmergencySessionRequest({
      source: "desktop",
    }),
    false,
  );
});

test("isValidSessionCvSignalRequest reuses CV live-signal validator", () => {
  assert.equal(
    isValidSessionCvSignalRequest({
      signal: {
        handPlacementStatus: "correct",
        placementConfidence: 0.9,
        compressionRateBpm: 104,
        compressionRhythmQuality: "good",
        visibility: "full",
        frameTimestampMs: 1731009999,
        bodyPosture: "lying",
        postureConfidence: 0.8,
        eyesClosedConfidence: 0.85,
      },
      sourceDeviceId: "cam-02",
    }),
    true,
  );
});

test("isValidSubmitSessionQuestionnaireRequest requires questionnaire answers", () => {
  assert.equal(
    isValidSubmitSessionQuestionnaireRequest({
      questionnaire: {
        responsiveness: "unresponsive",
        breathing: "abnormal_or_absent",
        pulse: "unknown",
        severeBleeding: false,
        majorTrauma: false,
      },
      startedAtIso: "2026-03-08T10:00:00Z",
      submittedAtIso: "2026-03-08T10:00:10Z",
    }),
    true,
  );
  assert.equal(
    isValidSubmitSessionQuestionnaireRequest({
      startedAtIso: "2026-03-08T10:00:00Z",
    }),
    false,
  );
});

test("isValidUpdateSessionSoapReportRequest validates editable SOAP payload", () => {
  assert.equal(
    isValidUpdateSessionSoapReportRequest({
      combinedText: "SOAP REPORT\nS: Updated by responder.",
      editor: "dispatcher_jamie",
    }),
    true,
  );
  assert.equal(
    isValidUpdateSessionSoapReportRequest({
      combinedText: "   ",
    }),
    false,
  );
});

test("isValidCreateSessionDispatchRequest accepts partial overrides and rejects bad values", () => {
  assert.equal(
    isValidCreateSessionDispatchRequest({
      emergencyCallRequested: true,
      personDownSignal: {
        status: "person_down",
        confidence: 0.84,
        source: "cv",
      },
      victimSnapshot: {
        imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==",
      },
    }),
    true,
  );

  assert.equal(
    isValidCreateSessionDispatchRequest({
      emergencyCallRequested: "yes",
    }),
    false,
  );
});
