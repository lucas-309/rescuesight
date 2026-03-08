import { useEffect, useMemo, useState } from "react";
import { ElevenLabsConvAI } from "./ElevenLabsConvAI";
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

const formatLocationInline = (location: DispatchLocation): string =>
  `${location.label} (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})`;

const deriveAssessment = (
  questionnaire: CreateDispatchRequest["questionnaire"],
  liveSummary: CvLiveSummary | null,
): { label: string; acuity: "critical" | "high"; rationale: string } => {
  const reasons: string[] = [];

  const likelyCardiacArrest =
    questionnaire.responsiveness === "unresponsive" &&
    questionnaire.breathing === "abnormal_or_absent";
  if (likelyCardiacArrest) {
    reasons.push("unresponsive with abnormal/absent breathing");
    return {
      label: "Possible out-of-hospital cardiac arrest",
      acuity: "critical",
      rationale: reasons.join("; "),
    };
  }

  if (questionnaire.pulse === "absent") {
    reasons.push("pulse documented as absent");
    return {
      label: "Possible circulatory collapse",
      acuity: "critical",
      rationale: reasons.join("; "),
    };
  }

  if (questionnaire.severeBleeding) {
    reasons.push("severe bleeding observed");
    return {
      label: "Possible hemorrhagic emergency",
      acuity: "critical",
      rationale: reasons.join("; "),
    };
  }

  if (questionnaire.majorTrauma) {
    reasons.push("major trauma suspected");
    return {
      label: "Possible major trauma emergency",
      acuity: "critical",
      rationale: reasons.join("; "),
    };
  }

  if (
    liveSummary?.personDownSignal.status === "person_down" &&
    liveSummary.personDownSignal.confidence >= 0.75
  ) {
    reasons.push("high-confidence CV person-down signal");
    return {
      label: "High-risk person-down medical event",
      acuity: "high",
      rationale: reasons.join("; "),
    };
  }

  if (questionnaire.breathing === "abnormal_or_absent") {
    reasons.push("abnormal breathing reported");
  }
  if (questionnaire.responsiveness === "unknown") {
    reasons.push("responsiveness remains unknown");
  }
  if (liveSummary?.personDownSignal.status === "uncertain") {
    reasons.push("CV person-down status uncertain");
  }

  return {
    label: "Undifferentiated medical emergency",
    acuity: "high",
    rationale: reasons.join("; ") || "limited findings available",
  };
};

