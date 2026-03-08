import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { palette } from "../theme/palette";

interface ConnectingScreenProps {
  statusMessage: string;
}

export const ConnectingScreen = ({ statusMessage }: ConnectingScreenProps) => (
  <View style={styles.container}>
    <View style={styles.loaderCard}>
      <ActivityIndicator size="large" color={palette.cyan} />
      <Text style={styles.title}>Connecting...</Text>
      <Text style={styles.subtitle}>{statusMessage}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loaderCard: {
    width: "100%",
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: "center",
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.panelBorder,
  },
  title: {
    marginTop: 16,
    color: palette.textPrimary,
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 8,
    color: palette.textSecondary,
    fontSize: 15,
    textAlign: "center",
  },
});
