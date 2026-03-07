# RescueSight Implementation README

Last updated: 2026-03-07

## Objective
Build a demoable RescueSight prototype that provides bystander-focused emergency guidance (not diagnosis), with a modular stack that supports:

- Guided triage checklist
- CPR assistance workflow
- Stroke screening prompts
- Escalation prompts (call EMS, retrieve AED)
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
- [ ] Add scenario simulator mode for demos
- [ ] Add event timeline capture (onset time, actions taken)
- [ ] Add AED retrieval prompt flow
- [ ] Add emergency handoff summary card for responders

### Phase 3: AI/RAG + Tooling
- [ ] Add constrained emergency knowledge base retrieval
- [ ] Add prompt safety filters to avoid diagnostic claims
- [ ] Add MCP-compatible tool layer for internal orchestration

### Phase 4: XR/CV integration track
- [ ] Define XR overlay contract (anchor, instruction, confidence, user-confirmed)
- [ ] Stub CV detection service for person-down and hand-placement hints
- [ ] Add explicit confirmation checkpoints before advancing critical steps

## Deliverables for This Work Session

1. Scaffold monorepo and initial configs.
2. Implement API triage workflow endpoints.
3. Implement web app triage flow UI with safe language.
4. Document architecture and progress in this file.

## Risks / Open Questions

- Clinical accuracy is not validated; all outputs must remain advisory.
- Exact XR device selection is pending and will affect overlay implementation details.
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
- Attempted dependency installation (`npm install`) for validation, but command hung in current restricted environment; runtime verification remains pending after install succeeds.

## Next Planned Steps (Immediate)

1. Add unit tests for triage routing logic in `apps/api`.
2. Add frontend scenario presets for demo speed (collapse, suspected stroke, unclear).
3. Add incident timeline capture (symptom onset + actions taken).
4. Add handoff summary output to share with responders.
5. Start Phase 3 RAG scaffolding with strict safety filters.
