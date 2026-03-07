import { useMemo, useState } from "react";
import type {
  HeartRelatedSigns,
  StrokeSigns,
  TriageAnswers,
  TriageEvaluationResponse,
} from "@rescuesight/shared";
import { CprMetronome } from "./CprMetronome";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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

export const App = () => {
  const [answers, setAnswers] = useState<TriageAnswers>(defaultAnswers);
  const [result, setResult] = useState<TriageEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoint = useMemo(
    () => `${API_BASE_URL}/api/triage/evaluate`.replace(/\/\//g, "/").replace("http:/", "http://").replace("https:/", "https://"),
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

  const evaluate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
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
    setResult(null);
    setError(null);
  };

  const currentResult = result?.result;

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
        </section>
      ) : null}
    </main>
  );
};
