import { useEffect, useMemo, useState } from "react";
import type {
  CvLiveSummary,
  DispatchRequest,
  DispatchRequestStatus,
  EmergencySession,
  EmergencySessionStatus,
} from "@rescuesight/shared";
import { ElevenLabsConvAI } from "./ElevenLabsConvAI";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const toApiUrl = (path: string): string => {
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return `${base}${path}`;
};

const dispatchStatusLabelMap: Record<DispatchRequestStatus, string> = {
  pending_review: "Pending Review",
  dispatched: "Dispatched",
  rejected: "Rejected",
  resolved: "Resolved",
};

const sessionStatusOrder: EmergencySessionStatus[] = [
  "open",
  "monitoring",
  "questionnaire_in_progress",
  "questionnaire_completed",
  "dispatch_requested",
  "dispatched",
  "rejected",
  "resolved",
];

const sessionStatusLabelMap: Record<EmergencySessionStatus, string> = {
  open: "Open",
  monitoring: "Monitoring",
  questionnaire_in_progress: "Questionnaire In Progress",
  questionnaire_completed: "Questionnaire Completed",
  dispatch_requested: "Dispatch Requested",
  dispatched: "Dispatched",
  rejected: "Rejected",
  resolved: "Resolved",
};

const priorityLabelMap: Record<DispatchRequest["priority"], string> = {
  critical: "Critical",
  high: "High",
};

const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

const formatAgo = (value: string): string => {
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "just now";
  }
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

