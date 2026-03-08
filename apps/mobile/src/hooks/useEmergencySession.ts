import { useCallback, useEffect, useRef, useState } from "react";
import { connectToCvModel, fetchLiveSummary } from "../services/cvApi";
import type { EmergencySessionState } from "../types/session";

const POLL_INTERVAL_MS = 2_500;

const defaultState: EmergencySessionState = {
  phase: "idle",
  statusMessage: "Ready",
  connectedAtIso: null,
  summary: null,
  errorMessage: null,
};

const summarizeConnectionError = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "Connection timed out. Verify API host and try again.";
    }
    return error.message;
  }
  return "Unable to connect to CV backend.";
};

export const useEmergencySession = () => {
  const [state, setState] = useState<EmergencySessionState>(defaultState);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (!pollingRef.current) {
      return;
    }
    clearInterval(pollingRef.current);
    pollingRef.current = null;
  }, []);

  const refreshSummary = useCallback(async () => {
    try {
      const summary = await fetchLiveSummary();
      setState((current) => ({ ...current, summary }));
    } catch (error) {
      setState((current) => ({
        ...current,
        phase: "error",
        statusMessage: "Connection interrupted",
        errorMessage: summarizeConnectionError(error),
      }));
      stopPolling();
    }
  }, [stopPolling]);

  const startEmergencySession = useCallback(async () => {
    stopPolling();
    setState((current) => ({
      ...current,
      phase: "connecting",
      statusMessage: "Starting emergency assistance...",
      errorMessage: null,
    }));

    try {
      const initialSummary = await connectToCvModel();
      const connectedAtIso = new Date().toISOString();

      setState({
        phase: "connected",
        statusMessage: initialSummary
          ? "CV model connected and analysis active"
          : "CV model connected. Waiting for first scene frame...",
        connectedAtIso,
        summary: initialSummary,
        errorMessage: null,
      });

      pollingRef.current = setInterval(() => {
        void refreshSummary();
      }, POLL_INTERVAL_MS);
    } catch (error) {
      setState((current) => ({
        ...current,
        phase: "error",
        statusMessage: "Unable to start emergency assistance",
        errorMessage: summarizeConnectionError(error),
      }));
    }
  }, [refreshSummary, stopPolling]);

  useEffect(
    () => () => {
      stopPolling();
    },
    [stopPolling],
  );

  return {
    state,
    startEmergencySession,
  };
};
