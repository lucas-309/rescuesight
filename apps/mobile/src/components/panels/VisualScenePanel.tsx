import type { CvLiveSummary } from "@rescuesight/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PanelCard } from "../PanelCard";
import { palette } from "../../theme/palette";
import { CV_MODEL_FRAME_URL, CV_POST_INTERVAL_MS } from "../../config/env";
import { postMobileCameraFrame, type CvModelOverlay } from "../../services/cvApi";

interface VisualScenePanelProps {
  summary: CvLiveSummary | null;
}

export const VisualScenePanel = ({ summary }: VisualScenePanelProps) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const captureInFlightRef = useRef(false);
  const [streamStatus, setStreamStatus] = useState("Waiting for camera permission");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [modelOverlay, setModelOverlay] = useState<CvModelOverlay | null>(null);
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
      });
      setStreamError(upload.warning);
      setModelOverlay((previous) => blendOverlay(previous, upload.overlay));
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
  }, [viewportSize.height, viewportSize.width]);

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
  const personDownLabel = summary
    ? `${summary.personDownSignal.status} (${Math.round(summary.personDownSignal.confidence * 100)}%)`
    : "Awaiting model inference";
  const handPlacementLabel = summary?.signal.handPlacementStatus ?? "unknown";
  const compressionLabel =
    summary && summary.signal.compressionRateBpm > 0
      ? `${Math.round(summary.signal.compressionRateBpm)} bpm`
      : "No compression rhythm yet";
  const placementStatus = modelOverlay?.placementStatus ?? handPlacementLabel;
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
  const targetSize =
    modelOverlay?.chestTarget !== null && modelOverlay?.chestTarget !== undefined
      ? Math.max(
          52,
          Math.min(118, Math.min(viewportSize.width, viewportSize.height) * modelOverlay.chestTarget.palmScale * 3.3),
        )
      : 78;
  const showStaticCrosshair = !targetCenter;
  const overlay = (
    <View pointerEvents="none" style={styles.overlayLayer}>
      <View style={styles.overlayBadge}>
        <Text style={styles.overlayBadgeText}>AR Overlay Active</Text>
      </View>
      <View style={styles.overlayTopRow}>
        <View style={[styles.overlayTag, styles.overlayTagPrimary]}>
          <Text style={styles.overlayText}>Patient status: {personDownLabel}</Text>
        </View>
        <View style={[styles.overlayTag, styles.overlayTagSecondary]}>
          <Text style={styles.overlayText}>Hand placement: {placementStatus}</Text>
        </View>
      </View>
      <View style={styles.centerTarget}>
        {showStaticCrosshair ? <View style={styles.crosshair} /> : null}
      </View>
      <View style={styles.bottomHint}>
        <Text style={styles.bottomHintText}>Compression: {compressionLabel}</Text>
      </View>
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
              left: handCenter.x - 10,
              top: handCenter.y - 10,
              backgroundColor: placementColor,
            },
          ]}
        />
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
  overlayText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: "700",
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
  handMarker: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
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
