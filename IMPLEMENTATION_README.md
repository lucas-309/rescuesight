# RescueSight Implementation README

Last updated: 2026-03-07

## Objective
Build a demoable RescueSight prototype that provides bystander-focused emergency guidance (not diagnosis), with a modular stack that supports:

- Guided triage checklist
- CPR assistance workflow
- Stroke screening prompts
- Escalation prompts (call EMS, retrieve AED)
- CV person-down intake with confidence gating
- Human-in-the-loop questionnaire before escalation
- Backend dispatch queue and pseudo-hospital EMT assignment dashboard
- Future integration points for XR overlays, CV, and RAG assistance

## Product And Safety Constraints (from `INSTRUCTIONS.md`)

- The product must be positioned as assistive decision support, not a medical diagnosis system.
- Use language like "possible cardiac arrest" and "suspected stroke".
- Keep workflows simple and stress-tolerant for bystanders.
- Prefer explicit user confirmation over fully autonomous CV decisions.
- Do not claim clinical-grade force/depth measurement or autonomous emergency intervention.

## Chosen Initial Stack

### Monorepo layout
- `apps/web`: React + Vite + TypeScript frontend for triage/checklist demo UI
- `apps/api`: Node.js + Express + TypeScript API for workflow engine and protocol content
- `packages/shared`: shared types/constants used by web + api
- `docs`: architecture and domain docs

### Why this stack
- Fast demo iteration
- Clear separation of UX and decision-support logic
- Easy future extension with CV/XR and RAG services
- Shared type safety across frontend/backend

## Comprehensive Plan

### Phase 0: Foundation
- [x] Create repository structure and workspace config
- [x] Add baseline README with setup/run instructions
- [x] Add technical architecture doc
- [x] Add shared safety/content language guardrails

### Phase 1: First vertical slice (current target)
- [x] Implement triage API with deterministic decision tree:
  - responsiveness
  - normal breathing
  - stroke signs (FAST)
  - heart-related warning signs
- [x] Implement frontend guided questionnaire consuming triage API
- [x] Add result pathways:
  - possible cardiac arrest pathway
  - suspected stroke pathway
  - possible heart-related emergency pathway
  - unclear emergency pathway with escalation
- [x] Add CPR rhythm helper (100-120 BPM metronome cues in UI)

### Phase 2: Demo depth
- [x] Add scenario simulator mode for demos
- [x] Add event timeline capture (onset time, actions taken)
- [x] Add AED retrieval prompt flow
- [x] Add emergency handoff summary card for responders
- [x] Add person-down to questionnaire to dispatch queue vertical slice

### Phase 3: AI/RAG + Tooling
- [ ] Add constrained emergency knowledge base retrieval
- [ ] Add prompt safety filters to avoid diagnostic claims
- [ ] Add MCP-compatible tool layer for internal orchestration

### Phase 4: XR/CV integration track
- [x] Define initial XR overlay contract (anchor, instruction, priority, user-confirmed)
- [x] Add XR hook endpoints for Unity/Quest clients
- [x] Stub CV detection service for person-down and hand-placement hints
- [x] Add explicit confirmation checkpoints in CV hook responses before critical guidance transitions

## Deliverables for This Work Session

1. Scaffold monorepo and initial configs.
2. Implement API triage workflow endpoints.
3. Implement web app triage flow UI with safe language.
4. Document architecture and progress in this file.

## Risks / Open Questions

- Clinical accuracy is not validated; all outputs must remain advisory.
- Meta Quest 3 has been selected; remaining unknowns are final Unity scene UX and deployment networking.
- Automatic 911 calling remains exploratory and out of production scope.

## Work Log

### 2026-03-07
- Read `INSTRUCTIONS.md` completely and extracted product constraints.
- Defined initial stack and phased implementation plan.
- Created monorepo structure for `apps/api`, `apps/web`, and `packages/shared`.
- Added workspace config (`package.json`, `tsconfig.base.json`) and repo `.gitignore`.
- Implemented shared triage types in `packages/shared`.
- Implemented API endpoints:
  - `GET /health`
  - `GET /api/triage/questions`
  - `POST /api/triage/evaluate`
- Implemented deterministic triage routing engine with safe non-diagnostic phrasing.
- Implemented frontend triage checklist UI with:
  - structured emergency questionnaire
  - API-driven pathway rendering
  - CPR metronome helper for possible cardiac arrest branch
- Added baseline project docs:
  - root `README.md`
  - `docs/ARCHITECTURE.md`
- Completed Phase 0 and initial Phase 1 vertical slice.
- Dependency installation now completed successfully (`npm install`) after elevated approval for network-restricted environment.
- Implemented Phase 2 demo-depth features in web UI:
  - scenario presets for rapid pathway simulation
  - incident timeline capture (first observed time, actions taken, notes)
  - AED status/retrieval prompt state in timeline section
  - responder handoff summary card with copy-to-clipboard export
