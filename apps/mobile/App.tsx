import { Alert, StatusBar, StyleSheet, View } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AssistanceDashboard } from "./src/components/AssistanceDashboard";
import { ConnectingScreen } from "./src/components/ConnectingScreen";
import { LandingScreen } from "./src/components/LandingScreen";
import { useEmergencySession } from "./src/hooks/useEmergencySession";
import { palette } from "./src/theme/palette";

const App = () => {
  const { state, startEmergencySession } = useEmergencySession();

  const confirmEmergencyStart = () => {
    Alert.alert(
      "Start emergency assistance?",
      "This will connect to your CV backend and open the live emergency dashboard.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start",
          style: "destructive",
          onPress: () => {
            void startEmergencySession();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <ExpoStatusBar style="light" />
        <StatusBar barStyle="light-content" />
        <BackgroundDecor />

        {state.phase === "connecting" ? <ConnectingScreen statusMessage={state.statusMessage} /> : null}

        {state.phase === "connected" ? (
          <AssistanceDashboard
            summary={state.summary}
            connectedAtIso={state.connectedAtIso}
            statusMessage={state.statusMessage}
          />
        ) : null}

        {(state.phase === "idle" || state.phase === "error") && (
          <LandingScreen
            onEmergencyPress={confirmEmergencyStart}
            statusMessage={state.statusMessage}
            errorMessage={state.errorMessage}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const BackgroundDecor = () => (
  <View style={StyleSheet.absoluteFill}>
    <View style={styles.glowTop} />
    <View style={styles.glowBottom} />
  </View>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  glowTop: {
    position: "absolute",
    top: -100,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(52, 208, 227, 0.12)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -120,
    left: -70,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(214, 50, 61, 0.13)",
  },
});

export default App;
