# RescueSight

RescueSight is an assistive emergency guidance prototype for public settings. It helps bystanders respond to suspected emergencies through structured triage prompts, CPR assistance, and escalation guidance.

This project is intentionally positioned as decision support, not diagnosis.

## Current Stack

- `apps/web`: React + Vite + TypeScript triage UI
- `apps/api`: Express + TypeScript triage decision engine API
- `packages/shared`: shared domain types

## Repository Layout

- `INSTRUCTIONS.md`: product intent, safety constraints, and scope
- `IMPLEMENTATION_README.md`: implementation plan + ongoing work log
- `docs/ARCHITECTURE.md`: technical architecture and module boundaries
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

## Implemented Demo Features

- Guided triage checklist for:
  - responsiveness
  - breathing
  - FAST stroke signs
  - heart-related warning signs
- Deterministic pathway output:
  - possible cardiac arrest
  - suspected stroke
  - possible heart-related emergency
  - unclear emergency
- Immediate and follow-up actions with safety language
- CPR rhythm helper (100-120 BPM) for possible cardiac arrest pathway

## Safety Positioning

All output should use phrasing like "possible" and "suspected". The system does not claim diagnosis, autonomous intervention, or replacement of professional medical care.
