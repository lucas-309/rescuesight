import type { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette } from "../theme/palette";

interface PanelCardProps extends PropsWithChildren {
  title: string;
}

export const PanelCard = ({ title, children }: PanelCardProps) => (
  <View style={styles.card}>
    <Text style={styles.title}>{title}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  title: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
});
