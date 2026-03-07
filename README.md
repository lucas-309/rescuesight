# RescueSight

RescueSight is an assistive emergency guidance prototype for public settings. It helps bystanders respond to suspected emergencies through structured triage prompts, CPR assistance, and escalation guidance.

This project is intentionally positioned as decision support, not diagnosis.

## Current Stack

- `apps/web`: React + Vite + TypeScript triage UI
- `apps/api`: Express + TypeScript triage decision engine API
- `packages/shared`: shared domain types
- `docs/unity`: Quest 3 Unity hook scripts and integration notes
- `cv_model/prototype`: Python CV prototype and CV hook stub service

## Repository Layout

- `INSTRUCTIONS.md`: product intent, safety constraints, and scope
- `IMPLEMENTATION_README.md`: implementation plan + ongoing work log
- `docs/ARCHITECTURE.md`: technical architecture and module boundaries
- `docs/unity/QUEST3_UNITY_INTEGRATION.md`: Quest 3 + Unity hook setup
- `cv_model/prototype/cv_service.py`: Python CV hint service (`/api/cv/evaluate`)
- `apps/web`: frontend app
- `apps/api`: backend app
- `packages/shared`: shared interfaces and enums

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Run the API (port 8080):

```bash
npm run dev:api
```

3. Run the web app (port 5173):

```bash
npm run dev:web
```

4. Open `http://localhost:5173`.

Optional: enable CV-assisted XR checkpoint gating by running the Python CV service and setting:

```bash
export RESCUESIGHT_CV_SERVICE_URL="http://127.0.0.1:8091"
```

Then start API with `npm run dev:api` and submit `cvSignal` with XR triage payloads.

## Implemented Demo Features

- Guided triage checklist for:
  - responsiveness
  - breathing
  - FAST stroke signs
  - heart-related warning signs
- Demo scenario presets:
  - collapse / unresponsive
  - suspected stroke
  - heart-related signs
  - unclear emergency
- Deterministic pathway output:
  - possible cardiac arrest
  - suspected stroke
  - possible heart-related emergency
  - unclear emergency
- Immediate and follow-up actions with safety language
- CPR rhythm helper (100-120 BPM) for possible cardiac arrest pathway
- Incident timeline capture:
  - first observed time
  - AED status/retrieval state
  - actions already taken
  - responder notes
- Responder handoff summary card with copy-to-clipboard export
- Incident persistence workflow:
  - save incident record from web UI
  - update saved record with revised timeline/handoff
  - incident id display for retrieval/debugging

## API Endpoints

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

External CV stub service (Python):
- `GET /health`
- `POST /api/cv/evaluate`

## Testing

- Run full API tests:

```bash
npm run test:api
```

## Safety Positioning

All output should use phrasing like "possible" and "suspected". The system does not claim diagnosis, autonomous intervention, or replacement of professional medical care.
