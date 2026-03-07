# RescueSight Architecture (Initial)

## Goals

- Keep emergency workflow logic deterministic and auditable
- Separate UI, triage rules, and reusable domain types
- Preserve clear extension points for CV, XR overlays, and RAG support

## Modules

## 1) `apps/web`

Responsibilities:
- Render bystander-facing triage checklist
- Collect structured answers
- Support demo scenario preset loading
- Capture incident timeline details for handoff
- Display routed emergency pathway and action steps
- Provide CPR metronome helper for possible cardiac arrest cases
- Generate responder handoff summary text for export
- Persist/update incident records and handoff payloads through API

Current integration:
- `POST /api/triage/evaluate`
- `POST /api/incidents`
- `PATCH /api/incidents/:incidentId`

## 2) `apps/api`

Responsibilities:
- Validate triage payloads
- Execute deterministic triage routing logic
- Return pathway result with urgency and action steps
- Map triage output to XR overlay steps for Unity/Quest clients
- Fuse optional CV hint output and enforce confirmation gates before critical XR transitions
- Persist incident timeline/handoff records in in-memory store
- Expose incident retrieval and handoff payload endpoints

Current endpoints:
- `GET /health`
- `GET /api/triage/questions`
- `POST /api/triage/evaluate`
- `POST /api/xr/triage`
- `GET /api/xr/incidents/:incidentId/overlay`
- `PATCH /api/xr/incidents/:incidentId/actions`
- `POST /api/incidents`
- `GET /api/incidents`
- `GET /api/incidents/:incidentId`
- `PATCH /api/incidents/:incidentId`
- `GET /api/incidents/:incidentId/handoff`

## 3) `packages/shared`

Responsibilities:
- Shared interfaces for triage inputs and outputs
- Canonical pathway identifiers
- Shared incident timeline and persistence payload types

## Data Flow

1. User completes triage questions in web UI.
2. User optionally records timeline fields (first observed time, AED status, actions taken, notes).
3. Web app sends typed `TriageAnswers` payload to API.
4. API validates payload and runs decision rules.
5. API returns `TriageEvaluationResponse` with pathway + action steps.
6. Web app renders result, optional CPR metronome helper, and responder handoff summary.
7. Web app persists incident timeline/handoff data via incident endpoints.
8. API stores incident record and supports later retrieval/update.

## XR Hook Flow (Quest 3 / Unity)

1. Unity app collects confirmed triage answers.
2. Unity posts to `POST /api/xr/triage` with optional `incidentId`.
3. API creates or re-evaluates the incident and returns overlay-ready steps.
4. Optional CV signal is sent to API (`cvSignal`) and evaluated through CV stub service.
5. API returns `cvAssist` + `transitionGate`; critical progression is blocked until required checkpoints are acknowledged.
6. Unity renders `overlaySteps` as head/world-locked instruction cards (including checkpoint prompts).
7. Unity syncs action confirmations using `PATCH /api/xr/incidents/:incidentId/actions`.
8. Unity can recover state after reconnect through `GET /api/xr/incidents/:incidentId/overlay`.

## Triage Rules (Current)

- If unresponsive + not breathing normally -> `possible_cardiac_arrest`
- Else if any FAST stroke sign -> `suspected_stroke`
- Else if heart-related signs meet threshold -> `possible_heart_related_emergency`
- Else -> `unclear_emergency`

## Planned Extensions

- CV service: Python stub implemented in `cv_model/prototype/cv_service.py` for person-down and hand-placement hints (user-confirmed) and consumed by API via `RESCUESIGHT_CV_SERVICE_URL`
- XR overlay adapter: initial API hooks implemented, Unity rendering integration ongoing
- RAG assistant: constrained retrieval of emergency instruction content
- MCP tool layer: orchestrate demo tools and protocol retrieval

## Safety Guardrails

- Keep language assistive and non-diagnostic
- Require human confirmation for critical transitions
- Do not claim clinical-grade validation for measurements