const buildSoapReportText = (
  questionnaire: CreateDispatchRequest["questionnaire"],
  liveSummary: CvLiveSummary | null,
  location: DispatchLocation | null,
): string => {
  const generatedAt = new Date().toISOString();
  const assessment = deriveAssessment(questionnaire, liveSummary);

  const subjective = [
    `Bystander questionnaire: responsiveness=${questionnaire.responsiveness}, breathing=${questionnaire.breathing}, pulse=${questionnaire.pulse}.`,
    `Severe bleeding=${questionnaire.severeBleeding ? "yes" : "no"}, major trauma=${questionnaire.majorTrauma ? "yes" : "no"}.`,
    questionnaire.notes?.trim()
      ? `Bystander free-text notes: ${questionnaire.notes.trim()}`
      : "Bystander free-text notes: none provided.",
  ].join(" ");

  const objectiveLines: string[] = [];
  if (liveSummary) {
    objectiveLines.push(
      `CV source=${liveSummary.sourceDeviceId ?? "unknown"}, updated=${formatDateTime(liveSummary.updatedAtIso)}.`,
    );
    objectiveLines.push(
      `Person-down=${liveSummary.personDownSignal.status} (${liveSummary.personDownSignal.confidence.toFixed(2)}).`,
    );
    if (liveSummary.victimSnapshot?.capturedAtIso) {
      objectiveLines.push(
        `Victim snapshot captured=${formatDateTime(liveSummary.victimSnapshot.capturedAtIso)}.`,
      );
    } else if (liveSummary.victimSnapshot?.frameTimestampMs) {
      objectiveLines.push(`Victim snapshot frame ts=${liveSummary.victimSnapshot.frameTimestampMs}.`);
    }
    objectiveLines.push(
      `Compression=${liveSummary.signal.compressionRateBpm} BPM (${liveSummary.signal.compressionRhythmQuality}), placement=${liveSummary.signal.handPlacementStatus} (${liveSummary.signal.placementConfidence.toFixed(2)}), visibility=${liveSummary.signal.visibility}.`,
    );
  } else {
    objectiveLines.push("Live CV summary unavailable at time of report generation.");
  }

  if (location) {
    objectiveLines.push(`Scene location=${formatLocationInline(location)}.`);
    if (location.indoorDescriptor) {
      objectiveLines.push(`Indoor descriptor=${location.indoorDescriptor}.`);
    }
  } else {
    objectiveLines.push("Scene location unavailable.");
  }
  const objective = objectiveLines.join(" ");

  const planItems: string[] = [
    "Activate/continue EMS dispatch and maintain continuous monitoring until handoff.",
    "Re-check responsiveness, breathing, and pulse every 1-2 minutes or with status change.",
  ];
  if (assessment.acuity === "critical") {
    planItems.push("Prioritize immediate critical-response pathway and rapid EMT arrival.");
  }
  if (questionnaire.responsiveness === "unresponsive" && questionnaire.breathing === "abnormal_or_absent") {
    planItems.push("Begin/continue high-quality CPR and prepare AED if available.");
  }
  if (questionnaire.severeBleeding) {
    planItems.push("Apply direct pressure and hemorrhage control measures.");
  }
  if (questionnaire.majorTrauma) {
    planItems.push("Minimize movement and follow trauma precautions while awaiting EMT.");
  }
  planItems.push("Document timeline updates and transfer this report to responding EMT team.");
  const plan = planItems.join(" ");

  return [
    "SOAP REPORT (EMT handoff format, assistive draft)",
    `Generated: ${formatDateTime(generatedAt)}`,
    "",
    `S: ${subjective}`,
    `O: ${objective}`,
    `A: ${assessment.label}. Acuity=${assessment.acuity}. Rationale: ${assessment.rationale}.`,
    `P: ${plan}`,
    "",
    "Safety note: This auto-generated report is assistive and does not replace clinical judgment.",
  ].join("\n");
};

const mergeQuestionnaireNotesWithSoap = (
  manualNotes: string | undefined,
  soapReport: string,
): string => {
  const manual = manualNotes?.trim();
  const combined = [
    manual ? `BYSTANDER NOTES\n${manual}` : "BYSTANDER NOTES\nNone provided.",
    "AUTOGENERATED SOAP REPORT",
    soapReport,
  ].join("\n\n");
  return combined.slice(0, 8_000);
};

