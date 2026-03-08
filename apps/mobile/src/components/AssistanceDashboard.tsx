import type { CvLiveSummary, EmergencySessionStatus } from "@rescuesight/shared";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { CvStatusPanel } from "./panels/CvStatusPanel";
import { GuidancePanel } from "./panels/GuidancePanel";
import { SessionInfoPanel } from "./panels/SessionInfoPanel";
import { VisualScenePanel } from "./panels/VisualScenePanel";
import { VoiceAgentPanel } from "./panels/VoiceAgentPanel";
import { palette } from "../theme/palette";
import { formatDateTime } from "../utils/format";

interface AssistanceDashboardProps {
  summary: CvLiveSummary | null;
  connectedAtIso: string | null;
  sessionId: string | null;
  sessionStatus: EmergencySessionStatus | null;
  statusMessage: string;
}

export const AssistanceDashboard = ({
  summary,
  connectedAtIso,
  sessionId,
  sessionStatus,
  statusMessage,
}: AssistanceDashboardProps) => {
  const { width } = useWindowDimensions();
  const isWide = width >= 950;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Emergency Session Active</Text>
        <Text style={styles.title}>Live Assistance Console</Text>
        <Text style={styles.subtitle}>{statusMessage}</Text>
        <Text style={styles.meta}>Started: {formatDateTime(connectedAtIso)}</Text>
      </View>

      {isWide ? (
        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <VisualScenePanel summary={summary} sessionId={sessionId} />
            <CvStatusPanel summary={summary} connectedAtIso={connectedAtIso} />
          </View>
          <View style={styles.rightColumn}>
            <GuidancePanel />
            <VoiceAgentPanel summary={summary} />
            <SessionInfoPanel
              summary={summary}
              connectedAtIso={connectedAtIso}
              sessionId={sessionId}
              sessionStatus={sessionStatus}
            />
          </View>
        </View>
      ) : (
        <View>
          <VisualScenePanel summary={summary} sessionId={sessionId} />
          <CvStatusPanel summary={summary} connectedAtIso={connectedAtIso} />
          <GuidancePanel />
          <VoiceAgentPanel summary={summary} />
          <SessionInfoPanel
            summary={summary}
            connectedAtIso={connectedAtIso}
            sessionId={sessionId}
            sessionStatus={sessionStatus}
          />
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    padding: 12,
  },
  hero: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.panelBorder,
  },
  kicker: {
    color: palette.cyan,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 5,
    color: palette.textPrimary,
    fontSize: 23,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 5,
    color: palette.textSecondary,
    fontSize: 14,
  },
  meta: {
    marginTop: 6,
    color: palette.textSecondary,
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  leftColumn: {
    flex: 1.2,
  },
  rightColumn: {
    flex: 0.8,
  },
});
