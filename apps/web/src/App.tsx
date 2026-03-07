import { useEffect, useMemo, useState } from "react";
import type {
  CreateDispatchRequest,
  CreatePersonDownEventRequest,
  DispatchRequest,
  DispatchRequestStatus,
  PersonDownEvent,
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

const defaultCvInput: CreatePersonDownEventRequest = {
  signal: {
    status: "person_down",
    confidence: 0.78,
    source: "cv",
  },
  location: {
    label: "",
    latitude: 0,
    longitude: 0,
    indoorDescriptor: "",
  },
  sourceDeviceId: "quest3-kiosk-01",
};

const defaultDispatchQuestionnaire: CreateDispatchRequest["questionnaire"] = {
  responsiveness: "unresponsive",
  breathing: "abnormal_or_absent",
  pulse: "unknown",
  severeBleeding: false,
  majorTrauma: false,
  notes: "",
};

const defaultLocationForm = {
  label: "",
  latitude: "",
  longitude: "",
  indoorDescriptor: "",
  accuracyMeters: "",
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

const parseNumberOrNull = (value: string): number | null => {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const App = () => {
  const [cvInput, setCvInput] = useState<CreatePersonDownEventRequest>(defaultCvInput);
  const [locationForm, setLocationForm] = useState(defaultLocationForm);
  const [questionnaire, setQuestionnaire] = useState(defaultDispatchQuestionnaire);
  const [latestCvEvent, setLatestCvEvent] = useState<PersonDownEvent | null>(null);
  const [latestDispatchRequest, setLatestDispatchRequest] = useState<DispatchRequest | null>(null);

  const [queue, setQueue] = useState<DispatchRequest[]>([]);
  const [queueFilter, setQueueFilter] = useState<DispatchRequestStatus | "all">("all");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});

  const [cvLoading, setCvLoading] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);

  const [cvStatus, setCvStatus] = useState<string | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);

  const cvEventEndpoint = useMemo(() => toApiUrl("/api/cv/person-down"), []);
  const dispatchRequestsEndpoint = useMemo(() => toApiUrl("/api/dispatch/requests"), []);

  const getDraft = (requestId: string): AssignmentDraft =>
    assignmentDrafts[requestId] ?? defaultAssignmentDraft;

  const parseLocationOrThrow = (): CreateDispatchRequest["location"] => {
    const latitude = parseNumberOrNull(locationForm.latitude);
    const longitude = parseNumberOrNull(locationForm.longitude);

    if (!locationForm.label.trim()) {
      throw new Error("Location label is required.");
    }
    if (latitude === null || longitude === null) {
      throw new Error("Latitude and longitude are required numeric values.");
    }

    const accuracyMeters = parseNumberOrNull(locationForm.accuracyMeters);

    return {
      label: locationForm.label.trim(),
      latitude,
      longitude,
      indoorDescriptor: locationForm.indoorDescriptor.trim() || undefined,
      accuracyMeters: accuracyMeters ?? undefined,
    };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshQueue(queueFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueFilter]);

  const submitCvEvent = async () => {
    setCvLoading(true);
    setCvStatus(null);

    try {
      const location = parseLocationOrThrow();
      const payload: CreatePersonDownEventRequest = {
        ...cvInput,
        location,
        signal: {
          ...cvInput.signal,
          frameTimestampMs: Date.now(),
        },
      };

      const response = await fetch(cvEventEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`CV event API returned ${response.status}`);
      }

      const body = (await response.json()) as { event: PersonDownEvent };
      setLatestCvEvent(body.event);
      setCvStatus(
        body.event.questionnaireRequired
          ? `Person-down event accepted (${body.event.id}). Questionnaire required before escalation.`
          : `Event accepted (${body.event.id}). Continue monitoring and reassess if status changes.`,
      );
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setCvStatus(`Unable to submit CV person-down event: ${message}`);
    } finally {
      setCvLoading(false);
    }
  };

  const requestBrowserLocation = () => {
    if (!navigator.geolocation) {
      setCvStatus("Browser geolocation is unavailable in this environment.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
          accuracyMeters: position.coords.accuracy.toFixed(1),
        }));
        setCvStatus("Browser location populated. Verify before submitting.");
      },
      (error) => {
        setCvStatus(`Location request failed: ${error.message}`);
      },
      { timeout: 8_000 },
    );
  };

  const submitDispatchRequest = async () => {
    setDispatchLoading(true);
    setDispatchStatus(null);

    try {
      const location = parseLocationOrThrow();
      const personDownSignal = latestCvEvent?.signal ?? {
        status: cvInput.signal.status,
        confidence: cvInput.signal.confidence,
        source: cvInput.signal.source,
        frameTimestampMs: Date.now(),
      };

      const payload: CreateDispatchRequest = {
        questionnaire,
        location,
        personDownSignal,
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
          Demo flow: CV flags a possible person-down event, a bystander answers a short
          questionnaire, and a backend dispatch request is queued for a pseudo-hospital dashboard.
        </p>
        <p className="hero-note">
          Safety: assistive workflow only. Do not treat this as diagnosis or a replacement for real
          emergency services.
        </p>
      </header>

      <section className="panel">
        <h2>1) CV Person-Down Intake</h2>
        <p className="helper-text">
          Submit a detection event. When confidence is high, the system requires human questionnaire
          confirmation before escalation.
        </p>

        <div className="form-grid">
          <label>
            Detection status
            <select
              value={cvInput.signal.status}
              onChange={(event) =>
                setCvInput((current) => ({
                  ...current,
                  signal: {
                    ...current.signal,
                    status: event.target.value as CreatePersonDownEventRequest["signal"]["status"],
                  },
                }))
              }
            >
              <option value="person_down">Person down</option>
              <option value="uncertain">Uncertain</option>
              <option value="not_person_down">Not person down</option>
            </select>
          </label>

          <label>
            Confidence ({cvInput.signal.confidence.toFixed(2)})
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={cvInput.signal.confidence}
              onChange={(event) =>
                setCvInput((current) => ({
                  ...current,
                  signal: {
                    ...current.signal,
                    confidence: Number(event.target.value),
                  },
                }))
              }
            />
          </label>

          <label>
            Signal source
            <select
              value={cvInput.signal.source}
              onChange={(event) =>
                setCvInput((current) => ({
                  ...current,
                  signal: {
                    ...current.signal,
                    source: event.target.value as CreatePersonDownEventRequest["signal"]["source"],
                  },
                }))
              }
            >
              <option value="cv">CV</option>
              <option value="manual">Manual</option>
              <option value="api">API</option>
            </select>
          </label>

          <label>
            Source device ID
            <input
              type="text"
              value={cvInput.sourceDeviceId ?? ""}
              onChange={(event) =>
                setCvInput((current) => ({
                  ...current,
                  sourceDeviceId: event.target.value,
                }))
              }
              placeholder="quest3-kiosk-01"
            />
          </label>

          <label>
            Location label
            <input
              type="text"
              value={locationForm.label}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="Main entrance"
            />
          </label>

          <label>
            Indoor descriptor
            <input
              type="text"
              value={locationForm.indoorDescriptor}
              onChange={(event) =>
                setLocationForm((current) => ({
                  ...current,
                  indoorDescriptor: event.target.value,
                }))
              }
              placeholder="Floor 1 - west lobby"
            />
          </label>

          <label>
            Latitude
            <input
              type="number"
              step="0.000001"
              value={locationForm.latitude}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, latitude: event.target.value }))
              }
            />
          </label>

          <label>
            Longitude
            <input
              type="number"
              step="0.000001"
              value={locationForm.longitude}
              onChange={(event) =>
                setLocationForm((current) => ({ ...current, longitude: event.target.value }))
              }
            />
          </label>

          <label>
            Accuracy (meters)
            <input
              type="number"
              step="0.1"
              value={locationForm.accuracyMeters}
              onChange={(event) =>
                setLocationForm((current) => ({
                  ...current,
                  accuracyMeters: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="actions-row">
          <button type="button" className="action-button" disabled={cvLoading} onClick={submitCvEvent}>
            {cvLoading ? "Submitting..." : "Submit CV Person-Down Event"}
          </button>
          <button type="button" className="action-button secondary" onClick={requestBrowserLocation}>
            Use Browser Location
          </button>
        </div>

        {latestCvEvent ? (
          <div className="result-card">
            <p>
              Event ID: <strong>{latestCvEvent.id}</strong>
            </p>
            <p>
              Questionnaire required: <strong>{latestCvEvent.questionnaireRequired ? "Yes" : "No"}</strong>
            </p>
            <p>
              Recommended priority: <strong>{priorityLabelMap[latestCvEvent.recommendedPriority]}</strong>
            </p>
            <p className="safety-notice">{latestCvEvent.safetyNotice}</p>
          </div>
        ) : null}

        {cvStatus ? <p className="status-message">{cvStatus}</p> : null}
      </section>

      <section className="panel">
        <h2>2) Human-In-The-Loop Questionnaire</h2>
        <p className="helper-text">
          Collect quick bystander observations before escalation. This action simulates a 911-like
          call by posting to the backend dispatch queue.
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
