import { StyleSheet, Text, View } from "react-native";
import { PanelCard } from "../PanelCard";
import { palette } from "../../theme/palette";

export const GuidancePanel = () => (
  <PanelCard title="Guidance Overlay (AI-Ready)">
    <GuidanceRow label="Current emergency step" value="Scene safety and patient responsiveness check" />
    <GuidanceRow label="Highlighted body region" value="Chest center (sternum landmark zone)" />
    <GuidanceRow label="Recommended action" value="Prepare for guided CPR hand placement workflow" />
    <GuidanceRow label="Next instruction" value="Awaiting first confirmed body landmark lock from CV model" />
    <Text style={styles.note}>
      Live voice guidance is available in the Voice Agent panel. Keep this overlay visible for
      visual + voice cue coordination.
    </Text>
  </PanelCard>
);

interface GuidanceRowProps {
  label: string;
  value: string;
}

const GuidanceRow = ({ label, value }: GuidanceRowProps) => (
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
  note: {
    marginTop: 6,
    color: palette.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
