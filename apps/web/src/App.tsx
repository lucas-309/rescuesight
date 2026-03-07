import { useMemo, useState } from "react";
import type {
  AedStatus,
  HeartRelatedSigns,
  IncidentActionKey,
  IncidentTimeline,
  StrokeSigns,
  TriageAnswers,
  TriageEvaluationResponse,
} from "@rescuesight/shared";
import { CprMetronome } from "./CprMetronome";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

interface ScenarioPreset {
  id: string;
  title: string;
  description: string;
  answers: TriageAnswers;
}

const defaultStrokeSigns: StrokeSigns = {
  faceDrooping: false,
  armWeakness: false,
  speechDifficulty: false,
};

const defaultHeartSigns: HeartRelatedSigns = {
  chestDiscomfort: false,
  shortnessOfBreath: false,
  coldSweat: false,
  nauseaOrUpperBodyDiscomfort: false,
};

const defaultAnswers: TriageAnswers = {
  responsive: true,
  breathingNormal: true,
  strokeSigns: defaultStrokeSigns,
  heartRelatedSigns: defaultHeartSigns,
};

const actionLabelMap: Record<IncidentActionKey, string> = {
  emsCalled: "Emergency services called",
  cprStarted: "CPR started",
  aedRequested: "AED retrieval requested",
  aedArrived: "AED arrived on scene",
  strokeOnsetRecorded: "Stroke symptom onset time recorded",
};

const actionKeys = Object.keys(actionLabelMap) as IncidentActionKey[];

const aedStatusLabelMap: Record<AedStatus, string> = {
  unknown: "Unknown",
  not_available: "Not available nearby",
  retrieval_in_progress: "Retrieval in progress",
  on_scene: "AED on scene",
};

const defaultTimeline: IncidentTimeline = {
  firstObservedAtLocal: "",
  responderNotes: "",
  aedStatus: "unknown",
  actionsTaken: {
    emsCalled: false,
    cprStarted: false,
    aedRequested: false,
    aedArrived: false,
    strokeOnsetRecorded: false,
  },
};

const cloneAnswers = (answers: TriageAnswers): TriageAnswers => ({
  responsive: answers.responsive,
  breathingNormal: answers.breathingNormal,
  strokeSigns: { ...answers.strokeSigns },
  heartRelatedSigns: { ...answers.heartRelatedSigns },
});

const toLocalDateTimeInput = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const formatDateTime = (value: string): string => {
  if (!value) {
    return "Not recorded";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not recorded";
  }
  return parsed.toLocaleString();
};

const scenarioPresets: ScenarioPreset[] = [
  {
    id: "collapse",
    title: "Collapse / Unresponsive",
    description: "Simulates a possible cardiac arrest pathway.",
    answers: {
      responsive: false,
      breathingNormal: false,
      strokeSigns: {
        faceDrooping: false,
        armWeakness: false,
        speechDifficulty: false,
      },
      heartRelatedSigns: {
        chestDiscomfort: false,
        shortnessOfBreath: false,
        coldSweat: false,
        nauseaOrUpperBodyDiscomfort: false,
      },
    },
  },
  {
    id: "stroke",
    title: "Suspected Stroke",
    description: "Simulates FAST-positive signs with normal breathing.",
    answers: {
      responsive: true,
      breathingNormal: true,
      strokeSigns: {
        faceDrooping: true,
        armWeakness: true,
        speechDifficulty: true,
      },
      heartRelatedSigns: {
        chestDiscomfort: false,
        shortnessOfBreath: false,
        coldSweat: false,
        nauseaOrUpperBodyDiscomfort: false,
      },
    },
  },
  {
    id: "heart",
    title: "Heart-Related Signs",
    description: "Simulates a possible heart-related emergency branch.",
    answers: {
      responsive: true,
      breathingNormal: true,
      strokeSigns: {
        faceDrooping: false,
        armWeakness: false,
        speechDifficulty: false,
      },
      heartRelatedSigns: {
        chestDiscomfort: true,
        shortnessOfBreath: true,
        coldSweat: true,
        nauseaOrUpperBodyDiscomfort: false,
      },
    },
  },
  {
    id: "unclear",
    title: "Unclear Emergency",
    description: "Simulates inconclusive signs requiring escalation.",
    answers: {
      responsive: true,
      breathingNormal: true,
      strokeSigns: {
        faceDrooping: false,
        armWeakness: false,
        speechDifficulty: false,
      },
      heartRelatedSigns: {
        chestDiscomfort: false,
        shortnessOfBreath: false,
        coldSweat: false,
        nauseaOrUpperBodyDiscomfort: false,
      },
    },
  },
];

