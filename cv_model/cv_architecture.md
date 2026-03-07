# CV Module Architecture (Hackathon 2-Day Plan)

RescueSight is a prototype AI-powered emergency response system built into VR/XR goggles. The CV module is assistive only: it helps bystanders position hands and keep CPR pace, while the existing triage system remains deterministic and safety-first.

## Hackathon constraints

- Timebox: 2 days total
- No custom model training or fine-tuning
- Use open-source pre-trained models only
- Keep implementation portable to Meta Quest 3 (Android-based)
- Prefer deterministic post-processing rules over heavy ML experimentation

## MVP objectives

The CV module must output these signals in real time:

1. Hand placement guidance relative to patient chest center.
2. Separation between rescuer hand motion and patient body landmarks.
3. Compression rate (BPM) and rhythm quality.
4. Graceful fallback when full patient body is not visible.

## Chosen approach (pre-trained only)

Use MediaPipe pre-trained task models plus lightweight geometry and temporal logic:

- `MediaPipe Pose Landmarker` (BlazePose family) for torso/chest landmarks.
- `MediaPipe Hand Landmarker` for rescuer hand landmarks.
- OpenCV tracking + smoothing for robust frame-to-frame behavior.

Why this fits Quest 3:

- MediaPipe uses mobile-friendly models and TFLite backends.
- Android portability path is straightforward compared with training and shipping custom models.
- Same signal contract can be used now on laptop and later in Unity/Quest runtime.

## Output contract (what the CV module returns)

Return a typed payload every inference tick (for example 5 to 10 Hz):

```json
{
	"handPlacementStatus": "correct | too_high | too_low | too_left | too_right | unknown",
	"placementConfidence": 0.0,
	"compressionRateBpm": 0,
	"compressionRhythmQuality": "good | too_slow | too_fast | inconsistent | unknown",
	"visibility": "full | partial | poor",
	"frameTimestampMs": 0
}
```

## Two-day execution checklist

## Day 1: Build working CV pipeline

- [ ] Set up a new `cv_model/prototype/` folder with:
	- [ ] `requirements.txt` (mediapipe, opencv-python, numpy)
	- [ ] `run_webcam.py` for live capture
	- [ ] `cv_signals.py` for signal extraction logic
- [ ] Integrate `Pose Landmarker` and validate stable torso landmarks.
- [ ] Integrate `Hand Landmarker` and validate stable rescuer hand landmarks.
- [ ] Implement chest-center estimate from torso landmarks (shoulder/hip midpoint heuristic).
- [ ] Implement hand-placement classification:
	- [ ] Compute hand centroid to chest-center vector.
	- [ ] Map to `correct/too_high/too_low/too_left/too_right`.
	- [ ] Add confidence gates and `unknown` fallback.
- [ ] Implement CPR BPM estimator:
	- [ ] Track wrist vertical motion over time.
	- [ ] Detect compression peaks.
	- [ ] Compute rolling BPM in 5 to 10 second window.
- [ ] Implement rhythm quality labels:
	- [ ] `<100` => `too_slow`
	- [ ] `100-120` => `good`
	- [ ] `>120` => `too_fast`
	- [ ] high variance/low confidence => `inconsistent` or `unknown`
- [ ] Demo checkpoint by end of Day 1:
	- [ ] Live overlay shows hand placement state.
	- [ ] BPM updates in near real time.

## Day 2: Harden, integrate, and demo

- [ ] Add partial-visibility fallback logic:
	- [ ] Keep last reliable chest center for short occlusions.
	- [ ] Downgrade to `unknown` only when confidence stays low.
- [ ] Add temporal smoothing to reduce jitter and false flips.
- [ ] Build a local CV service wrapper (`FastAPI` or lightweight HTTP endpoint) that emits the output contract.
- [ ] Integrate with existing API flow:
	- [ ] Add CV input type in shared package.
	- [ ] Add fusion step in API (advisory only, never diagnostic).
	- [ ] Preserve safety wording: "possible" / "suspected".
- [ ] Add a web debug panel in `apps/web` to display CV signals for demo.
- [ ] Record 3 demo scenarios:
	- [ ] Correct hand position + good pace
	- [ ] Wrong hand position (left/right/high/low)
	- [ ] Partial-body visibility with fallback behavior
- [ ] Final demo checklist:
	- [ ] Stable output for at least 60 seconds.
	- [ ] BPM roughly tracks compression speed.
	- [ ] System fails safe (`unknown`) when confidence is poor.

## Explicit non-goals for this hackathon

- No dataset collection pipeline.
- No custom model training.
- No medical-grade claims.
- No autonomous emergency decision making from CV alone.

## Portability plan to Meta Quest 3 (post-hackathon)

1. Replace laptop webcam input with Quest camera input in Unity/Android.
2. Reuse same signal extraction contract and thresholds.
3. Keep model choices in MediaPipe/TFLite-compatible path.
4. Optimize frame size and inference rate for thermal stability.

## Definition of done (hackathon)

The module is done if all are true:

1. Uses only open-source pre-trained models (no training).
2. Provides real-time hand placement and BPM/rhythm outputs.
3. Handles partial visibility with confidence-based fallback.
4. Integrates into RescueSight flow as assistive guidance.
5. Demonstrates a clear Quest 3 portability path.
