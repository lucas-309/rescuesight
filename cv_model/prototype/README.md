# RescueSight CV Prototype

This is the Day 1 hackathon scaffold for CV signals using pre-trained MediaPipe models only.

## What it does

- Estimates chest center from pose landmarks.
- Estimates rescuer hand center from hand landmarks.
- Classifies hand placement: `correct`, `too_high`, `too_low`, `too_left`, `too_right`, `unknown`.
- Estimates compression BPM and rhythm quality from wrist motion.
- Applies partial-visibility fallback for short torso occlusions.

## Setup

```bash
cd cv_model/prototype
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python run_webcam.py --print-json
```

On first run, the script automatically downloads these pre-trained MediaPipe task models into `cv_model/prototype/models/`:

- `pose_landmarker_lite.task`
- `hand_landmarker.task`

Optional flags:

- `--camera-index 0`
- `--max-fallback-frames 12`

Press `q` to quit.

## Notes

- This is assistive-only demo logic and is not medical-grade.
- Model path is pre-trained only (MediaPipe), aligned with Quest 3 portability goals.
- This scaffold uses the MediaPipe `tasks` API (compatible with newer package builds where `mp.solutions` is unavailable).
