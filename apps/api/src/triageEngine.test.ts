import assert from "node:assert/strict";
import test from "node:test";
import type { TriageAnswers } from "@rescuesight/shared";
import { evaluateTriage } from "./triageEngine.js";

const baseAnswers = (): TriageAnswers => ({
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
});

test("routes to possible cardiac arrest when unresponsive and not breathing normally", () => {
  const answers = baseAnswers();
  answers.responsive = false;
  answers.breathingNormal = false;

  const result = evaluateTriage(answers);

  assert.equal(result.pathway, "possible_cardiac_arrest");
  assert.equal(result.urgency, "critical");
  assert.ok(result.cprGuidance);
  assert.deepEqual(result.cprGuidance?.targetBpmRange, [100, 120]);
});

test("routes to suspected stroke when FAST sign is present", () => {
  const answers = baseAnswers();
  answers.strokeSigns.faceDrooping = true;

  const result = evaluateTriage(answers);

  assert.equal(result.pathway, "suspected_stroke");
  assert.equal(result.urgency, "high");
});

test("stroke branch has precedence over heart-related branch", () => {
  const answers = baseAnswers();
  answers.strokeSigns.armWeakness = true;
  answers.heartRelatedSigns.chestDiscomfort = true;
  answers.heartRelatedSigns.shortnessOfBreath = true;
  answers.heartRelatedSigns.coldSweat = true;

  const result = evaluateTriage(answers);

  assert.equal(result.pathway, "suspected_stroke");
});

test("routes to possible heart-related emergency for threshold heart signs", () => {
  const answers = baseAnswers();
  answers.heartRelatedSigns.chestDiscomfort = true;
  answers.heartRelatedSigns.shortnessOfBreath = true;

  const result = evaluateTriage(answers);

  assert.equal(result.pathway, "possible_heart_related_emergency");
  assert.equal(result.urgency, "high");
});

test("routes to unclear emergency when signs are inconclusive", () => {
  const answers = baseAnswers();

  const result = evaluateTriage(answers);

  assert.equal(result.pathway, "unclear_emergency");
  assert.equal(result.urgency, "high");
  assert.ok(result.followUpActions.length > 0);
});
