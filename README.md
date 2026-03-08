# RescueSight

RescueSight is an assistive emergency guidance prototype for public settings.

Current demo focus: detect a **possible person-down event**, run a short **human-in-the-loop questionnaire**, then send a **backend escalation request** to a pseudo-hospital dashboard where dispatchers can assign EMT units.

This project is intentionally positioned as decision support, not diagnosis.

## Primary Operator Flow (Single Surface)

- Web app is the primary operator interface for decision steps:
  - live CV summary and victim snapshot
  - questionnaire input
  - voice assistant interaction
  - dispatch queue actions
- Python CV worker acts as the sensor process that streams data to API.
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

5. Stream live CV stats to API (for frontend live summary):

```bash
cd cv_model/prototype
./bootstrap.sh --webcam-only -- \
  --disable-hitl \
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

## ElevenLabs Voice Assistant

The web app includes an ElevenLabs ConvAI voice widget (bottom-right) that receives live CV signals and gives real-time CPR guidance. **Simple flow: tap "Voice CPR guide" → tap "Start" → the AI speaks first. No need to say hello.**

**Agent configuration (ElevenLabs dashboard):**

1. In the [ElevenLabs ConvAI dashboard](https://elevenlabs.io/app/conversational-ai), edit agent `agent_0701kk51qtqvfm1v00ah9c5hvfcx`.
2. **First message / greeting**: Set the agent to speak first when the conversation starts. Example: *"I'm your CPR guide. I can see your live camera feed. I'll give you step-by-step instructions. Let's start—place your hands in the center of the chest, between the nipples."* This ensures the user gets immediate guidance without having to say anything.
3. **System prompt**: Add `{{cv_context}}` if your plan supports dynamic variables. The app passes person-down status, hand placement, compression BPM, rhythm quality, visibility, and location so the agent can give targeted instructions (e.g. "move your hands to the center", "compress faster, aim for 100–120 BPM").
4. **Public access**: Ensure the agent is public with authentication disabled (Advanced tab).
5. **Allowed domains**: Add `localhost:5173`, `127.0.0.1:5173`, and your network IP (e.g. `10.111.5.4:5173`) in the Security tab.

## Implemented Demo Features

- CV person-down intake endpoint (`POST /api/cv/person-down`) with confidence-based questionnaire gating
- Live CV summary pipeline (`run_webcam.py -> POST /api/cv/live-signal -> GET /api/cv/live-summary`) used by frontend
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
