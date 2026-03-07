import type {
  HeartRelatedSigns,
  StrokeSigns,
  TriageAnswers,
  TriageResult,
} from "@rescuesight/shared";

const SAFETY_NOTICE =
  "RescueSight provides bystander guidance for suspected emergencies. It does not diagnose conditions or replace professional medical care.";

const countTrue = (values: boolean[]): number =>
  values.reduce((count, current) => (current ? count + 1 : count), 0);

const strokeSignCount = (signs: StrokeSigns): number =>
  countTrue([signs.faceDrooping, signs.armWeakness, signs.speechDifficulty]);

const heartSignCount = (signs: HeartRelatedSigns): number =>
  countTrue([
    signs.chestDiscomfort,
    signs.shortnessOfBreath,
    signs.coldSweat,
    signs.nauseaOrUpperBodyDiscomfort,
  ]);

export const evaluateTriage = (answers: TriageAnswers): TriageResult => {
  if (!answers.responsive && !answers.breathingNormal) {
    return {
      pathway: "possible_cardiac_arrest",
      label: "Possible Cardiac Arrest",
      urgency: "critical",
      summary:
        "The person appears unresponsive and not breathing normally. Treat as a possible cardiac arrest and start emergency response actions immediately.",
      immediateActions: [
        "Call emergency services now or direct someone nearby to call.",
        "Start chest compressions immediately and continue without delay.",
        "Send someone to retrieve the nearest AED if available.",
      ],
      followUpActions: [
        "Use the AED as soon as it arrives and follow AED voice prompts.",
        "Continue CPR cycles until trained responders take over.",
      ],
      cprGuidance: {
        targetBpmRange: [100, 120],
        instructions: [
          "Place hands in the center of the chest (lower half of the sternum).",
          "Press hard and fast at 100 to 120 compressions per minute.",
          "Allow full chest recoil between compressions.",
        ],
      },
      safetyNotice: SAFETY_NOTICE,
    };
  }

  if (strokeSignCount(answers.strokeSigns) >= 1) {
    return {
      pathway: "suspected_stroke",
      label: "Suspected Stroke",
      urgency: "high",
      summary:
        "One or more FAST stroke warning signs were reported. Treat as a suspected stroke and escalate immediately.",
      immediateActions: [
        "Call emergency services immediately.",
        "Note the time symptoms were first observed (or last known normal).",
        "Keep the person safe and seated or lying comfortably while waiting for responders.",
      ],
      followUpActions: [
        "Do not provide food, drink, or medication unless instructed by emergency professionals.",
        "Monitor for changes in breathing or responsiveness until help arrives.",
      ],
      safetyNotice: SAFETY_NOTICE,
    };
  }

  const heartSigns = answers.heartRelatedSigns;
  const possibleHeartEmergency =
    heartSignCount(heartSigns) >= 2 ||
    (heartSigns.chestDiscomfort && heartSigns.shortnessOfBreath);

  if (possibleHeartEmergency) {
    return {
      pathway: "possible_heart_related_emergency",
      label: "Possible Heart-Related Emergency",
      urgency: "high",
      summary:
        "Reported symptoms are consistent with a possible heart-related emergency. Escalate promptly and continue monitoring.",
      immediateActions: [
        "Call emergency services now.",
        "Keep the person resting and avoid unnecessary movement.",
        "Prepare to begin CPR if the person becomes unresponsive and not breathing normally.",
      ],
      followUpActions: [
        "Monitor breathing and responsiveness continuously.",
        "Be ready to report symptom timeline and observed signs to responders.",
      ],
      safetyNotice: SAFETY_NOTICE,
    };
  }

  return {
    pathway: "unclear_emergency",
    label: "Unclear Emergency - Escalate",
    urgency: "high",
    summary:
      "The current signs are inconclusive, but a serious emergency cannot be ruled out. Escalate and continue observation.",
    immediateActions: [
      "Call emergency services and describe all observed symptoms.",
      "Stay with the person and continue checking responsiveness and breathing.",
      "Prepare to start CPR if they become unresponsive and stop breathing normally.",
    ],
    followUpActions: [
      "Re-run the checklist if symptoms change.",
      "Record key timeline details for responders.",
    ],
    safetyNotice: SAFETY_NOTICE,
  };
};
