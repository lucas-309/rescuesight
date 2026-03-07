import { useEffect, useMemo, useState } from "react";
import type {
  CreateDispatchRequest,
  CvLiveSummary,
  DispatchLocation,
  DispatchRequest,
  DispatchRequestStatus,
} from "@rescuesight/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const toApiUrl = (path: string): string => {
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return `${base}${path}`;
};

type AssignmentDraft = {
  unitId: string;
  dispatcher: string;
  etaMinutes: string;
  dispatchNotes: string;
};

const defaultAssignmentDraft: AssignmentDraft = {
  unitId: "",
  dispatcher: "",
  etaMinutes: "5",
  dispatchNotes: "",
};

const defaultDispatchQuestionnaire: CreateDispatchRequest["questionnaire"] = {
  responsiveness: "unresponsive",
  breathing: "abnormal_or_absent",
  pulse: "unknown",
  severeBleeding: false,
  majorTrauma: false,
  notes: "",
};

const statusOrder: DispatchRequestStatus[] = ["pending_review", "dispatched", "resolved"];

const statusLabelMap: Record<DispatchRequestStatus, string> = {
  pending_review: "Pending Review",
  dispatched: "Dispatched",
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
  const [questionnaire, setQuestionnaire] = useState(defaultDispatchQuestionnaire);
  const [latestDispatchRequest, setLatestDispatchRequest] = useState<DispatchRequest | null>(null);

  const [liveSummary, setLiveSummary] = useState<CvLiveSummary | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  const [browserLocation, setBrowserLocation] = useState<DispatchLocation | null>(null);

  const [queue, setQueue] = useState<DispatchRequest[]>([]);
  const [queueFilter, setQueueFilter] = useState<DispatchRequestStatus | "all">("all");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});

  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);

  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);

  const liveSummaryEndpoint = useMemo(() => toApiUrl("/api/cv/live-summary"), []);
  const dispatchRequestsEndpoint = useMemo(() => toApiUrl("/api/dispatch/requests"), []);

  const getDraft = (requestId: string): AssignmentDraft =>
    assignmentDrafts[requestId] ?? defaultAssignmentDraft;

  const refreshLiveSummary = async () => {
    try {
      const response = await fetch(liveSummaryEndpoint);
      if (response.status === 404) {
        setLiveSummary(null);
        setLiveStatus(
          "No live CV stream yet. Start run_webcam.py with --post-url http://127.0.0.1:8080/api/cv/live-signal.",
        );
        return;
      }
      if (!response.ok) {
        throw new Error(`Live summary API returned ${response.status}`);
      }

      const payload = (await response.json()) as { summary: CvLiveSummary };
      setLiveSummary(payload.summary);
      setLiveStatus(`Live stream active from ${payload.summary.sourceDeviceId ?? "unknown device"}.`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setLiveSummary(null);
      setLiveStatus(`Unable to load live CV summary: ${message}`);
    }
  };

  const refreshQueue = async (filter: DispatchRequestStatus | "all" = queueFilter) => {
    setQueueLoading(true);
    setQueueStatus(null);

    try {
      const query = filter === "all" ? "" : `?status=${filter}`;
      const response = await fetch(`${dispatchRequestsEndpoint}${query}`);
      if (!response.ok) {
        throw new Error(`Queue API returned ${response.status}`);
      }

      const payload = (await response.json()) as {
        requests: DispatchRequest[];
        count: number;
      };
      setQueue(payload.requests);
      setQueueStatus(`Loaded ${payload.count} dispatch request${payload.count === 1 ? "" : "s"}.`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setQueueStatus(`Unable to load dispatch queue: ${message}`);
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    void refreshQueue("all");
    void refreshLiveSummary();

    const intervalId = window.setInterval(() => {
      void refreshLiveSummary();
    }, 1500);

    return () => {
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshQueue(queueFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueFilter]);

  const captureBrowserLocation = () => {
    if (!navigator.geolocation) {
      setDispatchStatus("Browser geolocation is unavailable in this environment.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const fallbackLocation: DispatchLocation = {
          label: "Browser geolocation",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number(position.coords.accuracy.toFixed(1)),
        };
        setBrowserLocation(fallbackLocation);
        setDispatchStatus("Browser geolocation captured for dispatch fallback.");
      },
      (error) => {
        setDispatchStatus(`Location request failed: ${error.message}`);
      },
      { timeout: 8_000 },
    );
  };

  const submitDispatchRequest = async () => {
    setDispatchLoading(true);
    setDispatchStatus(null);

    try {
      if (!liveSummary) {
        throw new Error("No live CV summary available. Stream camera stats first.");
      }

      const location = liveSummary.location ?? browserLocation;
      if (!location) {
        throw new Error(
          "No location is attached to the live stream. Add location args in run_webcam.py or capture browser geolocation.",
        );
      }

      const payload: CreateDispatchRequest = {
        questionnaire,
        location,
        personDownSignal: liveSummary.personDownSignal,
        emergencyCallRequested: true,
      };

      const response = await fetch(dispatchRequestsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Dispatch API returned ${response.status}`);
      }

      const body = (await response.json()) as {
        request: DispatchRequest;
        backendEscalation: { queued: boolean; channel: string; requestId: string };
      };

      setLatestDispatchRequest(body.request);
      setDispatchStatus(
        `Escalation queued to ${body.backendEscalation.channel} (${body.backendEscalation.requestId}).`,
      );
      await refreshQueue(queueFilter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setDispatchStatus(`Unable to create dispatch request: ${message}`);
    } finally {
      setDispatchLoading(false);
    }
  };

  const applyDispatchUpdate = async (
    requestId: string,
    payload: {
      status?: DispatchRequestStatus;
      assignment?: { unitId: string; dispatcher: string; etaMinutes: number };
      dispatchNotes?: string;
    },
  ) => {
    const response = await fetch(`${dispatchRequestsEndpoint}/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Dispatch update API returned ${response.status}`);
    }
  };

  const dispatchUnit = async (requestId: string) => {
    const draft = getDraft(requestId);
    if (!draft.unitId.trim() || !draft.dispatcher.trim()) {
      setQueueStatus("Unit ID and dispatcher are required to dispatch an EMT unit.");
      return;
    }

    const etaMinutes = Number(draft.etaMinutes);
    if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) {
      setQueueStatus("ETA minutes must be a positive number.");
      return;
    }

    try {
      setQueueStatus(null);
      await applyDispatchUpdate(requestId, {
        assignment: {
          unitId: draft.unitId.trim(),
          dispatcher: draft.dispatcher.trim(),
          etaMinutes,
        },
        dispatchNotes: draft.dispatchNotes.trim() || undefined,
      });
      setQueueStatus(`Request ${requestId} dispatched to ${draft.unitId.trim()}.`);
      await refreshQueue(queueFilter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setQueueStatus(`Unable to dispatch unit: ${message}`);
    }
  };

  const resolveRequest = async (requestId: string) => {
    try {
      setQueueStatus(null);
      await applyDispatchUpdate(requestId, { status: "resolved" });
      setQueueStatus(`Request ${requestId} marked resolved.`);
      await refreshQueue(queueFilter);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setQueueStatus(`Unable to resolve request: ${message}`);
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>RescueSight Dispatch Workflow</h1>
        <p>
          Live camera stats are streamed from the CV pipeline. The UI reads that live summary,
          then a human responder answers a short questionnaire before escalation.
        </p>
        <p className="hero-note">
          Safety: assistive workflow only. This is not diagnosis and does not replace emergency
          professionals.
        </p>
      </header>

      <section className="panel">
        <h2>1) Live CV Summary</h2>
        <p className="helper-text">
          Start stream from webcam script:
          <code> python run_webcam.py --post-url http://127.0.0.1:8080/api/cv/live-signal --source-device-id quest3-kiosk-01 --location-label "Main lobby" --location-lat 37.8715 --location-lon -122.2730</code>
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
            <p className="safety-notice">{liveSummary.safetyNotice}</p>
          </div>
        ) : null}

        <div className="actions-row">
          <button type="button" className="action-button secondary" onClick={() => void refreshLiveSummary()}>
            Refresh Live Summary
          </button>
          <button type="button" className="action-button secondary" onClick={captureBrowserLocation}>
            Capture Browser Location Fallback
          </button>
        </div>

        {browserLocation ? (
          <p className="helper-text">
            Browser fallback: {browserLocation.latitude.toFixed(5)}, {browserLocation.longitude.toFixed(5)}
          </p>
        ) : null}

        {liveStatus ? <p className="status-message">{liveStatus}</p> : null}
      </section>

      <section className="panel">
        <h2>2) Human-In-The-Loop Questionnaire</h2>
        <p className="helper-text">
          Answer quick bystander checks. Escalation uses the latest live CV summary stats and
          location data.
        </p>

        <div className="form-grid">
          <label>
            Responsiveness
            <select
              value={questionnaire.responsiveness}
              onChange={(event) =>
                setQuestionnaire((current) => ({
                  ...current,
                  responsiveness: event.target.value as CreateDispatchRequest["questionnaire"]["responsiveness"],
                }))
              }
            >
              <option value="unresponsive">Unresponsive</option>
              <option value="responsive">Responsive</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>

          <label>
            Breathing
            <select
              value={questionnaire.breathing}
              onChange={(event) =>
                setQuestionnaire((current) => ({
                  ...current,
                  breathing: event.target.value as CreateDispatchRequest["questionnaire"]["breathing"],
                }))
              }
            >
              <option value="abnormal_or_absent">Abnormal or absent</option>
              <option value="normal">Normal</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>

          <label>
            Pulse
            <select
              value={questionnaire.pulse}
              onChange={(event) =>
                setQuestionnaire((current) => ({
                  ...current,
                  pulse: event.target.value as CreateDispatchRequest["questionnaire"]["pulse"],
                }))
              }
            >
              <option value="unknown">Unknown</option>
              <option value="absent">Absent</option>
              <option value="present">Present</option>
            </select>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={questionnaire.severeBleeding}
              onChange={(event) =>
                setQuestionnaire((current) => ({
                  ...current,
                  severeBleeding: event.target.checked,
                }))
              }
            />
            Severe bleeding observed
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={questionnaire.majorTrauma}
              onChange={(event) =>
                setQuestionnaire((current) => ({
                  ...current,
                  majorTrauma: event.target.checked,
                }))
              }
            />
            Major trauma suspected
          </label>
        </div>

        <label className="textarea-label">
          Bystander notes
          <textarea
            value={questionnaire.notes ?? ""}
            onChange={(event) =>
              setQuestionnaire((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            placeholder="Additional scene context for dispatchers"
          />
        </label>

        <div className="actions-row">
          <button
            type="button"
            className="action-button"
            disabled={dispatchLoading}
            onClick={submitDispatchRequest}
          >
            {dispatchLoading ? "Escalating..." : "Send Backend Emergency Escalation"}
          </button>
        </div>

        {latestDispatchRequest ? (
          <div className="result-card">
            <p>
              Dispatch Request ID: <strong>{latestDispatchRequest.id}</strong>
            </p>
            <p>
              Priority: <strong>{priorityLabelMap[latestDispatchRequest.priority]}</strong>
            </p>
            <p>
              Status: <strong>{statusLabelMap[latestDispatchRequest.status]}</strong>
            </p>
            <p className="safety-notice">{latestDispatchRequest.safetyNotice}</p>
          </div>
        ) : null}

        {dispatchStatus ? <p className="status-message">{dispatchStatus}</p> : null}
      </section>

      <section className="panel">
        <h2>3) Pseudo-Hospital Dispatch Dashboard</h2>
        <div className="queue-toolbar">
          <label>
            Queue filter
            <select
              value={queueFilter}
              onChange={(event) =>
                setQueueFilter(event.target.value as DispatchRequestStatus | "all")
              }
            >
              <option value="all">All</option>
              {statusOrder.map((status) => (
                <option key={status} value={status}>
                  {statusLabelMap[status]}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="action-button secondary" onClick={() => void refreshQueue(queueFilter)}>
            {queueLoading ? "Refreshing..." : "Refresh Queue"}
          </button>
        </div>

        {queue.length === 0 ? <p className="helper-text">No requests in the selected queue.</p> : null}

        <div className="queue-grid">
          {queue.map((request) => {
            const draft = getDraft(request.id);

            return (
              <article key={request.id} className="queue-card">
                <header className="queue-card-header">
                  <strong>{request.location.label}</strong>
                  <div className="badge-row">
                    <span className={`badge status-${request.status}`}>{statusLabelMap[request.status]}</span>
                    <span className={`badge priority-${request.priority}`}>
                      {priorityLabelMap[request.priority]}
                    </span>
                  </div>
                </header>

                <p className="meta-line">Created: {formatDateTime(request.createdAtIso)}</p>
                <p className="meta-line">
                  Location: {request.location.latitude.toFixed(6)}, {request.location.longitude.toFixed(6)}
                </p>
                {request.location.indoorDescriptor ? (
                  <p className="meta-line">Indoor: {request.location.indoorDescriptor}</p>
                ) : null}

                <div className="triage-line">
                  <span>Resp: {request.questionnaire.responsiveness}</span>
                  <span>Breathing: {request.questionnaire.breathing}</span>
                  <span>Pulse: {request.questionnaire.pulse}</span>
                </div>

                <div className="triage-line">
                  <span>Severe bleeding: {request.questionnaire.severeBleeding ? "yes" : "no"}</span>
                  <span>Major trauma: {request.questionnaire.majorTrauma ? "yes" : "no"}</span>
                </div>

                <p className="meta-line">
                  CV signal: {request.personDownSignal.status} ({request.personDownSignal.confidence.toFixed(2)})
                </p>
                {request.questionnaire.notes ? <p className="notes">Notes: {request.questionnaire.notes}</p> : null}

                {request.assignment ? (
                  <div className="result-card compact">
                    <p>
                      Assigned unit <strong>{request.assignment.unitId}</strong> by{" "}
                      <strong>{request.assignment.dispatcher}</strong> (ETA {request.assignment.etaMinutes}m)
                    </p>
                    <p className="meta-line">Assigned: {formatDateTime(request.assignment.assignedAtIso)}</p>
                  </div>
                ) : null}

                {request.status !== "resolved" ? (
                  <div className="assignment-form">
                    <input
                      type="text"
                      value={draft.unitId}
                      placeholder="Unit ID"
                      onChange={(event) =>
                        setAssignmentDrafts((current) => ({
                          ...current,
                          [request.id]: {
                            ...draft,
                            unitId: event.target.value,
                          },
                        }))
                      }
                    />
                    <input
                      type="text"
                      value={draft.dispatcher}
                      placeholder="Dispatcher"
                      onChange={(event) =>
                        setAssignmentDrafts((current) => ({
                          ...current,
                          [request.id]: {
                            ...draft,
                            dispatcher: event.target.value,
                          },
                        }))
                      }
                    />
                    <input
                      type="number"
                      min={1}
                      value={draft.etaMinutes}
                      placeholder="ETA min"
                      onChange={(event) =>
                        setAssignmentDrafts((current) => ({
                          ...current,
                          [request.id]: {
                            ...draft,
                            etaMinutes: event.target.value,
                          },
                        }))
                      }
                    />
                    <textarea
                      value={draft.dispatchNotes}
                      placeholder="Dispatch notes"
                      onChange={(event) =>
                        setAssignmentDrafts((current) => ({
                          ...current,
                          [request.id]: {
                            ...draft,
                            dispatchNotes: event.target.value,
                          },
                        }))
                      }
                    />
                    <div className="actions-row">
                      <button
                        type="button"
                        className="action-button"
                        onClick={() => void dispatchUnit(request.id)}
                      >
                        Dispatch EMT
                      </button>
                      <button
                        type="button"
                        className="action-button secondary"
                        onClick={() => void resolveRequest(request.id)}
                      >
                        Mark Resolved
                      </button>
                    </div>
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
