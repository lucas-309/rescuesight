# Meta Quest 3 Unity Integration (Hooks)

This repo now exposes XR hook endpoints for a Unity Quest 3 client.

## Implemented API Hooks

- `POST /api/xr/triage`
  - Creates a new XR incident when `incidentId` is omitted.
  - Re-evaluates the same incident when `incidentId` is provided.
  - Accepts optional `cvSignal` and `acknowledgedCheckpoints`.
  - Returns triage result + XR overlay steps + incident timeline + `cvAssist` + `transitionGate`.
- `GET /api/xr/incidents/:incidentId/overlay`
  - Returns current overlay-ready state for reconnect/resume.
- `PATCH /api/xr/incidents/:incidentId/actions`
  - Marks one action (`emsCalled`, `cprStarted`, etc.) complete/incomplete and returns refreshed overlay state.
- Existing endpoint reused for timeline sync:
  - `PATCH /api/incidents/:incidentId`

## Unity Scripts Added

- `docs/unity/RescueSightApiClient.cs`
  - Quest 3 hook client using `UnityWebRequest`
  - Handles `SubmitQuest3Triage`, `RefreshOverlay`, `SetActionCompleted`, and `UpdateIncidentTimeline`
- `docs/unity/RescueSightQuest3HooksExample.cs`
  - Minimal usage example with scenario simulation and timeline updates
- `docs/unity/RescueSightCvHooksClient.cs`
  - Optional C# client for the Python CV stub service (`/api/cv/evaluate`)

Copy these scripts into your Unity project (for example: `Assets/Scripts/RescueSight/`).

## Quest 3 + Unity Baseline

The referenced repository (`eipm/cornell-health-ai-hackathon-2026`) uses a compatible stack:

- Unity `6000.3.10f1`
- `com.unity.xr.openxr: 1.16.1`
- `com.unity.xr.interaction.toolkit: 3.3.1`
- `com.unity.xr.hands: 1.7.3`
- `com.unity.xr.androidxr-openxr: 1.1.0`
- `com.unity.inputsystem: 1.18.0`

Use that as your starting package profile for Quest 3.

## Recommended Unity Scene Wiring

1. Add `RescueSightApiClient` to a persistent scene object.
2. Set `Api Base Url` to your API host reachable from Quest 3.
3. Add `RescueSightQuest3HooksExample` (or your own controller script).
4. Call `SubmitQuest3Triage` whenever user confirmations change triage inputs.
5. If `transitionGate.blocked` is true, force checkpoint acknowledgment before allowing critical action transitions.
6. Render `overlaySteps` as world/head-locked cards and mark actions complete via `SetActionCompleted`.
7. On app resume/reconnect, call `RefreshOverlay`.

## Networking Notes For Quest 3

- Quest 3 must reach your API over LAN/WAN; use your machine IP, not `localhost`.
- Ensure API CORS is enabled for your client origin (already enabled in `apps/api`).
- For demo safety, keep all language assistive and non-diagnostic.

## XR Triage Request Example

```json
{
  "answers": {
    "responsive": false,
    "breathingNormal": false,
    "strokeSigns": {
      "faceDrooping": false,
      "armWeakness": false,
      "speechDifficulty": false
    },
    "heartRelatedSigns": {
      "chestDiscomfort": false,
      "shortnessOfBreath": false,
      "coldSweat": false,
      "nauseaOrUpperBodyDiscomfort": false
    }
  },
  "incidentId": "optional-existing-id",
  "timeline": {
    "aedStatus": "retrieval_in_progress",
    "actionsTaken": {
      "emsCalled": true
    }
  },
  "deviceContext": {
    "deviceModel": "meta_quest_3",
    "interactionMode": "hands",
    "appVersion": "0.1.0",
    "unityVersion": "6000.3.10f1"
  }
}
```
