import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEmergencySession,
  fetchEmergencySession,
  fetchLiveSummary,
  verifyApiAvailability,
} from "../services/cvApi";
import { API_BASE_URL, CV_SOURCE_DEVICE_ID } from "../config/env";
import type { EmergencySessionState } from "../types/session";

const POLL_INTERVAL_MS = 2_500;

const defaultState: EmergencySessionState = {
  phase: "idle",
  statusMessage: "Ready",
  connectedAtIso: null,
  sessionId: null,
  sessionStatus: null,
  summary: null,
  errorMessage: null,
};

const summarizeConnectionError = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return `Connection timed out at ${API_BASE_URL}/health. Verify API host and Wi-Fi routing, then restart Expo with --clear.`;
    }
    return `Connection error via ${API_BASE_URL}: ${error.message}`;
  }
  return `Unable to connect to CV backend at ${API_BASE_URL}.`;
};

export const useEmergencySession = () => {
  const [state, setState] = useState<EmergencySessionState>(defaultState);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (!pollingRef.current) {
      return;
    }
    clearInterval(pollingRef.current);
    pollingRef.current = null;
  }, []);

  const refreshSummary = useCallback(async () => {
    try {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        const summary = await fetchLiveSummary();
        setState((current) => ({ ...current, summary }));
        return;
      }

      const session = await fetchEmergencySession(sessionId);
      const summary = session.liveSummary ?? null;
      setState((current) => ({
        ...current,
        summary,
        sessionStatus: session.status,
        statusMessage: summary
          ? `Session active (${session.status})`
          : `Session active (${session.status}). Waiting for first scene frame...`,
      }));
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
      await verifyApiAvailability();
      const session = await createEmergencySession({
        source: "mobile",
        sourceDeviceId: CV_SOURCE_DEVICE_ID,
      });
      sessionIdRef.current = session.id;
      const connectedAtIso = new Date().toISOString();
      const initialSummary = session.liveSummary ?? null;

      setState({
        phase: "connected",
        statusMessage: initialSummary ? "CV model connected and analysis active" : "Session created. Waiting for first scene frame...",
        connectedAtIso,
        sessionId: session.id,
        sessionStatus: session.status,
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
      sessionIdRef.current = null;
    },
    [stopPolling],
  );

  return {
    state,
    startEmergencySession,
  };
};
