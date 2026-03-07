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
  - CV person-down intake form with confidence and location capture
  - human questionnaire form for pulse/breathing/responsiveness and scene notes
  - backend escalation submit action (simulated 911 handoff to backend queue)
  - pseudo-hospital dashboard with status filtering, EMT assignment, and resolve actions
- Expanded tests:
  - new dispatch store unit tests
  - validation tests for person-down and dispatch payloads
  - API integration tests covering person-down intake and dispatch lifecycle
- Updated `README.md` and `INSTRUCTIONS.md` to reflect the new plan and constraints.

## Next Planned Steps (Immediate)

1. Move Unity hook scripts from `docs/unity` into a dedicated Unity project (`apps/unity`) and wire scene UI components.
2. Add simple auth/token guard for XR endpoints before multi-device demos.
3. Add optional durable persistence adapter (file/db) behind the incident store interface.
4. Start Phase 3 RAG scaffolding with strict safety filters.