export const App = () => {
  type QueueFilter = EmergencySessionStatus | "all";

  const [liveSummary, setLiveSummary] = useState<CvLiveSummary | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  const [queue, setQueue] = useState<EmergencySession[]>([]);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);

  const [soapEditorBySession, setSoapEditorBySession] = useState<Record<string, string>>({});
  const [soapSaveLoadingBySession, setSoapSaveLoadingBySession] = useState<Record<string, boolean>>({});
  const [actionLoadingBySession, setActionLoadingBySession] = useState<Record<string, boolean>>({});

  const liveSummaryEndpoint = useMemo(() => toApiUrl("/api/cv/live-summary"), []);
  const sessionsEndpoint = useMemo(() => toApiUrl("/api/sessions"), []);
  const dispatchRequestsEndpoint = useMemo(() => toApiUrl("/api/dispatch/requests"), []);
  const elevenLabsAgentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID ?? "";

  const refreshLiveSummary = async () => {
    try {
      const response = await fetch(liveSummaryEndpoint);
      if (response.status === 404) {
        setLiveSummary(null);
        setLiveStatus(
          "No CV snapshot uploaded yet. Start run_webcam.py, complete checklist, and use P for manual snapshot capture if needed.",
        );
        return;
      }
      if (!response.ok) {
        throw new Error(`Live summary API returned ${response.status}`);
      }

      const payload = (await response.json()) as { summary: CvLiveSummary };
      setLiveSummary(payload.summary);
      setLiveStatus(`Latest CV summary from ${payload.summary.sourceDeviceId ?? "unknown device"}.`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setLiveSummary(null);
      setLiveStatus(`Unable to load live CV summary: ${message}`);
    }
  };

  const refreshQueue = async (filter: QueueFilter = queueFilter) => {
    setQueueLoading(true);
    setQueueStatus(null);

    try {
      const query = filter === "all" ? "" : `?status=${filter}`;
      const response = await fetch(`${sessionsEndpoint}${query}`);
      if (!response.ok) {
        throw new Error(`Queue API returned ${response.status}`);
      }

      const payload = (await response.json()) as {
        sessions: EmergencySession[];
        count: number;
      };
      setQueue(payload.sessions);
      setQueueStatus(`Loaded ${payload.count} session${payload.count === 1 ? "" : "s"}.`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setQueueStatus(`Unable to load session queue: ${message}`);
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    void refreshQueue("all");
    void refreshLiveSummary();

    const liveIntervalId = window.setInterval(() => {
      void refreshLiveSummary();
    }, 1500);

    return () => {
      window.clearInterval(liveIntervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshQueue(queueFilter);
    const queueIntervalId = window.setInterval(() => {
      void refreshQueue(queueFilter);
    }, 2000);

    return () => {
      window.clearInterval(queueIntervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueFilter]);

  const setActionLoading = (sessionId: string, loading: boolean) => {
    setActionLoadingBySession((current) => ({
      ...current,
      [sessionId]: loading,
    }));
  };

  const saveSessionSoapReport = async (sessionId: string, combinedText: string) => {
    const nextText = combinedText.trim();
    if (!nextText) {
      setQueueStatus("SOAP report cannot be empty.");
      return;
    }

    setSoapSaveLoadingBySession((current) => ({ ...current, [sessionId]: true }));
    setQueueStatus(null);
    try {
      const response = await fetch(`${sessionsEndpoint}/${sessionId}/soap-report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          combinedText: nextText.slice(0, 12_000),
          editor: "dashboard_professional",
        }),
      });
      if (!response.ok) {
        throw new Error(`Session API returned ${response.status} on SOAP save`);
      }

      setQueueStatus(`SOAP report updated for session ${sessionId}.`);
      await refreshQueue(queueFilter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setQueueStatus(`Unable to save SOAP report: ${message}`);
    } finally {
      setSoapSaveLoadingBySession((current) => ({ ...current, [sessionId]: false }));
    }
  };

  const generateSessionSoapReport = async (session: EmergencySession) => {
    setActionLoading(session.id, true);
    setQueueStatus(null);
    try {
      const response = await fetch(`${sessionsEndpoint}/${session.id}/soap-report/generate`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Session API returned ${response.status} on SOAP generation`);
      }

      setSoapEditorBySession((current) => {
        if (!(session.id in current)) {
          return current;
        }
        const { [session.id]: _removed, ...rest } = current;
        return rest;
      });
      setQueueStatus(`SOAP report generated for session ${session.id}.`);
      await refreshQueue(queueFilter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setQueueStatus(`Unable to generate SOAP report: ${message}`);
    } finally {
      setActionLoading(session.id, false);
    }
  };

  const sendToHospitalDispatch = async (session: EmergencySession) => {
    const request = session.dispatchRequest;
    if (!request) {
      setQueueStatus(`No dispatch request attached to session ${session.id}.`);
      return;
    }
    if (!session.soapReport?.combinedText) {
      setQueueStatus("Generate SOAP report before sending to hospital dispatch.");
      return;
    }

    setActionLoading(session.id, true);
    setQueueStatus(null);
    try {
      const response = await fetch(`${dispatchRequestsEndpoint}/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "dispatched",
          assignment: {
            unitId: "EMT-AUTO",
            dispatcher: "dashboard_operator",
            etaMinutes: 8,
          },
          dispatchNotes: "Dispatcher approved request and forwarded SOAP handoff to hospital dispatch.",
        }),
      });
      if (!response.ok) {
        throw new Error(`Dispatch API returned ${response.status} on send`);
      }

      setQueueStatus(`Request ${request.id} sent to hospital dispatch.`);
      await refreshQueue(queueFilter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setQueueStatus(`Unable to send request to hospital dispatch: ${message}`);
    } finally {
      setActionLoading(session.id, false);
    }
  };

  const rejectDispatchRequest = async (session: EmergencySession) => {
    const request = session.dispatchRequest;
    if (!request) {
      setQueueStatus(`No dispatch request attached to session ${session.id}.`);
      return;
    }

    setActionLoading(session.id, true);
    setQueueStatus(null);
    try {
      const response = await fetch(`${dispatchRequestsEndpoint}/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          dispatchNotes: "Dispatcher rejected request after dashboard review.",
        }),
      });
      if (!response.ok) {
        throw new Error(`Dispatch API returned ${response.status} on reject`);
      }

      setQueueStatus(`Request ${request.id} marked as rejected.`);
      await refreshQueue(queueFilter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setQueueStatus(`Unable to reject request: ${message}`);
    } finally {
      setActionLoading(session.id, false);
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>RescueSight Dispatcher Workflow</h1>
        <p>
          Webcam CV now owns the responder checklist (snapshot, location, questionnaire) and auto-submits
          completed reports to this dashboard for dispatcher review.
        </p>
        <p className="hero-note">
          Safety: assistive workflow only. This is not diagnosis and does not replace emergency professionals.
        </p>
        <ElevenLabsConvAI agentId={elevenLabsAgentId} summary={liveSummary} />
      </header>

      <section className="panel">
        <h2>1) Live CV Summary (Read-Only)</h2>
        <p className="helper-text">
          This reflects the latest camera feed summary and snapshot uploaded by the webcam runtime.
        </p>

        {liveSummary ? (
          <div className="live-summary-card">
            <div className="live-summary-header">
              <strong>{liveSummary.sourceDeviceId ?? "unknown device"}</strong>
              <span>Updated {formatAgo(liveSummary.updatedAtIso)}</span>
            </div>

            <div className="live-stats-grid">
              <div>
                <span className="stat-label">Person-down</span>
                <span className={`stat-value signal-${liveSummary.personDownSignal.status}`}>
                  {liveSummary.personDownSignal.status} ({liveSummary.personDownSignal.confidence.toFixed(2)})
                </span>
              </div>
              <div>
                <span className="stat-label">Hand placement</span>
                <span className="stat-value">
                  {liveSummary.signal.handPlacementStatus} ({liveSummary.signal.placementConfidence.toFixed(2)})
                </span>
              </div>
              <div>
                <span className="stat-label">Compression BPM</span>
                <span className="stat-value">{liveSummary.signal.compressionRateBpm}</span>
              </div>
              <div>
                <span className="stat-label">Rhythm quality</span>
                <span className="stat-value">{liveSummary.signal.compressionRhythmQuality}</span>
              </div>
              <div>
                <span className="stat-label">Visibility</span>
                <span className="stat-value">{liveSummary.signal.visibility}</span>
              </div>
              <div>
                <span className="stat-label">Location</span>
                <span className="stat-value">
                  {liveSummary.location
                    ? `${liveSummary.location.label} (${liveSummary.location.latitude.toFixed(5)}, ${liveSummary.location.longitude.toFixed(5)})`
                    : "Not attached"}
                </span>
              </div>
            </div>

            <p className="summary-line">{liveSummary.summaryText}</p>
            {liveSummary.victimSnapshot?.imageDataUrl ? (
              <div className="victim-image-block">
                <p className="meta-line">Latest uploaded victim snapshot</p>
                <img
                  className="victim-image"
                  src={liveSummary.victimSnapshot.imageDataUrl}
                  alt="Latest uploaded victim snapshot"
                />
                {liveSummary.victimSnapshot.triggerReason ? (
                  <p className="meta-line">Reason: {liveSummary.victimSnapshot.triggerReason}</p>
                ) : null}
              </div>
            ) : null}
            <p className="safety-notice">{liveSummary.safetyNotice}</p>
          </div>
        ) : null}

        {liveStatus ? <p className="status-message">{liveStatus}</p> : null}
      </section>

      <section className="panel">
        <h2>2) RescueSight Dispatch Dashboard</h2>
        <div className="queue-toolbar">
          <label>
            Queue filter
            <select
              value={queueFilter}
              onChange={(event) =>
                setQueueFilter(event.target.value as QueueFilter)
              }
            >
              <option value="all">All</option>
              {sessionStatusOrder.map((status) => (
                <option key={status} value={status}>
                  {sessionStatusLabelMap[status]}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="action-button secondary" onClick={() => void refreshQueue(queueFilter)}>
            {queueLoading ? "Refreshing..." : "Refresh Queue"}
          </button>
        </div>

        {queue.length === 0 ? <p className="helper-text">No sessions in the selected queue.</p> : null}

        <div className="queue-grid">
          {queue.map((session) => {
            const request = session.dispatchRequest ?? null;
            const location = session.location ?? request?.location ?? null;
            const questionnaire = session.questionnaire.answers ?? request?.questionnaire ?? null;
            const personDownSignal =
              session.personDownSignal ??
              session.liveSummary?.personDownSignal ??
              request?.personDownSignal ??
              null;
            const victimSnapshot =
              session.victimSnapshot ??
              session.liveSummary?.victimSnapshot ??
              request?.victimSnapshot ??
              null;

            const sessionBusy =
              Boolean(actionLoadingBySession[session.id]) ||
              Boolean(soapSaveLoadingBySession[session.id]);

            return (
              <article key={session.id} className="queue-card">
                <header className="queue-card-header">
                  <strong>{location?.label ?? "Location unavailable"}</strong>
                  <div className="badge-row">
                    <span className={`badge status-${session.status}`}>
                      {sessionStatusLabelMap[session.status]}
                    </span>
                    {request ? (
                      <span className={`badge status-${request.status}`}>
                        {dispatchStatusLabelMap[request.status]}
                      </span>
                    ) : null}
                    {request ? (
                      <span className={`badge priority-${request.priority}`}>
                        {priorityLabelMap[request.priority]}
                      </span>
                    ) : null}
                  </div>
                </header>

                <p className="meta-line">Session: {session.id}</p>
                <p className="meta-line">Created: {formatDateTime(session.createdAtIso)}</p>
                <p className="meta-line">Updated: {formatDateTime(session.updatedAtIso)}</p>
                <p className="meta-line">Source: {session.source}</p>

                {location ? (
                  <p className="meta-line">
                    Location: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  </p>
                ) : null}
                {location?.indoorDescriptor ? <p className="meta-line">Indoor: {location.indoorDescriptor}</p> : null}

                {questionnaire ? (
                  <>
                    <div className="triage-line">
                      <span>Resp: {questionnaire.responsiveness}</span>
                      <span>Breathing: {questionnaire.breathing}</span>
                      <span>Pulse: {questionnaire.pulse}</span>
                    </div>

                    <div className="triage-line">
                      <span>Severe bleeding: {questionnaire.severeBleeding ? "yes" : "no"}</span>
                      <span>Major trauma: {questionnaire.majorTrauma ? "yes" : "no"}</span>
                    </div>
                  </>
                ) : (
                  <p className="meta-line">Questionnaire: not submitted</p>
                )}

                {personDownSignal ? (
                  <p className="meta-line">
                    CV signal: {personDownSignal.status} ({personDownSignal.confidence.toFixed(2)})
                  </p>
                ) : (
                  <p className="meta-line">CV signal: unavailable</p>
                )}

                {victimSnapshot?.imageDataUrl ? (
                  <div className="victim-image-block">
                    <p className="meta-line">Victim snapshot</p>
                    <img
                      className="victim-image"
                      src={victimSnapshot.imageDataUrl}
                      alt={`Victim snapshot for session ${session.id}`}
                      loading="lazy"
                    />
                    {victimSnapshot.triggerReason ? (
                      <p className="meta-line">Trigger: {victimSnapshot.triggerReason}</p>
                    ) : null}
                  </div>
                ) : null}

                {session.soapReport?.combinedText ? (
                  <div className="notes-block">
                    <p className="meta-line">SOAP report:</p>
                    <textarea
                      className="soap-editor compact"
                      value={soapEditorBySession[session.id] ?? session.soapReport.combinedText}
                      onChange={(event) =>
                        setSoapEditorBySession((current) => ({
                          ...current,
                          [session.id]: event.target.value,
                        }))
                      }
                    />
                    <div className="actions-row">
                      <button
                        type="button"
                        className="action-button secondary"
                        disabled={sessionBusy}
                        onClick={() => void generateSessionSoapReport(session)}
                      >
                        {actionLoadingBySession[session.id] ? "Working..." : "Regenerate SOAP Draft"}
                      </button>
                      <button
                        type="button"
                        className="action-button secondary"
                        disabled={sessionBusy}
                        onClick={() =>
                          void saveSessionSoapReport(
                            session.id,
                            soapEditorBySession[session.id] ?? session.soapReport?.combinedText ?? "",
                          )
                        }
                      >
                        {soapSaveLoadingBySession[session.id] ? "Saving..." : "Save SOAP Edits"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="actions-row">
                    <p className="meta-line">SOAP report not generated yet.</p>
                    <button
                      type="button"
                      className="action-button secondary"
                      disabled={sessionBusy}
                      onClick={() => void generateSessionSoapReport(session)}
                    >
                      {actionLoadingBySession[session.id] ? "Working..." : "Generate SOAP Draft"}
                    </button>
                  </div>
                )}

                {questionnaire?.notes ? <p className="notes">Notes: {questionnaire.notes}</p> : null}
                {request?.dispatchNotes ? <p className="notes">Context: {request.dispatchNotes}</p> : null}

                {request?.assignment ? (
                  <div className="result-card compact">
                    <p>
                      Assigned unit <strong>{request.assignment.unitId}</strong> by{" "}
                      <strong>{request.assignment.dispatcher}</strong> (ETA {request.assignment.etaMinutes}m)
                    </p>
                    <p className="meta-line">Assigned: {formatDateTime(request.assignment.assignedAtIso)}</p>
                  </div>
                ) : null}

                {request?.status === "pending_review" ? (
                  <div className="actions-row">
                    <button
                      type="button"
                      className="action-button"
                      disabled={sessionBusy}
                      onClick={() => void sendToHospitalDispatch(session)}
                    >
                      {actionLoadingBySession[session.id] ? "Working..." : "Send To Hospital Dispatch"}
                    </button>

                    <button
                      type="button"
                      className="action-button danger"
                      disabled={sessionBusy}
                      onClick={() => void rejectDispatchRequest(session)}
                    >
                      {actionLoadingBySession[session.id] ? "Working..." : "Reject Request"}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {queueStatus ? <p className="status-message">{queueStatus}</p> : null}
      </section>
    </main>
  );
};
