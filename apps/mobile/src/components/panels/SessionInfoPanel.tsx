import type { CvLiveSummary } from "@rescuesight/shared";
import { StyleSheet, Text, View } from "react-native";
import { PanelCard } from "../PanelCard";
import { palette } from "../../theme/palette";
import { boolLabel, formatDateTime, formatPercent } from "../../utils/format";

interface SessionInfoPanelProps {
  connectedAtIso: string | null;
  summary: CvLiveSummary | null;
}

export const SessionInfoPanel = ({ connectedAtIso, summary }: SessionInfoPanelProps) => (
  <PanelCard title="Incident Session">
    <InfoRow label="Session active" value={boolLabel(Boolean(connectedAtIso))} />
    <InfoRow label="Session timestamp" value={formatDateTime(connectedAtIso)} />
    <InfoRow label="Model connected" value={boolLabel(Boolean(connectedAtIso))} />
    <InfoRow
      label="Detection status"
      value={
        summary
          ? `${summary.personDownSignal.status} (${formatPercent(summary.personDownSignal.confidence)})`
          : "Waiting for live signal"
      }
    />
    <InfoRow label="Notes" value="Responder notes placeholder" />
    <InfoRow label="Handoff" value="Future responder transfer payload placeholder" />
  </PanelCard>
);

interface InfoRowProps {
  label: string;
  value: string;
}

const InfoRow = ({ label, value }: InfoRowProps) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  row: {
    marginBottom: 9,
  },
  label: {
    color: palette.textSecondary,
    fontSize: 12,
    marginBottom: 2,
  },
  value: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
});