export const App = () => {
  const [answers, setAnswers] = useState<TriageAnswers>(defaultAnswers);
  const [timeline, setTimeline] = useState<IncidentTimeline>(defaultTimeline);
  const [result, setResult] = useState<TriageEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [savingIncident, setSavingIncident] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [savedIncidentId, setSavedIncidentId] = useState<string | null>(null);

  const evaluateEndpoint = useMemo(
    () => `${API_BASE_URL}/api/triage/evaluate`.replace(/\/\//g, "/").replace("http:/", "http://").replace("https:/", "https://"),
    [],
  );
  const incidentsEndpoint = useMemo(
    () => `${API_BASE_URL}/api/incidents`.replace(/\/\//g, "/").replace("http:/", "http://").replace("https:/", "https://"),
    [],
  );

  const setStrokeSign = (key: keyof StrokeSigns, value: boolean) => {
    setAnswers((current) => ({
      ...current,
      strokeSigns: {
        ...current.strokeSigns,
        [key]: value,
      },
    }));
  };

  const setHeartSign = (key: keyof HeartRelatedSigns, value: boolean) => {
    setAnswers((current) => ({
      ...current,
      heartRelatedSigns: {
        ...current.heartRelatedSigns,
        [key]: value,
      },
    }));
  };

  const setTimelineAction = (key: IncidentActionKey, value: boolean) => {
    setTimeline((current) => ({
      ...current,
      actionsTaken: {
        ...current.actionsTaken,
        [key]: value,
      },
    }));
  };

  const loadPreset = (preset: ScenarioPreset) => {
    setAnswers(cloneAnswers(preset.answers));
    setResult(null);
    setError(null);
    setCopyStatus(null);
    setSaveStatus(null);
    setSavedIncidentId(null);
    setTimeline((current) => ({
      ...current,
      firstObservedAtLocal: current.firstObservedAtLocal || toLocalDateTimeInput(new Date()),
    }));
  };

  const evaluate = async () => {
    setLoading(true);
    setError(null);
    setCopyStatus(null);
    setSaveStatus(null);

    try {
      const response = await fetch(evaluateEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });

      if (!response.ok) {
        throw new Error(`Triage API returned ${response.status}`);
      }

      const payload = (await response.json()) as TriageEvaluationResponse;
      setResult(payload);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setError(`Unable to evaluate triage: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setAnswers(defaultAnswers);
    setTimeline(defaultTimeline);
    setResult(null);
    setError(null);
    setCopyStatus(null);
    setSaveStatus(null);
    setSavedIncidentId(null);
  };

  const currentResult = result?.result;

  const selectedStrokeSigns = useMemo(() => {
    const labels: string[] = [];
    if (answers.strokeSigns.faceDrooping) {
      labels.push("Face drooping");
    }
    if (answers.strokeSigns.armWeakness) {
      labels.push("Arm weakness");
    }
    if (answers.strokeSigns.speechDifficulty) {
      labels.push("Speech difficulty");
    }
    return labels;
  }, [answers.strokeSigns]);

  const selectedHeartSigns = useMemo(() => {
    const labels: string[] = [];
    if (answers.heartRelatedSigns.chestDiscomfort) {
      labels.push("Chest discomfort or pressure");
    }
    if (answers.heartRelatedSigns.shortnessOfBreath) {
      labels.push("Shortness of breath");
    }
    if (answers.heartRelatedSigns.coldSweat) {
      labels.push("Cold sweat");
    }
    if (answers.heartRelatedSigns.nauseaOrUpperBodyDiscomfort) {
      labels.push("Nausea or upper-body discomfort");
    }
    return labels;
  }, [answers.heartRelatedSigns]);

  const completedActions = useMemo(
    () =>
      actionKeys
        .filter((key) => timeline.actionsTaken[key])
        .map((key) => actionLabelMap[key]),
    [timeline.actionsTaken],
  );

  const handoffSummary = useMemo(() => {
    if (!currentResult || !result) {
      return null;
    }

    const lines = [
      "RescueSight Emergency Handoff Summary",
      `Generated: ${new Date(result.evaluatedAtIso).toLocaleString()}`,
      `Pathway: ${currentResult.label}`,
      `Urgency: ${currentResult.urgency.toUpperCase()}`,
      `First observed time: ${formatDateTime(timeline.firstObservedAtLocal)}`,
      `Responsiveness: ${answers.responsive ? "Responsive" : "Not responsive"}`,
      `Breathing: ${answers.breathingNormal ? "Appears normal" : "Abnormal or absent"}`,
      `FAST signs: ${selectedStrokeSigns.length > 0 ? selectedStrokeSigns.join(", ") : "None reported"}`,
      `Heart-related signs: ${selectedHeartSigns.length > 0 ? selectedHeartSigns.join(", ") : "None reported"}`,
      `AED status: ${aedStatusLabelMap[timeline.aedStatus]}`,
      `Actions already taken: ${completedActions.length > 0 ? completedActions.join("; ") : "None recorded"}`,
      `Responder notes: ${timeline.responderNotes.trim() || "None"}`,
      "Safety note: Assistive bystander guidance only. This is not a medical diagnosis.",
    ];

    return lines.join("\n");
  }, [
    answers.breathingNormal,
    answers.responsive,
    completedActions,
    currentResult,
    result,
    selectedHeartSigns,
    selectedStrokeSigns,
    timeline.aedStatus,
    timeline.firstObservedAtLocal,
    timeline.responderNotes,
  ]);

  const copySummary = async () => {
    if (!handoffSummary) {
      return;
    }
    try {
      await navigator.clipboard.writeText(handoffSummary);
      setCopyStatus("Responder summary copied.");
    } catch {
      setCopyStatus("Clipboard was unavailable. Copy summary manually.");
    }
  };

  const saveIncident = async () => {
    if (!handoffSummary) {
      return;
    }

    setSavingIncident(true);
    setSaveStatus(null);

    try {
      if (!savedIncidentId) {
        const response = await fetch(incidentsEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers,
            timeline,
            handoffSummary,
            source: "web",
          }),
        });

        if (!response.ok) {
          throw new Error(`Incident API returned ${response.status}`);
        }

        const payload = (await response.json()) as { incident: { id: string } };
        setSavedIncidentId(payload.incident.id);
        setSaveStatus(`Incident record saved (${payload.incident.id}).`);
        return;
      }

      const response = await fetch(`${incidentsEndpoint}/${savedIncidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeline,
          handoffSummary,
          status: "open",
        }),
      });

      if (!response.ok) {
        throw new Error(`Incident API returned ${response.status}`);
      }

      setSaveStatus(`Incident record updated (${savedIncidentId}).`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unknown request error";
      setSaveStatus(`Unable to save incident record: ${message}`);
    } finally {
      setSavingIncident(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>RescueSight</h1>
        <p>
          Guided bystander support for suspected emergencies. This tool does not diagnose medical conditions and does not replace emergency professionals.
        </p>
      </header>

      <section className="panel">
        <h2>Triage Checklist</h2>

        <div className="question-block">
          <h3>Demo Scenario Presets</h3>
          <p className="helper-text">Load a preset to quickly simulate common emergency pathways.</p>
          <div className="scenario-grid">
            {scenarioPresets.map((preset) => (
              <button type="button" key={preset.id} className="preset-button" onClick={() => loadPreset(preset)}>
                <strong>{preset.title}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="question-block">
          <h3>1. Responsiveness</h3>
          <label>
            <input
              type="radio"
              name="responsive"
              checked={answers.responsive}
              onChange={() => setAnswers((current) => ({ ...current, responsive: true }))}
            />
            Person is responsive
          </label>
          <label>
            <input
              type="radio"
              name="responsive"
              checked={!answers.responsive}
              onChange={() => setAnswers((current) => ({ ...current, responsive: false }))}
            />
            Person is not responsive
          </label>
        </div>

        <div className="question-block">
          <h3>2. Breathing</h3>
          <label>
            <input
              type="radio"
              name="breathing"
              checked={answers.breathingNormal}
              onChange={() => setAnswers((current) => ({ ...current, breathingNormal: true }))}
            />
            Breathing appears normal
          </label>
          <label>
            <input
              type="radio"
              name="breathing"
              checked={!answers.breathingNormal}
              onChange={() => setAnswers((current) => ({ ...current, breathingNormal: false }))}
            />
            Breathing is abnormal or absent
          </label>
        </div>

        <div className="question-block">
          <h3>3. FAST Stroke Signs</h3>
          <label>
            <input
              type="checkbox"
              checked={answers.strokeSigns.faceDrooping}
              onChange={(event) => setStrokeSign("faceDrooping", event.target.checked)}
            />
            Face drooping
          </label>
          <label>
            <input
              type="checkbox"
              checked={answers.strokeSigns.armWeakness}
              onChange={(event) => setStrokeSign("armWeakness", event.target.checked)}
            />
            Arm weakness
          </label>
          <label>
            <input
              type="checkbox"
              checked={answers.strokeSigns.speechDifficulty}
              onChange={(event) => setStrokeSign("speechDifficulty", event.target.checked)}
            />
            Speech difficulty
          </label>
        </div>

        <div className="question-block">
          <h3>4. Possible Heart-Related Signs</h3>
          <label>
            <input
              type="checkbox"
              checked={answers.heartRelatedSigns.chestDiscomfort}
              onChange={(event) => setHeartSign("chestDiscomfort", event.target.checked)}
            />
            Chest discomfort or pressure
          </label>
          <label>
            <input
              type="checkbox"
              checked={answers.heartRelatedSigns.shortnessOfBreath}
              onChange={(event) => setHeartSign("shortnessOfBreath", event.target.checked)}
            />
            Shortness of breath
          </label>
          <label>
            <input
              type="checkbox"
              checked={answers.heartRelatedSigns.coldSweat}
              onChange={(event) => setHeartSign("coldSweat", event.target.checked)}
            />
            Cold sweat
          </label>
          <label>
            <input
              type="checkbox"
              checked={answers.heartRelatedSigns.nauseaOrUpperBodyDiscomfort}
              onChange={(event) => setHeartSign("nauseaOrUpperBodyDiscomfort", event.target.checked)}
            />
            Nausea or upper-body discomfort
          </label>
        </div>

        <div className="question-block">
          <h3>Incident Timeline</h3>
          <label>
            First observed time
            <input
              type="datetime-local"
              value={timeline.firstObservedAtLocal}
              onChange={(event) =>
                setTimeline((current) => ({
                  ...current,
                  firstObservedAtLocal: event.target.value,
                }))
              }
            />
          </label>

          <label>
            AED status
            <select
              value={timeline.aedStatus}
              onChange={(event) =>
                setTimeline((current) => ({
                  ...current,
                  aedStatus: event.target.value as AedStatus,
                }))
              }
            >
              <option value="unknown">Unknown</option>
              <option value="not_available">Not available nearby</option>
              <option value="retrieval_in_progress">Retrieval in progress</option>
              <option value="on_scene">AED on scene</option>
            </select>
          </label>

          <div className="timeline-actions">
            {actionKeys.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={timeline.actionsTaken[key]}
                  onChange={(event) => setTimelineAction(key, event.target.checked)}
                />
                {actionLabelMap[key]}
              </label>
            ))}
          </div>

          <label>
            Notes for responders
            <textarea
              value={timeline.responderNotes}
              placeholder="Add context responders should know."
              onChange={(event) =>
                setTimeline((current) => ({
                  ...current,
                  responderNotes: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="actions-row">
          <button type="button" className="action-button" disabled={loading} onClick={evaluate}>
            {loading ? "Evaluating..." : "Evaluate Emergency Pathway"}
          </button>
          <button type="button" className="action-button secondary" onClick={reset}>
            Reset
          </button>
        </div>

        {error ? <p className="error-message">{error}</p> : null}
      </section>

      {currentResult ? (
        <section className="panel result-panel">
          <h2>{currentResult.label}</h2>
          <p className={`urgency ${currentResult.urgency}`}>Urgency: {currentResult.urgency.toUpperCase()}</p>
          <p>{currentResult.summary}</p>

          <h3>Immediate Actions</h3>
          <ol>
            {currentResult.immediateActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>

          <h3>Follow-up Actions</h3>
          <ol>
            {currentResult.followUpActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>

          <p className="safety-notice">{currentResult.safetyNotice}</p>

          {currentResult.cprGuidance ? (
            <>
              <h3>CPR Instructions</h3>
              <ol>
                {currentResult.cprGuidance.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>
              <CprMetronome
                minBpm={currentResult.cprGuidance.targetBpmRange[0]}
                maxBpm={currentResult.cprGuidance.targetBpmRange[1]}
              />
            </>
          ) : null}

          {handoffSummary ? (
            <section className="handoff-summary">
              <h3>Responder Handoff Summary</h3>
              <p className="helper-text">
                Share this with arriving responders to preserve timeline and observed context.
              </p>
              <textarea readOnly value={handoffSummary} />
              <div className="actions-row">
                <button type="button" className="action-button" onClick={copySummary}>
                  Copy Summary
                </button>
                <button type="button" className="action-button secondary" disabled={savingIncident} onClick={saveIncident}>
                  {savingIncident
                    ? "Saving..."
                    : savedIncidentId
                      ? "Update Incident Record"
                      : "Save Incident Record"}
                </button>
              </div>
              {savedIncidentId ? <p className="helper-text">Incident ID: {savedIncidentId}</p> : null}
              {copyStatus ? <p className="status-message">{copyStatus}</p> : null}
              {saveStatus ? <p className="status-message">{saveStatus}</p> : null}
            </section>
          ) : null}
        </section>
      ) : null}
    </main>
  );
};
