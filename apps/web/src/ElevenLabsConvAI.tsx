import type { CvLiveSummary } from "@rescuesight/shared";
import { useEffect, useMemo, useRef, useState } from "react";

const WIDGET_SCRIPT_URL = "https://unpkg.com/@elevenlabs/convai-widget-embed@0.10.2";

let widgetScriptPromise: Promise<void> | null = null;

const ensureWidgetScript = async (): Promise<void> => {
  if (typeof document === "undefined") {
    return;
  }

  if (customElements.get("elevenlabs-convai")) {
    return;
  }

  if (!widgetScriptPromise) {
    widgetScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SCRIPT_URL}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load ElevenLabs ConvAI widget script.")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = WIDGET_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load ElevenLabs ConvAI widget script."));
      document.head.appendChild(script);
    });
  }

  await widgetScriptPromise;
};

const buildCvContext = (summary: CvLiveSummary | null): string => {
  if (!summary) {
    return "No live CV stream active yet. Ask the bystander to start the webcam stream.";
  }

  const parts: string[] = [];
  parts.push(
    `PERSON-DOWN STATUS: ${summary.personDownSignal.status} (${(summary.personDownSignal.confidence * 100).toFixed(0)}%).`,
  );
  parts.push(
    `HAND PLACEMENT: ${summary.signal.handPlacementStatus} (${summary.signal.placementConfidence.toFixed(2)}).`,
  );
  parts.push(
    `COMPRESSIONS: ${summary.signal.compressionRateBpm} BPM, RHYTHM ${summary.signal.compressionRhythmQuality}.`,
  );
  parts.push(`VISIBILITY: ${summary.signal.visibility}.`);
  if (summary.location) {
    parts.push(
      `LOCATION: ${summary.location.label} (${summary.location.latitude.toFixed(5)}, ${summary.location.longitude.toFixed(5)}).`,
    );
  } else {
    parts.push("LOCATION: not attached.");
  }
  return parts.join(" ");
};

interface ElevenLabsConvAIProps {
  agentId: string;
  summary: CvLiveSummary | null;
}

export const ElevenLabsConvAI = ({ agentId, summary }: ElevenLabsConvAIProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const cvContext = useMemo(() => buildCvContext(summary), [summary]);

  useEffect(() => {
    let cancelled = false;
    void ensureWidgetScript().catch((error: unknown) => {
      if (!cancelled) {
        setScriptError(error instanceof Error ? error.message : "Unable to load ElevenLabs widget script.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !agentId) {
      return;
    }

    let widget = mount.querySelector("elevenlabs-convai") as HTMLElement | null;
    if (!widget) {
      mount.innerHTML =
        "<elevenlabs-convai variant=\"full\" action-text=\"Voice CPR guide\" start-call-text=\"Start\"></elevenlabs-convai>";
      widget = mount.querySelector("elevenlabs-convai") as HTMLElement | null;
    }
    if (!widget) {
      return;
    }

    widget.setAttribute("agent-id", agentId);
    widget.setAttribute("variant", "full");
    widget.setAttribute("action-text", "Voice CPR guide");
    widget.setAttribute("start-call-text", "Start");
    widget.setAttribute("cv-context", cvContext);
  }, [agentId, cvContext]);

  if (!agentId) {
    return (
      <div className="voice-widget-card">
        <p className="helper-text">
          ElevenLabs widget is disabled. Set <code>VITE_ELEVENLABS_AGENT_ID</code> and reload the web app.
        </p>
      </div>
    );
  }

  return (
    <div className="voice-widget-card">
      <p className="voice-widget-meta">
        Agent ID: <strong>{agentId}</strong>
      </p>
      <p className="helper-text">
        Tap Start in the widget to launch browser voice coaching with live CV context from the dashboard.
      </p>
      {scriptError ? <p className="status-message">{scriptError}</p> : null}
      <div ref={mountRef} className="voice-widget-frame" />
    </div>
  );
};
