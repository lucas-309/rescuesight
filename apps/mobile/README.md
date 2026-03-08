# RescueSight Mobile Frontend

React Native (Expo) emergency frontend for iPhone/tablet demos.

## Flow

1. Landing screen with one emergency button.
2. Confirmation prompt.
3. `idle -> connecting -> connected` state transition.
4. Connects to backend CV endpoints:
   - `GET /health`
   - `POST /api/cv/live-signal` (iPhone camera frames)
   - `GET /api/cv/live-summary`
5. Opens live emergency assistance dashboard.

## Run

```bash
npm install
EXPO_PUBLIC_API_BASE_URL="http://127.0.0.1:8080" npm run dev:mobile
```

For a physical device, use your computer LAN IP instead of `127.0.0.1`.
When prompted, allow camera access in Expo Go so live frames can stream to the backend.
If your CV model has a dedicated ingest endpoint, set `EXPO_PUBLIC_CV_FRAME_POST_URL` to that URL.
If your CV model host can analyze raw image frames, set `EXPO_PUBLIC_CV_MODEL_FRAME_URL` and return:

```json
{
  "signal": {
    "handPlacementStatus": "unknown",
    "placementConfidence": 0.0,
    "compressionRateBpm": 0,
    "compressionRhythmQuality": "unknown",
    "visibility": "partial",
    "frameTimestampMs": 0,
    "bodyPosture": "unknown",
    "postureConfidence": 0.0,
    "eyesClosedConfidence": 0.0
  }
}
```

Optional (enables on-camera hand/target markers):

```json
{
  "overlay": {
    "handCenter": { "x": 0.5, "y": 0.6 },
    "chestTarget": {
      "center": { "x": 0.52, "y": 0.47 },
      "angleDeg": 88.0,
      "palmScale": 0.08
    },
    "placementStatus": "too_left",
    "placementConfidence": 0.62,
    "visibility": "full",
    "usingChestFallback": false
  }
}
```

Then the app forwards that signal to the API live-signal pipeline.
Without `EXPO_PUBLIC_CV_MODEL_FRAME_URL`, the app will use fallback CV signals and you will not get true model-driven overlays.

For this repo's local Python CV service, use:

```bash
EXPO_PUBLIC_CV_MODEL_FRAME_URL="http://<LAN_IP>:8091/api/cv/frame"
```

## Web mirror dependencies

To run the mobile interface in browser (`npm run dev:mobile:web`), install:

```bash
npx expo install react-native-web react-dom @expo/metro-runtime
```

## SDK 54 sync

If dependencies are out of sync, run:

```bash
npx expo install --fix
npx expo-doctor
```

## Structure

- `src/services/cvApi.ts`: CV/backend integration module
- `src/hooks/useEmergencySession.ts`: app session state machine
- `src/components/LandingScreen.tsx`: emergency activation UI
- `src/components/AssistanceDashboard.tsx`: connected assistance console
- `src/components/panels/*`: reusable dashboard panels
