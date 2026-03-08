# RescueSight

RescueSight is an assistive emergency guidance prototype for public settings.

Current demo focus: detect a **possible person-down event**, complete a webcam responder checklist (`snapshot + location + questionnaire`), then auto-send a backend request to a pseudo-hospital dashboard where dispatchers can generate SOAP, dispatch, or reject.

This project is intentionally positioned as decision support, not diagnosis.

## Primary Workflow

- Webcam runtime is the bystander surface for checklist completion:
  - capture victim snapshot
  - provide location metadata
  - complete questionnaire via `h` then `y`/`n`
- Once all three checklist items are complete, webcam auto-submits to dashboard.
- Web app is the dispatcher surface:
  - review incoming request (snapshot + location + questionnaire)
  - generate/edit SOAP report
  - send to hospital dispatch or reject
- API remains the source of truth for live summary and dispatch state.

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

5. Run webcam CV with checklist + auto-dashboard submission:

```bash
cd cv_model/prototype
./bootstrap.sh --webcam-only -- \
  --api-base-url http://127.0.0.1:8080 \
  --post-url http://127.0.0.1:8080/api/cv/live-signal \
  --source-device-id "RescueSight main" \
  --location-label "Main lobby" \
  --location-lat 37.8715 \
  --location-lon -122.2730
```

In the webcam window:
- press `h` to start questionnaire
- answer prompts with `y` / `n`
- press `p` for manual snapshot capture (optional, auto-capture also occurs during checklist flow)
- once snapshot + location + questionnaire are all complete, request is auto-sent to dashboard

Optional: enable CV-assisted XR checkpoint gating by running the Python CV service and setting:

```bash
export RESCUESIGHT_CV_SERVICE_URL="http://127.0.0.1:8091"
```

Then start API with `npm run dev:api` and submit `cvSignal` with XR triage payloads.

## Webcam Voice Agent (Optional)

- Webcam-native voice is now **disabled by default**.
- If you explicitly want webcam-native voice for experiments, pass `--enable-voice-agent`.
- Use `GEMINI_API_KEY` (or `OPENAI_API_KEY` for OpenAI mode) only when enabling webcam voice.

## Implemented Demo Features

- CV person-down intake endpoint (`POST /api/cv/person-down`) with confidence-based questionnaire gating
- CV snapshot summary pipeline (`run_webcam.py press p -> POST /api/cv/live-signal -> GET /api/cv/live-summary`) used by frontend
- Webcam-owned checklist flow for pulse/breathing/responsiveness and scene notes
- Auto-submit from webcam to backend queue only after snapshot + location + questionnaire are complete
- Pseudo-hospital dispatch dashboard queue:
  - list/filter requests by status
  - generate/edit SOAP report on demand
  - send to hospital dispatch
  - reject request
  - resolve requests after handoff
- Location capture for escalation payloads (label + lat/long + indoor descriptor)
- Existing triage, incident timeline, XR overlay, and CV checkpoint APIs remain available for integration

CV worker highlights:
- person-down confidence rescaled so likely person-down states are easier to trigger
- posture/eyes confidence smoothing plus trigger hysteresis to reduce false flicker
- victim snapshot now flows through live CV summary and dispatch queue so dashboard cards show scene imagery
- webcam checklist now includes explicit completion gating for snapshot, location, and questionnaire before submit
- webcam-native multimodal voice coaching is optional and disabled by default
- mobile app is currently paused from the active runtime stack

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
- `POST /api/sessions/:sessionId/soap-report/generate`
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
