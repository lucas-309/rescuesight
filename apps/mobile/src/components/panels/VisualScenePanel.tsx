import type { CvLiveSummary, XrCvSignalInput } from "@rescuesight/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PanelCard } from "../PanelCard";
import { palette } from "../../theme/palette";
import { CV_MODEL_FRAME_URL, CV_POST_INTERVAL_MS } from "../../config/env";
import {
  postMobileCameraFrame,
  type CvAssistHints,
  type CvModelOverlay,
} from "../../services/cvApi";

interface VisualScenePanelProps {
  summary: CvLiveSummary | null;
  sessionId: string | null;
}

export const VisualScenePanel = ({ summary, sessionId }: VisualScenePanelProps) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const captureInFlightRef = useRef(false);
  const [streamStatus, setStreamStatus] = useState("Waiting for camera permission");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [modelOverlay, setModelOverlay] = useState<CvModelOverlay | null>(null);
  const [latestSignal, setLatestSignal] = useState<XrCvSignalInput | null>(null);
  const [latestAssist, setLatestAssist] = useState<CvAssistHints | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });

  const pushCameraFrame = useCallback(async () => {
    if (!cameraRef.current || captureInFlightRef.current) {
      return;
    }

    captureInFlightRef.current = true;

    try {
      const frame = await cameraRef.current.takePictureAsync({
        quality: 0.07,
        base64: true,
        exif: false,
        skipProcessing: true,
      });

      if (!frame?.base64) {
        throw new Error("Camera frame capture returned no image data.");
      }

      const upload = await postMobileCameraFrame({
        imageBase64: frame.base64,
        frameWidth: frame.width,
        frameHeight: frame.height,
        previewWidth: viewportSize.width > 1 ? viewportSize.width : undefined,
        previewHeight: viewportSize.height > 1 ? viewportSize.height : undefined,
      }, {
        sessionId: sessionId ?? undefined,
      });
      setStreamError(upload.warning);
      setModelOverlay((previous) => blendOverlay(previous, upload.overlay));
      setLatestSignal(upload.signal);
      setLatestAssist(upload.cvAssist);
      setStreamStatus(
        upload.mode === "model"
          ? "Streaming iPhone camera frames through CV model host"
          : "Streaming iPhone frames to backend (fallback signal mode)",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to stream camera frames to CV backend.";
      if (message.toLowerCase().includes("not ready")) {
        setStreamStatus("Initializing camera feed...");
        return;
      }
      setStreamError(message);
      setStreamStatus("Camera connected, but frame upload failed");
    } finally {
      captureInFlightRef.current = false;
    }
  }, [sessionId, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!permission?.granted) {
      return;
    }

    setStreamStatus(
      CV_MODEL_FRAME_URL
        ? "Camera connected. Starting CV model frame stream..."
        : "Camera connected. Starting fallback frame stream...",
    );
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (cancelled) {
        return;
      }
      const startedAt = Date.now();
      await pushCameraFrame();
      const elapsedMs = Date.now() - startedAt;
      const nextDelayMs = Math.max(120, CV_POST_INTERVAL_MS - elapsedMs);
      timeoutId = setTimeout(() => {
        void loop();
      }, nextDelayMs);
    };
    void loop();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [permission?.granted, pushCameraFrame]);

  const cameraUnavailable = !permission || !permission.granted;
  const activeSignal = latestSignal ?? summary?.signal ?? null;
  const personDownDisplay = inferPersonDownDisplay(activeSignal, summary, latestAssist);
  const compressionLabel =
    activeSignal && activeSignal.compressionRateBpm > 0
      ? `${Math.round(activeSignal.compressionRateBpm)} bpm`
      : "No compression rhythm yet";
  const placementStatus = modelOverlay?.placementStatus ?? activeSignal?.handPlacementStatus ?? "unknown";
  const placementConfidence =
    modelOverlay?.placementConfidence ?? activeSignal?.placementConfidence ?? 0;
  const visibility = modelOverlay?.visibility ?? activeSignal?.visibility ?? "poor";
  const placementInstruction =
    latestAssist?.handPlacementHint.message ??
    modelOverlay?.placementInstruction ??
    placementInstructionForStatus(placementStatus);
  const targetLocked = modelOverlay?.targetLocked ?? Boolean(modelOverlay?.chestTarget);
  const placementColor = getPlacementColor(placementStatus);
  const targetCenter = modelOverlay?.chestTarget
    ? {
        x: clamp01(modelOverlay.chestTarget.center.x) * viewportSize.width,
        y: clamp01(modelOverlay.chestTarget.center.y) * viewportSize.height,
      }
    : null;
  const handCenter = modelOverlay?.handCenter
    ? {
        x: clamp01(modelOverlay.handCenter.x) * viewportSize.width,
        y: clamp01(modelOverlay.handCenter.y) * viewportSize.height,
      }
    : null;
  const explicitDistanceLine =
    modelOverlay?.distanceLine && viewportSize.width > 1 && viewportSize.height > 1
      ? {
          start: {
            x: clamp01(modelOverlay.distanceLine.start.x) * viewportSize.width,
            y: clamp01(modelOverlay.distanceLine.start.y) * viewportSize.height,
          },
          end: {
            x: clamp01(modelOverlay.distanceLine.end.x) * viewportSize.width,
            y: clamp01(modelOverlay.distanceLine.end.y) * viewportSize.height,
          },
        }
      : null;
  const targetSize =
    modelOverlay?.chestTarget !== null && modelOverlay?.chestTarget !== undefined
      ? Math.max(
          52,
          Math.min(118, Math.min(viewportSize.width, viewportSize.height) * modelOverlay.chestTarget.palmScale * 3.3),
        )
      : 78;
  const connectorMetrics =
    explicitDistanceLine
      ? buildConnectorMetrics(explicitDistanceLine.start, explicitDistanceLine.end)
      : handCenter && targetCenter
        ? buildConnectorMetrics(handCenter, targetCenter)
        : null;
  const distancePalmWidths =
    modelOverlay?.distanceEstimate?.palmWidths ??
    (connectorMetrics ? connectorMetrics.length / Math.max(1, targetSize) : null);
  const readyForCompressions =
    modelOverlay?.readyForCompressions ??
    Boolean(
      handCenter &&
        targetCenter &&
        targetLocked &&
        placementStatus === "correct" &&
        placementConfidence >= 0.68 &&
        (visibility === "full" || visibility === "partial"),
    );
  const readinessText = readyForCompressions
    ? "HAND POSITION CONFIRMED. START CHEST COMPRESSIONS NOW."
    : `${placementInstruction} Confidence: ${placementConfidence.toFixed(2)}`;
  const showStaticCrosshair = !targetCenter;
  const overlay = (
    <View pointerEvents="none" style={styles.overlayLayer}>
      <View style={styles.hudTop}>
        <View style={styles.overlayBadge}>
          <Text style={styles.overlayBadgeText}>AR Overlay Active</Text>
        </View>
        <View style={styles.overlayTopRow}>
          <View style={[styles.overlayTag, styles.overlayTagPrimary]}>
            <Text style={styles.overlayText}>
              Patient: {personDownDisplay.status} ({Math.round(personDownDisplay.confidence * 100)}%)
            </Text>
          </View>
          <View style={[styles.overlayTag, styles.overlayTagSecondary]}>
            <Text style={styles.overlayText}>
              Hand: {placementStatus} ({placementConfidence.toFixed(2)})
            </Text>
          </View>
          {distancePalmWidths !== null ? (
            <View style={[styles.overlayTag, styles.overlayTagDistance]}>
              <Text style={styles.overlayText}>
                Offset: {distancePalmWidths.toFixed(2)} palms
              </Text>
            </View>
          ) : null}
        </View>
        <View
          style={[
            styles.readinessBanner,
            readyForCompressions ? styles.readinessBannerReady : styles.readinessBannerAdjust,
          ]}
        >
          <Text style={styles.readinessText}>{readinessText}</Text>
        </View>
      </View>
      <View style={styles.centerTarget}>
        {showStaticCrosshair ? <View style={styles.crosshair} /> : null}
      </View>
      <View style={styles.bottomHint}>
        <Text style={styles.bottomHintText}>
          Compression: {compressionLabel} | Visibility: {visibility}
        </Text>
      </View>
      {connectorMetrics ? (
        <View
          style={[
            styles.connectorLine,
            {
              left: connectorMetrics.midX - connectorMetrics.length / 2,
              top: connectorMetrics.midY - 1.5,
              width: connectorMetrics.length,
              transform: [{ rotate: `${connectorMetrics.angleDeg}deg` }],
              backgroundColor: readyForCompressions ? "#5AF0AA" : "#74D6FF",
            },
          ]}
        />
      ) : null}
      {targetCenter ? (
        <View
          style={[
            styles.targetMarker,
            {
              left: targetCenter.x - targetSize / 2,
              top: targetCenter.y - targetSize / 2,
              width: targetSize,
              height: targetSize,
              borderColor: placementColor,
              transform: [{ rotate: `${modelOverlay?.chestTarget?.angleDeg ?? 0}deg` }],
            },
          ]}
        >
          <View style={[styles.targetMarkerInner, { borderColor: placementColor }]} />
        </View>
      ) : null}
      {handCenter ? (
        <View
          style={[
            styles.handMarker,
            {
              left: handCenter.x - 16,
              top: handCenter.y - 16,
              backgroundColor: placementColor,
            },
          ]}>
          <View style={styles.handMarkerInner} />
        </View>
      ) : null}
    </View>
  );

  return (
    <PanelCard title="Live Scene / AR Canvas">
      <View
        style={styles.viewport}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setViewportSize({ width, height });
          }
        }}
      >
        {cameraUnavailable ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderTitle}>Camera Access Required</Text>
            <Text style={styles.placeholderText}>
              Allow iPhone camera access to stream live frames to your CV backend model.
            </Text>
            <Pressable style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Enable Camera</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        )}
        {overlay}
      </View>
      <Text style={styles.statusText}>{streamStatus}</Text>
      {summary?.updatedAtIso ? (
        <Text style={styles.statusText}>Last CV update: {new Date(summary.updatedAtIso).toLocaleTimeString()}</Text>
      ) : null}
      {streamError ? <Text style={styles.errorText}>{streamError}</Text> : null}
    </PanelCard>
  );
};

