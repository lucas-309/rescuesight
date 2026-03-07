import cors from "cors";
import express, { type Request, type Response } from "express";
import type { TriageAnswers, TriageEvaluationResponse } from "@rescuesight/shared";
import { evaluateTriage } from "./triageEngine.js";

const app = express();
const port = Number(process.env.PORT ?? 8080);

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "rescuesight-api" });
});

app.get("/api/triage/questions", (_req: Request, res: Response) => {
  res.json({
    questions: [
      { id: "responsive", prompt: "Is the person responsive?" },
      { id: "breathingNormal", prompt: "Is the person breathing normally?" },
      {
        id: "strokeSigns",
        prompt: "Do you observe any FAST signs (face drooping, arm weakness, speech difficulty)?",
      },
      {
        id: "heartRelatedSigns",
        prompt: "Are there signs of a possible heart-related emergency?",
      },
    ],
  });
});

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const isValidAnswers = (value: unknown): value is TriageAnswers => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<TriageAnswers>;
  const strokeSigns = candidate.strokeSigns;
  const heartSigns = candidate.heartRelatedSigns;

  return (
    isBoolean(candidate.responsive) &&
    isBoolean(candidate.breathingNormal) &&
    typeof strokeSigns === "object" &&
    strokeSigns !== null &&
    isBoolean(strokeSigns.faceDrooping) &&
    isBoolean(strokeSigns.armWeakness) &&
    isBoolean(strokeSigns.speechDifficulty) &&
    typeof heartSigns === "object" &&
    heartSigns !== null &&
    isBoolean(heartSigns.chestDiscomfort) &&
    isBoolean(heartSigns.shortnessOfBreath) &&
    isBoolean(heartSigns.coldSweat) &&
    isBoolean(heartSigns.nauseaOrUpperBodyDiscomfort)
  );
};

app.post("/api/triage/evaluate", (req: Request, res: Response) => {
  if (!isValidAnswers(req.body)) {
    res.status(400).json({
      error: "Invalid triage payload.",
      expected: {
        responsive: "boolean",
        breathingNormal: "boolean",
        strokeSigns: {
          faceDrooping: "boolean",
          armWeakness: "boolean",
          speechDifficulty: "boolean",
        },
        heartRelatedSigns: {
          chestDiscomfort: "boolean",
          shortnessOfBreath: "boolean",
          coldSweat: "boolean",
          nauseaOrUpperBodyDiscomfort: "boolean",
        },
      },
    });
    return;
  }

  const payload: TriageEvaluationResponse = {
    result: evaluateTriage(req.body),
    evaluatedAtIso: new Date().toISOString(),
  };

  res.json(payload);
});

app.listen(port, () => {
  console.log(`RescueSight API listening on http://localhost:${port}`);
});
