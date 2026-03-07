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
- Display routed emergency pathway and action steps
- Provide CPR metronome helper for possible cardiac arrest cases

Current integration:
- `POST /api/triage/evaluate`

## 2) `apps/api`

Responsibilities:
- Validate triage payloads
- Execute deterministic triage routing logic
- Return pathway result with urgency and action steps

Current endpoints:
- `GET /health`
- `GET /api/triage/questions`
- `POST /api/triage/evaluate`

## 3) `packages/shared`

Responsibilities:
- Shared interfaces for triage inputs and outputs
- Canonical pathway identifiers

## Data Flow

1. User completes triage questions in web UI.
2. Web app sends typed `TriageAnswers` payload to API.
3. API validates payload and runs decision rules.
4. API returns `TriageEvaluationResponse` with pathway + action steps.
5. Web app renders result and optional CPR metronome helper.

## Triage Rules (Current)

- If unresponsive + not breathing normally -> `possible_cardiac_arrest`
- Else if any FAST stroke sign -> `suspected_stroke`
- Else if heart-related signs meet threshold -> `possible_heart_related_emergency`
- Else -> `unclear_emergency`

## Planned Extensions

- CV service: person-down and hand-placement hints (user-confirmed)
- XR overlay adapter: place instructions in headset view
- RAG assistant: constrained retrieval of emergency instruction content
- MCP tool layer: orchestrate demo tools and protocol retrieval

## Safety Guardrails

- Keep language assistive and non-diagnostic
- Require human confirmation for critical transitions
- Do not claim clinical-grade validation for measurements