const styles = StyleSheet.create({
  viewport: {
    position: "relative",
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "#08121E",
    justifyContent: "center",
    alignItems: "center",
  },
  camera: {
    position: "absolute",
    width: "100%",
    height: "100%",
    zIndex: 1,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: 10,
    zIndex: 3,
    elevation: 8,
  },
  hudTop: {
    alignSelf: "stretch",
    gap: 6,
  },
  overlayBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(6,10,18,0.7)",
    marginBottom: 6,
  },
  overlayBadgeText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  overlayTopRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  placeholder: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  placeholderTitle: {
    color: palette.textPrimary,
    fontWeight: "700",
    fontSize: 20,
    marginBottom: 8,
  },
  placeholderText: {
    color: palette.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    fontSize: 13,
    marginBottom: 12,
  },
  permissionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: palette.cyan,
  },
  permissionButtonText: {
    color: "#042027",
    fontWeight: "700",
    fontSize: 13,
  },
  overlayTag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  overlayTagPrimary: {
    borderColor: "rgba(52, 208, 227, 0.8)",
    backgroundColor: "rgba(11, 64, 73, 0.6)",
  },
  overlayTagSecondary: {
    borderColor: "rgba(244, 160, 25, 0.8)",
    backgroundColor: "rgba(64, 44, 10, 0.62)",
  },
  overlayTagDistance: {
    borderColor: "rgba(158, 201, 255, 0.82)",
    backgroundColor: "rgba(28, 46, 82, 0.62)",
  },
  overlayText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  readinessBanner: {
    alignSelf: "stretch",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  readinessBannerReady: {
    borderColor: "rgba(98, 240, 154, 0.85)",
    backgroundColor: "rgba(22, 92, 48, 0.72)",
  },
  readinessBannerAdjust: {
    borderColor: "rgba(236, 230, 128, 0.85)",
    backgroundColor: "rgba(68, 64, 18, 0.72)",
  },
  readinessText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  centerTarget: {
    alignItems: "center",
    justifyContent: "center",
  },
  crosshair: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.78)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  targetMarker: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 999,
    backgroundColor: "rgba(6, 10, 18, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  targetMarkerInner: {
    width: "42%",
    height: "42%",
    borderRadius: 999,
    borderWidth: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  connectorLine: {
    position: "absolute",
    height: 3,
    borderRadius: 2,
    opacity: 0.9,
  },
  handMarker: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  handMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(10,14,18,0.28)",
  },
  bottomHint: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(6, 10, 18, 0.6)",
  },
  bottomHintText: {
    color: palette.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  statusText: {
    color: palette.textSecondary,
    fontSize: 12,
    marginTop: 8,
  },
  errorText: {
    color: palette.danger,
    fontSize: 12,
    marginTop: 6,
  },
});

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const clampRange = (value: number, lower: number, upper: number): number => Math.max(lower, Math.min(upper, value));
const lerp = (fromValue: number, toValue: number, alpha: number): number => fromValue + (toValue - fromValue) * alpha;
const blendAngle = (fromAngleDeg: number, toAngleDeg: number, alpha: number): number => {
  const delta = ((toAngleDeg - fromAngleDeg + 540) % 360) - 180;
  return fromAngleDeg + delta * alpha;
};