- Updated docs (`README.md`, `docs/ARCHITECTURE.md`) to include the new workflow capabilities.
- Added API-side incident persistence support:
  - new in-memory incident store
  - create/list/get/update incident endpoints
  - handoff retrieval endpoint
- Connected web handoff panel to persistence API:
  - save incident record
  - update existing incident record
  - show persisted incident ID in UI
- Added extensive automated tests:
  - triage routing unit tests
  - incident store unit tests
  - validation unit tests
  - API integration tests for happy-path and error-path incident lifecycle
- Validation executed successfully after implementation:
  - `npm run typecheck`
  - `npm run test:api`
  - `npm run build`
- Began Quest 3 Unity hook implementation:
  - added shared XR hook contracts in `packages/shared/src/xr.ts`
  - added API XR endpoints:
    - `POST /api/xr/triage`
    - `GET /api/xr/incidents/:incidentId/overlay`
    - `PATCH /api/xr/incidents/:incidentId/actions`
  - added API-side overlay step mapper from deterministic triage output
  - added incident store support for re-evaluating an existing XR incident
  - added validation and integration tests for XR hook flows
  - added Unity C# hook scripts:
    - `docs/unity/RescueSightApiClient.cs`
    - `docs/unity/RescueSightQuest3HooksExample.cs`
  - documented Quest 3 Unity integration in `docs/unity/QUEST3_UNITY_INTEGRATION.md`
  - implemented Python CV hook stub components:
    - `cv_model/prototype/cv_hooks.py` for deterministic CV hint mapping
    - `cv_model/prototype/cv_service.py` (`GET /health`, `POST /api/cv/evaluate`)
    - `cv_model/prototype/test_cv_hooks.py` for hook + endpoint tests
  - integrated CV stub output into API XR triage flow:
    - `cvSignal` + `acknowledgedCheckpoints` accepted on `POST /api/xr/triage`
    - `cvAssist` + `transitionGate` returned in XR responses
    - critical action updates (`cprStarted`) blocked until required checkpoints are acknowledged
  - added C# client scaffold for CV stub API:
    - `docs/unity/RescueSightCvHooksClient.cs`
- Added new person-down + dispatch domain models in `packages/shared/src/dispatch.ts`.
- Added API dispatch store and endpoints:
  - `POST /api/cv/person-down`
  - `GET /api/cv/person-down-events`
  - `POST /api/dispatch/requests`
  - `GET /api/dispatch/requests`
  - `GET /api/dispatch/requests/:requestId`
  - `PATCH /api/dispatch/requests/:requestId`
- Added deterministic dispatch priority rules based on questionnaire + person-down confidence.
- Reworked web app around the new flow:
  - live CV summary panel sourced from webcam stream stats via API (no manual CV metric form)
  - human questionnaire form for pulse/breathing/responsiveness and scene notes
  - backend escalation submit action (simulated 911 handoff to backend queue)
  - pseudo-hospital dashboard with status filtering, EMT assignment, and resolve actions
- Expanded tests:
  - new dispatch store unit tests
  - validation tests for person-down and dispatch payloads
  - API integration tests covering person-down intake and dispatch lifecycle
- Updated `README.md` and `INSTRUCTIONS.md` to reflect the new plan and constraints.
- Added live CV streaming integration:
  - API endpoints `POST /api/cv/live-signal` and `GET /api/cv/live-summary`
  - frontend polling of live CV summary for person-down stats and dispatch payload source
  - webcam runtime flags to stream CV stats directly to API:
    - `--post-url`
    - `--source-device-id`
    - optional `--location-*` metadata
- Improved person-down + questionnaire clarity and dispatch handoff UX:
  - rescaled person-down confidence scoring to avoid low-end capping around ~0.6
  - separated questionnaire state presentation in webcam/operator view
  - added explicit request-sent confirmation (including request id when returned)
  - added web-side auto-generated SOAP report preview for EMT handoff context
- Strengthened person-down reliability + dashboard imagery pipeline:
  - added temporal smoothing for eyes-closed and lying confidence signals in webcam runtime
  - replaced brittle single-frame trigger threshold with sustained evidence + hysteresis gating
  - adjusted person-down inference weights in both CV hook service and API live-signal ingestion
  - kept auto-trigger questionnaire prompt latched during short confidence drops (reduces flicker/lost snapshots)
  - attached victim snapshots to live CV summary payloads and used them in web escalation submissions
  - added dashboard/live-summary rendering support for snapshot images
  - expanded tests for smoothing, posture/eye heuristics, validation, and live-summary snapshot flow

## Next Planned Steps (Immediate)

1. Move Unity hook scripts from `docs/unity` into a dedicated Unity project (`apps/unity`) and wire scene UI components.
2. Add simple auth/token guard for XR endpoints before multi-device demos.
3. Add optional durable persistence adapter (file/db) behind the incident store interface.
4. Start Phase 3 RAG scaffolding with strict safety filters.

## Consolidation Plan (2026-03-08): Single Operator Surface

### Problem

Current demo behavior can feel redundant because both:

- webcam runtime shows an operator-facing flow, and
- web app shows an operator-facing flow.

