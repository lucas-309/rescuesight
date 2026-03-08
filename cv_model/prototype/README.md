# RescueSight CV Prototype

This is the Day 1 hackathon scaffold for CV signals using pre-trained MediaPipe models only.

## What it does

- Estimates chest center from pose landmarks.
- Estimates a CPR-specific chest compression target (lower-half sternum heuristic).
- Estimates rescuer hand center from hand landmarks.
- Classifies hand placement: `correct`, `too_high`, `too_low`, `too_left`, `too_right`, `unknown`.
- Estimates compression BPM and rhythm quality from wrist motion.
- Applies partial-visibility fallback for short torso occlusions.
- Renders a hand-shaped target overlay (instead of a dot) to indicate where to perform CPR.
- Uses confidence-based lock-on: after stable high-confidence frames, CPR target stays locked to reduce wobble.
- Uses rescaled person-down confidence so likely person-down states trigger HITL flow more reliably.
- Displays questionnaire in a dedicated on-screen panel and shows explicit dispatch-send confirmation.

## Setup

```bash
cd cv_model/prototype
./bootstrap.sh
```

`bootstrap.sh` now does all of this in one command:
- creates/uses `.venv`
- activates it
- installs requirements
- optionally runs tests
- launches `cv_service.py` and `run_webcam.py` together (default)

Equivalent manual setup:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

Default (through bootstrap):

```bash
./bootstrap.sh
```

Default launch mode is `--all` (CV service + webcam). Use `--webcam-only` or `--service-only` to limit runtime components.

Pass webcam flags through bootstrap:

```bash
./bootstrap.sh --webcam-only -- --print-json --camera-index 0
```

Run tests before starting webcam:

```bash
./bootstrap.sh --run-tests --webcam-only
```

Run everything needed for API + CV + webcam demo:

```bash
./bootstrap.sh --run-tests --all -- --print-json --camera-index 0
```

Run webcam and stream live CV summary into the API (used by web dashboard):

```bash
./bootstrap.sh --webcam-only -- \
  --post-url http://127.0.0.1:8080/api/cv/live-signal \
  --source-device-id quest3-kiosk-01 \
  --location-label "Main lobby" \
  --location-lat 37.8715 \
  --location-lon -122.2730
```

Equivalent env-style bootstrap:

```bash
LIVE_POST_URL="http://127.0.0.1:8080/api/cv/live-signal" \
LIVE_SOURCE_DEVICE_ID="quest3-kiosk-01" \
LIVE_LOCATION_LABEL="Main lobby" \
LIVE_LOCATION_LAT="37.8715" \
LIVE_LOCATION_LON="-122.2730" \
./bootstrap.sh --webcam-only
```

Run service only:

```bash
./bootstrap.sh --service-only --service-host 127.0.0.1 --service-port 8091
```

Direct run (inside activated venv):

```bash
python run_webcam.py --print-json
```

Run the lightweight CV hook HTTP service (for API/Quest integration tests):

```bash
python cv_service.py --host 127.0.0.1 --port 8091
```

Service endpoints:

- `GET /health`
- `POST /api/cv/evaluate`
- `POST /api/cv/frame` (accepts `imageDataUrl` from mobile camera, returns `{ signal, cvAssist }`)

Example `POST /api/cv/frame` body:

```json
{
  "imageDataUrl": "data:image/jpeg;base64,...",
  "frameTimestampMs": 1731000000,
  "sourceDeviceId": "iphone-rescuesight"
}
```

`/api/cv/frame` response now also includes an `overlay` object with normalized coordinates:
- `overlay.handCenter` (x/y)
- `overlay.chestTarget.center` (x/y)
- `overlay.chestTarget.angleDeg`
- `overlay.chestTarget.palmScale`

On first run, the script automatically downloads these pre-trained MediaPipe task models into `cv_model/prototype/models/`:

- `pose_landmarker_lite.task`
- `hand_landmarker.task`
- `face_landmarker.task`

If model download fails with SSL certificate errors on macOS, run:

```bash
/Applications/Python\ 3.12/Install\ Certificates.command
```

or manually download the model files to `cv_model/prototype/models/` using `curl`.

Optional flags:

- `--camera-index 0`
- `--camera-zoom 0` (default; request widest FOV). Use `--camera-zoom -1` to keep webcam/device default.
- `--max-fallback-frames 12`
- `--post-url http://127.0.0.1:8080/api/cv/live-signal`
- `--post-interval-ms 1000`
- `--source-device-id quest3-kiosk-01`
- `--location-label "Main lobby" --location-lat 37.8715 --location-lon -122.2730`
- `--api-base-url http://127.0.0.1:8080` (enable `POST /api/dispatch/requests` on questionnaire completion)
- `--disable-hitl` (disable questionnaire trigger)
- `--questionnaire-cooldown-sec 30`

Controls:

- `q` quit
- `h` start questionnaire
- `y` / `n` answer questionnaire prompts
- `x` reset questionnaire session

HITL trigger behavior:

- Auto trigger now uses sustained person-down evidence with hysteresis (smoothed posture + eyes + CPR-motion cues), instead of a single strict per-frame threshold.
- When trigger is ready, overlay prompts: "Press H to start questionnaire now."
- If you press `h` without trigger readiness, overlay asks for confirmation (`y` to proceed, `n` to cancel).
- On trigger readiness, the webcam captures a victim snapshot and includes it in the dispatch request payload as `victimSnapshot`, so the dashboard can display the scene image.
- While live streaming (`--post-url`), a recent victim snapshot is also attached to `/api/cv/live-signal` summaries when person-down evidence is present, so the web dashboard can escalate with an image.

## Quick tests

```bash
python -m unittest test_cv_signals.py test_cv_hooks.py test_hitl_flow.py
```

Or through bootstrap script:

```bash
./bootstrap.sh --run-tests --webcam-only -- --print-json
```

Example `POST /api/cv/evaluate` body:

```json
{
  "signal": {
    "handPlacementStatus": "too_left",
    "placementConfidence": 0.88,
    "compressionRateBpm": 94,
    "compressionRhythmQuality": "too_slow",
    "visibility": "full",
    "frameTimestampMs": 1731000000
  },
  "acknowledgedCheckpoints": [],
  "source": "quest3"
}
```

## Notes

- This is assistive-only demo logic and is not medical-grade.
- Model path is pre-trained only (MediaPipe), aligned with Quest 3 portability goals.
- This scaffold uses the MediaPipe `tasks` API (compatible with newer package builds where `mp.solutions` is unavailable).