const blendPoint = (
  previous: CvModelOverlay["handCenter"],
  next: CvModelOverlay["handCenter"],
  alpha: number,
): CvModelOverlay["handCenter"] => {
  if (!next) {
    return null;
  }
  if (!previous) {
    return next;
  }
  return {
    x: clamp01(lerp(previous.x, next.x, alpha)),
    y: clamp01(lerp(previous.y, next.y, alpha)),
  };
};

const blendOverlay = (previous: CvModelOverlay | null, next: CvModelOverlay | null): CvModelOverlay | null => {
  if (!next) {
    return null;
  }
  if (!previous) {
    return next;
  }

  const handCenter = next.handCenter
    ? blendPoint(previous.handCenter, next.handCenter, 0.52)
    : next.visibility === "poor"
      ? null
      : previous.handCenter;

  let chestTarget: CvModelOverlay["chestTarget"] = null;
  if (next.chestTarget) {
    if (previous.chestTarget) {
      const dx = next.chestTarget.center.x - previous.chestTarget.center.x;
      const dy = next.chestTarget.center.y - previous.chestTarget.center.y;
      const displacement = Math.hypot(dx, dy);
      const adaptiveAlpha = clampRange(0.26 + displacement * 2.1, 0.24, 0.86);
      const confidenceScaledAlpha = clampRange(adaptiveAlpha * (0.45 + next.placementConfidence * 0.55), 0.18, 0.88);
      chestTarget = {
        center: {
          x: clamp01(lerp(previous.chestTarget.center.x, next.chestTarget.center.x, confidenceScaledAlpha)),
          y: clamp01(lerp(previous.chestTarget.center.y, next.chestTarget.center.y, confidenceScaledAlpha)),
        },
        angleDeg: blendAngle(previous.chestTarget.angleDeg, next.chestTarget.angleDeg, confidenceScaledAlpha),
        palmScale: lerp(previous.chestTarget.palmScale, next.chestTarget.palmScale, clampRange(confidenceScaledAlpha, 0.18, 0.72)),
      };
    } else {
      chestTarget = next.chestTarget;
    }
  } else if (next.visibility !== "poor") {
    chestTarget = previous.chestTarget;
  }

  return {
    ...next,
    handCenter,
    chestTarget,
    distanceLine:
      handCenter && chestTarget
        ? {
            start: { ...handCenter },
            end: { ...chestTarget.center },
          }
        : null,
    distanceEstimate:
      handCenter && chestTarget
        ? {
            normalized: Math.hypot(handCenter.x - chestTarget.center.x, handCenter.y - chestTarget.center.y),
            palmWidths:
              Math.hypot(handCenter.x - chestTarget.center.x, handCenter.y - chestTarget.center.y) /
              Math.max(chestTarget.palmScale, 1e-4),
            delta: {
              x: handCenter.x - chestTarget.center.x,
              y: handCenter.y - chestTarget.center.y,
            },
          }
        : null,
  };
};