export const App = () => {
  const [questionnaire, setQuestionnaire] = useState(defaultDispatchQuestionnaire);
  const [latestDispatchRequest, setLatestDispatchRequest] = useState<DispatchRequest | null>(null);

  const [liveSummary, setLiveSummary] = useState<CvLiveSummary | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  const [browserLocation, setBrowserLocation] = useState<DispatchLocation | null>(null);

  const [queue, setQueue] = useState<DispatchRequest[]>([]);
  const [queueFilter, setQueueFilter] = useState<DispatchRequestStatus | "all">("all");

  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);

  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);

  const liveSummaryEndpoint = useMemo(() => toApiUrl("/api/cv/live-summary"), []);
  const dispatchRequestsEndpoint = useMemo(() => toApiUrl("/api/dispatch/requests"), []);
  const effectiveLocation = liveSummary?.location ?? browserLocation;
  const soapReportPreview = useMemo(
    () => buildSoapReportText(questionnaire, liveSummary, effectiveLocation),
    [questionnaire, liveSummary, effectiveLocation],
  );

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
    const intervalId = window.setInterval(() => {
      void refreshQueue(queueFilter);
    }, 2_000);
    return () => {
      window.clearInterval(intervalId);
    };
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
      const questionnaireWithSoap: CreateDispatchRequest["questionnaire"] = {
        ...questionnaire,
        notes: mergeQuestionnaireNotesWithSoap(questionnaire.notes, soapReportPreview),
      };

      const payload: CreateDispatchRequest = {
        questionnaire: questionnaireWithSoap,
        location,
        personDownSignal: liveSummary.personDownSignal,
        victimSnapshot: liveSummary.victimSnapshot,
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

  const dispatchUnitPlaceholder = (requestId: string) => {
    setQueueStatus(
      `Dispatch EMT clicked for ${requestId}. Placeholder only for now (no backend action yet).`,
    );
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

      <section className="voice-guide-banner" aria-label="Voice assistant instructions">
        <h2 className="voice-guide-title">Voice CPR guide</h2>
        <p className="voice-guide-steps">
          <strong>1.</strong> Tap the &quot;Voice CPR guide&quot; button (bottom right).{" "}
          <strong>2.</strong> Tap &quot;Start&quot;.{" "}
          <strong>3.</strong> The AI will speak first—no need to say hello. Follow the voice instructions.
        </p>
      </section>

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
            {liveSummary.victimSnapshot?.imageDataUrl ? (
              <div className="victim-image-block">
                <p className="meta-line">Latest victim snapshot from live feed</p>
                <img
                  className="victim-image"
                  src={liveSummary.victimSnapshot.imageDataUrl}
                  alt="Latest victim snapshot from live CV stream"
                />
                {liveSummary.victimSnapshot.triggerReason ? (
                  <p className="meta-line">Reason: {liveSummary.victimSnapshot.triggerReason}</p>
                ) : null}
              </div>
            ) : null}
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

        <div className="soap-card">
          <h3>Auto-Generated SOAP Report</h3>
          <p className="helper-text">
            Combines live CV summary + questionnaire inputs into an EMT handoff-style SOAP draft.
          </p>
          <pre className="soap-pre">{soapReportPreview}</pre>
        </div>

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
            {latestDispatchRequest.victimSnapshot?.imageDataUrl ? (
              <div className="victim-image-block">
                <p className="meta-line">Victim snapshot</p>
                <img
                  className="victim-image"
                  src={latestDispatchRequest.victimSnapshot.imageDataUrl}
                  alt={`Victim snapshot for request ${latestDispatchRequest.id}`}
                />
              </div>
            ) : null}
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
                {request.victimSnapshot?.imageDataUrl ? (
                  <div className="victim-image-block">
                    <p className="meta-line">Victim snapshot</p>
                    <img
                      className="victim-image"
                      src={request.victimSnapshot.imageDataUrl}
                      alt={`Victim snapshot for request ${request.id}`}
                      loading="lazy"
                    />
                    {request.victimSnapshot.triggerReason ? (
                      <p className="meta-line">Trigger: {request.victimSnapshot.triggerReason}</p>
                    ) : null}
                  </div>
                ) : null}
                {request.questionnaire.notes ? (
                  <div className="notes-block">
                    <p className="meta-line">Questionnaire + SOAP:</p>
                    <pre className="soap-pre compact">{request.questionnaire.notes}</pre>
                  </div>
                ) : null}
                {request.dispatchNotes ? <p className="notes">Context: {request.dispatchNotes}</p> : null}

                {request.assignment ? (
                  <div className="result-card compact">
                    <p>
                      Assigned unit <strong>{request.assignment.unitId}</strong> by{" "}
                      <strong>{request.assignment.dispatcher}</strong> (ETA {request.assignment.etaMinutes}m)
                    </p>
                    <p className="meta-line">Assigned: {formatDateTime(request.assignment.assignedAtIso)}</p>
                  </div>
                ) : null}

                <div className="actions-row">
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => dispatchUnitPlaceholder(request.id)}
                  >
                    Dispatch EMT (placeholder)
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {queueStatus ? <p className="status-message">{queueStatus}</p> : null}
      </section>

      <ElevenLabsConvAI liveSummary={liveSummary} />
    </main>
  );
};
