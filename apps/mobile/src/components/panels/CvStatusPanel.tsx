import type { CvLiveSummary } from "@rescuesight/shared";
import { StyleSheet, Text, View } from "react-native";
import { PanelCard } from "../PanelCard";
import { palette } from "../../theme/palette";
import { boolLabel, formatDateTime, formatPercent } from "../../utils/format";

interface CvStatusPanelProps {
  summary: CvLiveSummary | null;
  connectedAtIso: string | null;
}

const isFresh = (updatedAtIso: string): boolean =>
  Date.now() - new Date(updatedAtIso).getTime() < 8_000;

export const CvStatusPanel = ({ summary, connectedAtIso }: CvStatusPanelProps) => {
  const modelConnected = Boolean(connectedAtIso);
  const sceneAnalysisActive = Boolean(summary && isFresh(summary.updatedAtIso));
  const patientDetected =
    summary?.personDownSignal.status === "person_down" ||
    summary?.personDownSignal.status === "uncertain";
  const handPlacementKnown = summary?.signal.handPlacementStatus !== "unknown";
  const fullVisibility = summary?.signal.visibility === "full";
  const landmarksDetected = Boolean(summary && (handPlacementKnown || fullVisibility));

  return (
    <PanelCard title="CV Status">
      <View style={styles.grid}>
        <StatusItem label="Model status" value={modelConnected ? "Connected" : "Offline"} />
        <StatusItem label="Scene analysis active" value={boolLabel(sceneAnalysisActive)} />
        <StatusItem label="Landmarks detected" value={boolLabel(Boolean(landmarksDetected))} />
        <StatusItem label="Patient detected" value={boolLabel(Boolean(patientDetected))} />
        <StatusItem
          label="Detection confidence"
          value={formatPercent(summary?.personDownSignal.confidence)}
        />
        <StatusItem
          label="Hazard status"
          value={summary ? "No immediate hazards flagged" : "Awaiting model signal"}
          accent={summary ? "neutral" : "warning"}
        />
      </View>
      <Text style={styles.meta}>Last frame: {formatDateTime(summary?.updatedAtIso ?? null)}</Text>
      <Text style={styles.meta}>Session start: {formatDateTime(connectedAtIso)}</Text>
    </PanelCard>
  );
};

interface StatusItemProps {
  label: string;
  value: string;
  accent?: "neutral" | "warning";
}

const StatusItem = ({ label, value, accent = "neutral" }: StatusItemProps) => (
  <View style={styles.item}>
    <Text style={styles.itemLabel}>{label}</Text>
    <Text style={[styles.itemValue, accent === "warning" ? styles.warning : null]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  item: {
    width: "50%",
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  itemLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    marginBottom: 3,
  },
  itemValue: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  warning: {
    color: palette.warning,
  },
  meta: {
    color: palette.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
});