const getPlacementColor = (placementStatus: string): string => {
  if (placementStatus === "correct") {
    return "#44E388";
  }
  if (placementStatus === "unknown") {
    return "#9FB4CC";
  }
  return "#F7B733";
};

const placementInstructionForStatus = (placementStatus: string): string => {
  if (placementStatus === "correct") {
    return "Hand placement confirmed.";
  }
  if (placementStatus === "too_left") {
    return "Move hand slightly right to match target.";
  }
  if (placementStatus === "too_right") {
    return "Move hand slightly left to match target.";
  }
  if (placementStatus === "too_high") {
    return "Move hand slightly lower on sternum.";
  }
  if (placementStatus === "too_low") {
    return "Move hand slightly higher on sternum.";
  }
  return "Keep torso and hands fully visible to reacquire.";
};

const inferPersonDownHintFromSignal = (
  signal: XrCvSignalInput | null,
): { status: "likely" | "possible" | "unclear"; confidence: number } => {
  if (!signal) {
    return { status: "unclear", confidence: 0 };
  }

  let confidence = 0.05;
  const posture = signal.bodyPosture ?? "unknown";
  const postureConfidence = clamp01(signal.postureConfidence ?? 0);
  const eyesClosedConfidence = clamp01(signal.eyesClosedConfidence ?? 0);
  const hasCprPattern =
    signal.handPlacementStatus !== "unknown" &&
    clamp01(signal.placementConfidence) >= 0.55 &&
    signal.compressionRateBpm >= 85 &&
    signal.compressionRhythmQuality !== "unknown";

  if (posture === "lying") {
    confidence += 0.2 + 0.42 * postureConfidence;
  } else if (posture === "sitting") {
    confidence -= 0.2 * Math.max(0.3, postureConfidence);
  } else if (posture === "upright") {
    confidence -= 0.28 * Math.max(0.3, postureConfidence);
  }

  if (eyesClosedConfidence >= 0.4) {
    confidence += 0.16 * eyesClosedConfidence;
  } else if (eyesClosedConfidence >= 0.2) {
    confidence += 0.06 * eyesClosedConfidence;
  }

  if (signal.visibility === "full") {
    confidence += 0.12;
  } else if (signal.visibility === "partial") {
    confidence += 0.06;
  }

  if (signal.handPlacementStatus !== "unknown") {
    confidence += 0.12 * clamp01(signal.placementConfidence);
  }
  if (signal.compressionRateBpm >= 85) {
    confidence += 0.2;
  }
  if (signal.compressionRhythmQuality !== "unknown") {
    confidence += 0.08;
  }
  if (hasCprPattern) {
    confidence += 0.24;
  }

  if (signal.visibility === "poor") {
    confidence = Math.min(confidence, 0.35);
  }
  if (
    (posture === "upright" || posture === "sitting") &&
    postureConfidence >= 0.75 &&
    eyesClosedConfidence < 0.45 &&
    !hasCprPattern
  ) {
    confidence = Math.min(confidence, 0.35);
  }

  const bounded = clamp01(confidence);
  if (bounded >= 0.6) {
    return { status: "likely", confidence: bounded };
  }
  if (bounded >= 0.4) {
    return { status: "possible", confidence: bounded };
  }
  return { status: "unclear", confidence: bounded };
};

