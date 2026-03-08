# RescueSight Architecture

## Goals

- Keep emergency workflow logic deterministic and auditable.
- Keep one primary human operator surface to reduce workflow ambiguity.
- Separate CV sensing, API state, and UI actions with clear ownership.
- Preserve extension points for XR overlays and RAG support.

## System Boundaries

## 1) `apps/web` (Primary Operator UI)

Responsibilities:
- Display live CV summary and victim snapshot from API.
- Collect human-in-the-loop questionnaire responses.
- Generate SOAP-style handoff draft.
- Submit dispatch escalation requests.
- Display and operate the pseudo-hospital dispatch dashboard.
- Host the ElevenLabs voice assistant widget and push live CV context.

Primary integrations:
- `GET /api/cv/live-summary`
- `POST /api/dispatch/requests`
- `GET /api/dispatch/requests`
- `PATCH /api/dispatch/requests/:requestId`
- incident/triage/XR endpoints as needed by scenario

## 2) `apps/api` (Workflow + State Authority)

Responsibilities:
- Validate request payloads.
- Run deterministic triage routing.
- Ingest live CV signals and maintain latest live summary state.
- Persist dispatch queue and incident timeline state in memory.
- Expose XR hook endpoints and CV checkpoint gating.

Key endpoint groups:
- Health: `GET /health`
- Triage: `GET /api/triage/questions`, `POST /api/triage/evaluate`
- Live CV: `POST /api/cv/live-signal`, `GET /api/cv/live-summary`
- Dispatch: `POST /api/dispatch/requests`, `GET /api/dispatch/requests`, `GET /api/dispatch/requests/:requestId`, `PATCH /api/dispatch/requests/:requestId`
- Incident/XR: existing incident + XR routes

## 3) `cv_model/prototype` (CV Worker + CV Hook Service)

Responsibilities:
- Capture camera frames and run MediaPipe-based CV inference.
- Produce hand placement, compression rhythm, posture, and eyes-closed signals.
- Attach victim snapshots when person-down evidence is present.
- Stream live signals to API.

Mode guidance:
- Recommended demo mode: worker behavior feeding API for web operator flow.
- Debug behavior: optional on-screen overlays and local controls for CV tuning.

Additional component:
- `cv_service.py` provides CV assist endpoint for XR hook integration (`/api/cv/evaluate`, `/api/cv/frame`).

## 4) `packages/shared` (Contracts)

Responsibilities:
- Shared types for triage, XR hooks, CV live summary, and dispatch.
- Canonical payload contracts used by web, api, and other clients.

## Primary Demo Data Flow (Consolidated)

1. CV worker (`run_webcam.py`) captures camera frames and infers CV metrics.
2. CV worker posts `signal` (+ optional `victimSnapshot` and `location`) to `POST /api/cv/live-signal`.
3. API updates latest live summary state.
4. Web polls `GET /api/cv/live-summary` and renders operator guidance.
5. Operator answers questionnaire in web UI and submits escalation.
6. Web posts dispatch payload to `POST /api/dispatch/requests`.
7. API stores dispatch request and returns queue item id.
8. Web dashboard lists queue state and supports dispatch/resolve updates.

## Optional Flows

- XR clients can use `POST /api/xr/triage` and associated overlay endpoints with CV checkpoint gating.

## Ownership Rules

- Human decision/action ownership: web UI.
- CV sensing ownership: CV worker.
- State ownership: API.
- Safety-language ownership: all surfaces, enforced by product copy and validation conventions.

## Safety Guardrails

- Keep language assistive and non-diagnostic.
- Require human confirmation for critical transitions.
- Do not claim clinical-grade measurement or autonomous medical intervention.
