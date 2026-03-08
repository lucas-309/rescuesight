# RescueSight

RescueSight is an assistive emergency guidance prototype for public settings.

Current demo focus: detect a **possible person-down event**, run a short **human-in-the-loop questionnaire**, then send a **backend escalation request** to a pseudo-hospital dashboard where dispatchers can assign EMT units.

This project is intentionally positioned as decision support, not diagnosis.

## Primary Operator Flow (Single Surface)

- Web app is the primary operator interface for decision steps:
  - live CV summary and victim snapshot
  - questionnaire input
  - dispatch queue actions
- Python CV worker acts as the sensor process and hosts the webcam voice agent.
- API is the single source of truth for live summary and dispatch state.
- Recommended webcam command for this flow uses `--disable-hitl` so questionnaire ownership stays in web.

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

5. Run webcam CV and upload snapshots to API (for frontend summary):

```bash
cd cv_model/prototype
./bootstrap.sh --webcam-only -- \
  --disable-hitl \
  --post-url http://127.0.0.1:8080/api/cv/live-signal \
  --source-device-id "RescueSight main" \
  --location-label "Main lobby" \
  --location-lat 37.8715 \
  --location-lon -122.2730
```

In the webcam window, press `p` to capture a still image and upload it.

Optional: enable CV-assisted XR checkpoint gating by running the Python CV service and setting:

```bash
export RESCUESIGHT_CV_SERVICE_URL="http://127.0.0.1:8091"
```

Then start API with `npm run dev:api` and submit `cvSignal` with XR triage payloads.

## Web Voice Widget (ElevenLabs)

The web dashboard includes an embedded ElevenLabs ConvAI widget panel.

- Default agent id is `agent_0701kk51qtqvfm1v00ah9c5hvfcx`.
- Override with:

```bash
VITE_ELEVENLABS_AGENT_ID="<your_agent_id>" npm run dev:web
```

- Disable widget if needed:

```bash
VITE_ENABLE_ELEVENLABS_WIDGET="false" npm run dev:web
```

## Webcam Voice Agent (Optional)

The primary voice path is the web dashboard ElevenLabs widget.

- Webcam-native voice is now **disabled by default**.
- If you explicitly want webcam-native voice for experiments, pass `--enable-voice-agent`.
- Use `GEMINI_API_KEY` (or `OPENAI_API_KEY` for OpenAI mode) only when enabling webcam voice.

## Implemented Demo Features

- CV person-down intake endpoint (`POST /api/cv/person-down`) with confidence-based questionnaire gating
- CV snapshot summary pipeline (`run_webcam.py press p -> POST /api/cv/live-signal -> GET /api/cv/live-summary`) used by frontend
- Web-owned human-in-the-loop questionnaire for pulse/breathing/responsiveness and scene notes
- Auto-generated SOAP-style EMT handoff draft in web UI, merged into dispatch questionnaire notes
- Backend emergency escalation flow (`POST /api/dispatch/requests`) that simulates 911-style escalation without calling 911
- Pseudo-hospital dispatch dashboard queue:
  - list/filter requests by status
  - assign EMT unit and ETA
  - resolve requests after handoff
- Location capture for escalation payloads (label + lat/long + indoor descriptor)
- Existing triage, incident timeline, XR overlay, and CV checkpoint APIs remain available for integration

CV worker highlights:
- person-down confidence rescaled so likely person-down states are easier to trigger
- posture/eyes confidence smoothing plus trigger hysteresis to reduce false flicker
- victim snapshot now flows through live CV summary and dispatch queue so dashboard cards show scene imagery
- webcam-local questionnaire controls are available for legacy/debug runs, but are not the primary operator path
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