const inferPersonDownDisplay = (
  signal: XrCvSignalInput | null,
  summary: CvLiveSummary | null,
  cvAssist: CvAssistHints | null,
): { status: "likely" | "possible" | "unclear"; confidence: number } => {
  if (cvAssist?.personDownHint) {
    return {
      status: cvAssist.personDownHint.status,
      confidence: clamp01(cvAssist.personDownHint.confidence),
    };
  }
  if (summary?.personDownSignal) {
    const confidence = clamp01(summary.personDownSignal.confidence);
    if (summary.personDownSignal.status === "person_down") {
      return { status: confidence >= 0.6 ? "likely" : "possible", confidence };
    }
    if (summary.personDownSignal.status === "uncertain") {
      return { status: "possible", confidence: Math.max(confidence, 0.4) };
    }
    return { status: "unclear", confidence };
  }
  return inferPersonDownHintFromSignal(signal);
};

const buildConnectorMetrics = (
  fromPoint: { x: number; y: number },
  toPoint: { x: number; y: number },
): { length: number; angleDeg: number; midX: number; midY: number } => {
  const deltaX = toPoint.x - fromPoint.x;
  const deltaY = toPoint.y - fromPoint.y;
  const length = Math.max(1, Math.hypot(deltaX, deltaY));
  return {
    length,
    angleDeg: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
    midX: (fromPoint.x + toPoint.x) * 0.5,
    midY: (fromPoint.y + toPoint.y) * 0.5,
  };
};
