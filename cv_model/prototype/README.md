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

## Setup

```bash
cd cv_model/prototype
./bootstrap.sh
```

`bootstrap.sh` now does all of this in one command:
- creates/uses `.venv`
- activates it
- installs requirements
- runs `run_webcam.py`

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

Pass webcam flags through bootstrap:

```bash
./bootstrap.sh -- --print-json --camera-index 0
```

Run tests before starting webcam:

```bash
./bootstrap.sh --run-tests
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

On first run, the script automatically downloads these pre-trained MediaPipe task models into `cv_model/prototype/models/`:

- `pose_landmarker_lite.task`
- `hand_landmarker.task`

Optional flags:

- `--camera-index 0`
- `--max-fallback-frames 12`

Press `q` to quit.

## Quick tests

```bash
python -m unittest test_cv_signals.py test_cv_hooks.py
```

Or through bootstrap script:

```bash
./bootstrap.sh --run-tests -- --print-json
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
