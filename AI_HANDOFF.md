# RescueSight AI Handoff (Quick)

Use this file as the first stop before changing anything.

## What this repo currently does

- Mobile frontend (`apps/mobile`) captures iPhone camera frames.
- Frames go to local CV model service: `POST /api/cv/frame` (Python service on `:8091`).
- Model returns:
  - `signal` (placement/status)
  - `overlay` (hand center + chest target)
- Mobile posts `signal` to API: `POST /api/cv/live-signal` (Node API on `:8080`).
- Dashboard/summary reads `GET /api/cv/live-summary`.

## Critical files

- `apps/mobile/src/components/panels/VisualScenePanel.tsx`
  - Camera capture loop and overlay rendering.
- `apps/mobile/src/services/cvApi.ts`
  - Model-host request and live-signal ingest logic.
- `apps/mobile/src/config/env.ts`
  - `EXPO_PUBLIC_*` env config, frame interval default.
- `cv_model/prototype/cv_service.py`
  - `/api/cv/frame` endpoint, MediaPipe inference, overlay mapping.
- `apps/api/src/app.ts`
  - API routes (`/`, `/health`, `/api/cv/live-signal`, `/api/cv/live-summary`).

## Known-good end-to-end run (3 terminals)

1) API

```bash
cd /Users/naijei/Hackthon-AI/rescuesight
npm run dev:api
```

2) CV model service

```bash
cd /Users/naijei/Hackthon-AI/rescuesight/cv_model/prototype
./bootstrap.sh --service-only --service-host 0.0.0.0 --service-port 8091
```

3) Expo mobile (replace LAN IP if needed)

```bash
cd /Users/naijei/Hackthon-AI/rescuesight
EXPO_PUBLIC_API_BASE_URL="http://10.111.4.108:8080" \
EXPO_PUBLIC_CV_FRAME_POST_URL="http://10.111.4.108:8080/api/cv/live-signal" \
EXPO_PUBLIC_CV_MODEL_FRAME_URL="http://10.111.4.108:8091/api/cv/frame" \
EXPO_PUBLIC_CV_POST_INTERVAL_MS="700" \
npm --workspace @rescuesight/mobile run dev -- --clear
```

Optional mirror on Mac browser:

```bash
npm run dev:mobile:web
```

## LAN IP

```bash
ipconfig getifaddr en0
```

If empty, try:

```bash
ipconfig getifaddr en1
```

Use that IP in all `EXPO_PUBLIC_*` URLs.

## Fast sanity checks

- API alive:
  - `curl http://<LAN_IP>:8080/health`
- CV model alive:
  - `curl http://<LAN_IP>:8091/health`
- Expo project SDK:
  - Must be Expo SDK 54 for current iOS Expo Go.

## Known failure patterns

- `Project is incompatible with this version of Expo Go`
  - Project SDK mismatch; keep mobile workspace on SDK 54.
- `Cannot GET /`
  - Root API route missing or old server process running.
- `frame upload failed`
  - Wrong `EXPO_PUBLIC_CV_MODEL_FRAME_URL`, LAN mismatch, or CV service not running.
- Overlay visible but chest target wrong
  - Usually stale preview dimensions or orientation mismatch.
  - Check `VisualScenePanel.tsx` viewport size + `cv_service.py` preview mapping.

## Current implementation notes

- Mobile overlay updates are prioritized for responsiveness:
  - In model mode, ingest to `/api/cv/live-signal` is non-blocking.
- CV service maps model coordinates into preview space using cover-crop math.
- Target stabilizer is tuned for faster recentering (less sticky chest marker).

## When making changes

- Keep `signal` schema compatible with `packages/shared`.
- Do not break these routes:
  - `POST /api/cv/frame`
  - `POST /api/cv/live-signal`
  - `GET /api/cv/live-summary`
- Run before handoff:

```bash
npm --workspace @rescuesight/mobile run typecheck
python3 -m py_compile /Users/naijei/Hackthon-AI/rescuesight/cv_model/prototype/cv_service.py
```
