# RescueSight

RescueSight is an assistive emergency guidance prototype for public settings.

Current demo focus: detect a **possible person-down event**, run a short **human-in-the-loop questionnaire**, then send a **backend escalation request** to a pseudo-hospital dashboard where dispatchers can assign EMT units.

This project is intentionally positioned as decision support, not diagnosis.

## Current Stack

- `apps/web`: React + Vite + TypeScript bystander + dispatch dashboard UI
- `apps/api`: Express + TypeScript workflow API (triage, XR hooks, CV intake, dispatch queue)
- `packages/shared`: shared domain types
- `docs/unity`: Quest 3 Unity hook scripts and integration notes
- `cv_model/prototype`: Python CV prototype and CV hook stub service

## Repository Layout

- `INSTRUCTIONS.md`: product intent, safety constraints, and current execution plan
- `IMPLEMENTATION_README.md`: implementation roadmap + work log
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

5. Stream live CV stats to API (for frontend live summary):

```bash
cd cv_model/prototype
./bootstrap.sh --webcam-only -- \
  --post-url http://127.0.0.1:8080/api/cv/live-signal \
  --source-device-id quest3-kiosk-01 \
  --location-label "Main lobby" \
  --location-lat 37.8715 \
  --location-lon -122.2730
```

Optional: enable CV-assisted XR checkpoint gating by running the Python CV service and setting:

```bash
export RESCUESIGHT_CV_SERVICE_URL="http://127.0.0.1:8091"
```

Then start API with `npm run dev:api` and submit `cvSignal` with XR triage payloads.

## Implemented Demo Features

- CV person-down intake endpoint (`POST /api/cv/person-down`) with confidence-based questionnaire gating
- Live CV summary pipeline (`run_webcam.py -> POST /api/cv/live-signal -> GET /api/cv/live-summary`) used by frontend
- Human-in-the-loop questionnaire capture for pulse/breathing/responsiveness and scene notes
- Backend emergency escalation flow (`POST /api/dispatch/requests`) that simulates 911-style escalation without calling 911
- Pseudo-hospital dispatch dashboard queue:
  - list/filter requests by status
  - assign EMT unit and ETA
  - resolve requests after handoff
- Location capture for escalation payloads (label + lat/long + indoor descriptor)
- Existing triage, incident timeline, XR overlay, and CV checkpoint APIs remain available for integration

## API Endpoints

Core triage/XR APIs:

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

Person-down + dispatch workflow APIs:

- `POST /api/cv/person-down`
- `GET /api/cv/person-down-events`
- `POST /api/cv/live-signal`
- `GET /api/cv/live-summary`
- `POST /api/dispatch/requests`
- `GET /api/dispatch/requests`
- `GET /api/dispatch/requests/:requestId`
- `PATCH /api/dispatch/requests/:requestId`

External CV stub service (Python):

- `GET /health`
- `POST /api/cv/evaluate`

## Testing

- Run API tests:

```bash
npm run test:api
```

- Run typechecks:

```bash
npm run typecheck
```

- Build all workspaces:

```bash
npm run build
```

## Safety Positioning

All output should use phrasing like "possible" and "suspected". The system does not claim diagnosis, autonomous intervention, or replacement of professional medical care.
