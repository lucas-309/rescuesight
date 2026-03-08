import type { CvLiveSummary } from "@rescuesight/shared";

export const formatCvContextForVoiceAgent = (summary: CvLiveSummary | null): string => {
  if (!summary) {
    return "No live CV stream active yet. Ask the responder to keep camera pointed at the scene while continuing assessment.";
  }

  const { personDownSignal, signal, location, summaryText } = summary;
  const parts: string[] = [];

  parts.push(
    `PERSON-DOWN STATUS: ${personDownSignal.status} (confidence ${(personDownSignal.confidence * 100).toFixed(0)}%).`,
  );
  if (personDownSignal.status === "person_down" && personDownSignal.confidence >= 0.7) {
    parts.push("Possible person-down context detected. Prioritize CPR guidance.");
  }

  parts.push(
    `HAND PLACEMENT: ${signal.handPlacementStatus} (confidence ${(signal.placementConfidence * 100).toFixed(0)}%).`,
  );
  if (signal.handPlacementStatus !== "correct") {
    const hints: Record<string, string> = {
      too_high: "Hands appear too high. Guide to center of chest between the nipples.",
      too_low: "Hands appear too low. Guide up to center of chest.",
      too_left: "Hands appear too far left. Guide to center of chest.",
      too_right: "Hands appear too far right. Guide to center of chest.",
      unknown: "Hand placement unclear. Re-center hands on sternum.",
    };
    parts.push(hints[signal.handPlacementStatus] ?? "Adjust hand placement toward center chest.");
  }

  parts.push(`COMPRESSION RATE: ${signal.compressionRateBpm} BPM. Target is 100-120 BPM.`);
  if (signal.compressionRhythmQuality !== "good") {
    const rhythmHints: Record<string, string> = {
      too_slow: "Compressions too slow. Coach faster toward 100-120 BPM.",
      too_fast: "Compressions too fast. Coach steadier rhythm near 100-120 BPM.",
      inconsistent: "Rhythm inconsistent. Coach steady, even compressions.",
      unknown: "Rhythm unclear. Remind target cadence 100-120 BPM.",
    };
    parts.push(rhythmHints[signal.compressionRhythmQuality] ?? "Adjust compression rhythm.");
  }

  parts.push(`VISIBILITY: ${signal.visibility}.`);
  if (signal.visibility === "partial" || signal.visibility === "poor") {
    parts.push("Camera visibility reduced. Suggest repositioning for clearer scene view.");
  }

  if (location) {
    parts.push(
      `LOCATION: ${location.label} (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}).`,
    );
  }

  parts.push(`SUMMARY: ${summaryText}`);
  return parts.join(" ");
};