This duplicates responsibility and increases failure modes.

### Target State

Use one coherent operator workflow:

- **Web app = operator surface**
  - live CV summary
  - victim snapshot preview
  - questionnaire
  - dispatch dashboard
- **Python webcam = CV worker**
  - camera capture + CV inference
  - webcam-native multimodal voice coaching
  - signal/snapshot streaming to API
  - optional debug overlay mode only for developers

### Execution Phases

#### Phase A: Contract lock and mode split
- [ ] Explicitly define runtime modes for webcam:
  - `headless` (default; no operator UX)
  - `debug-ui` (manual CV tuning only)
- [ ] Ensure API and shared types cover all operator-required fields from headless stream (signal + snapshot + location + source device).
- [ ] Add migration notes so old keyboard-driven webcam HITL flow is marked as deprecated/non-primary.

#### Phase B: De-duplicate questionnaire ownership
- [ ] Make web questionnaire the primary HITL path for escalation.
- [ ] Keep webcam-side questionnaire disabled by default and accessible only in legacy/debug mode.
- [ ] Confirm escalation payloads from web include live CV signal, location, and snapshot when available.

#### Phase C: Run and docs cohesion
- [ ] Provide one canonical demo command sequence:
  - start API
  - start web
  - start headless webcam worker
- [ ] Update README sections so operator instructions never ask users to choose between conflicting UIs.
- [ ] Keep CV debug instructions in a dedicated subsection to avoid confusion.

#### Phase D: Verification
- [ ] Automated:
  - API validation tests for live signal + snapshot
  - API integration tests for queue payload completeness
  - typecheck/build across workspaces
- [ ] Manual:
  - run headless webcam worker and verify web shows live summary + image
  - submit escalation in web and verify dispatch queue card includes snapshot
  - verify webcam voice agent gives proactive prompts and speech+vision responses

### Acceptance Criteria

1. A new operator can run the full demo using only the web UI for decisions/actions.
2. Webcam runtime can run without requiring keyboard interaction.
3. Dashboard always reflects backend state produced from CV worker + web HITL flow.
4. Documentation presents one primary path and labels debug paths clearly.

### Risks and Mitigations

- Risk: Losing fast local CV debugging signal visibility.
  - Mitigation: preserve explicit `debug-ui` mode.
- Risk: Regression in escalation path when moving ownership.
  - Mitigation: keep API contract tests around snapshot/location forwarding.
- Risk: Team members continue using mixed flows.
  - Mitigation: codify defaults in bootstrap scripts and docs.

### 2026-03-08 (Voice Ownership Shift)
- Added webcam-native multimodal voice module (`webcam_voice_agent.py`) with:
  - automatic startup from `run_webcam.py`
  - microphone capture + transcription requests
  - combined transcript + live frame responses via multimodal model
  - proactive scene observations when no speech is detected
  - spoken output via host TTS (`say`) with overlay status lines
- Extended webcam CLI for voice controls:
  - `--disable-voice-agent`
  - `--voice-proactive-interval-sec`
  - `--voice-mic-sample-sec`
  - `--voice-mic-rms-threshold`
  - `--voice-vision-model`
  - `--voice-transcription-model`
  - `--voice-openai-base-url`
- Removed web-side ElevenLabs widget integration from active UI path.
- Updated bootstrap test command and added helper tests in `test_webcam_voice_agent.py`.

### 2026-03-08 (Checklist + Dispatcher Ownership Update)
- Shifted responder intake ownership back to webcam checklist flow:
  - checklist items now explicitly tracked on webcam overlay:
    - snapshot
    - location
    - questionnaire
  - responder presses `h` to start questionnaire and answers via `y`/`n`
  - auto-submit occurs only when all three checklist items are complete
- Updated webcam questionnaire content to CPR dispatch context:
  - responsiveness
  - breathing
  - pulse
  - severe bleeding
  - major trauma
- Added stronger webcam-side submission safeguards:
  - manual `p` snapshot now populates checklist snapshot state
  - auto-capture snapshot at questionnaire completion when needed
  - location is now required for submit (no placeholder coordinates on dispatch submission)
  - explicit on-screen dashboard-send confirmation is retained
- Refactored API workflow to support dispatcher-owned SOAP generation:
  - questionnaire submission no longer auto-generates SOAP by default
  - added `POST /api/sessions/:sessionId/soap-report/generate`
  - compatibility `POST /api/dispatch/requests` path now creates session + questionnaire without implicit SOAP
- Expanded lifecycle statuses and sync:
  - added dispatch status `rejected`
  - added matching session status `rejected`
- Updated web dashboard for dispatcher actions:
  - removed redundant controls:
    - `Refresh Live Summary`
    - `Reset To Auto-Draft`
  - removed web-side bystander questionnaire/escalation path
  - dispatcher queue now supports:
    - generate SOAP draft
    - edit/save SOAP
    - send to hospital dispatch
    - reject request
- Updated docs to match new workflow:
  - `README.md`
  - `cv_model/prototype/README.md`
