import { useEffect } from "react";
import type { CvLiveSummary } from "@rescuesight/shared";

/**
 * Formats CV live summary into a concise context string for the voice agent.
 * The agent uses this to give CPR/emergency guidance based on real-time signals.
 */
function formatCvContextForAgent(summary: CvLiveSummary | null): string {
  if (!summary) {
    return "No live CV stream active. Camera feed not connected. Ask the user to start the webcam stream.";
  }

  const { personDownSignal, signal, location, summaryText } = summary;
  const parts: string[] = [];

  parts.push(`PERSON-DOWN STATUS: ${personDownSignal.status} (confidence ${(personDownSignal.confidence * 100).toFixed(0)}%).`);
  if (personDownSignal.status === "person_down" && personDownSignal.confidence >= 0.7) {
    parts.push("Possible person down detected. Provide CPR guidance.");
  }

  parts.push(`HAND PLACEMENT: ${signal.handPlacementStatus} (confidence ${(signal.placementConfidence * 100).toFixed(0)}%).`);
  if (signal.handPlacementStatus !== "correct") {
    const hints: Record<string, string> = {
      too_high: "Hands are too high on the chest. Guide them to the center of the chest, between the nipples.",
      too_low: "Hands are too low. Guide them up to the center of the chest.",
      too_left: "Hands are too far left. Guide them to the center of the chest.",
      too_right: "Hands are too far right. Guide them to the center of the chest.",
      unknown: "Hand placement unclear. Remind them to place hands in the center of the chest.",
    };
    parts.push(hints[signal.handPlacementStatus] ?? "Adjust hand placement.");
  }

  parts.push(`COMPRESSION RATE: ${signal.compressionRateBpm} BPM. Target is 100-120 BPM.`);
  if (signal.compressionRhythmQuality !== "good") {
    const rhythmHints: Record<string, string> = {
      too_slow: "Compressions are too slow. Encourage faster compressions, aim for 100-120 per minute.",
      too_fast: "Compressions are too fast. Encourage a steady 100-120 BPM.",
      inconsistent: "Rhythm is inconsistent. Encourage steady, even compressions.",
      unknown: "Rhythm quality unclear. Remind them to aim for 100-120 steady compressions per minute.",
    };
    parts.push(rhythmHints[signal.compressionRhythmQuality] ?? "Adjust compression rate.");
  }

  parts.push(`VISIBILITY: ${signal.visibility}.`);
  if (signal.visibility === "partial" || signal.visibility === "poor") {
    parts.push("Camera view is obstructed. Suggest repositioning for better visibility.");
  }

  if (location) {
    parts.push(`LOCATION: ${location.label} (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}).`);
  }

  parts.push(`SUMMARY: ${summaryText}`);

  return parts.join(" ");
}

interface ElevenLabsConvAIProps {
  liveSummary: CvLiveSummary | null;
}

/**
 * ElevenLabs ConvAI voice assistant widget, wired to live CV signals.
 * The widget element lives in index.html; this component only updates its cv-context.
 */
export function ElevenLabsConvAI({ liveSummary }: ElevenLabsConvAIProps) {
  const cvContext = formatCvContextForAgent(liveSummary);

  useEffect(() => {
    const el = document.querySelector("elevenlabs-convai");
    if (el) {
      el.setAttribute("cv-context", cvContext);
    }
  }, [cvContext]);

  return null;
}
