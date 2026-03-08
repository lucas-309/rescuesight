import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "../theme/palette";

interface LandingScreenProps {
  onEmergencyPress: () => void;
  statusMessage: string;
  errorMessage: string | null;
}

export const LandingScreen = ({
  onEmergencyPress,
  statusMessage,
  errorMessage,
}: LandingScreenProps) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.02,
          duration: 1400,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [pulse]);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>RescueSight Emergency Assist</Text>
        <Text style={styles.title}>Emergency Response Mode</Text>
        <Text style={styles.subtitle}>
          Initiate emergency assistance to connect the live computer vision model and open guided
          response tools.
        </Text>
      </View>

      <Animated.View style={[styles.emergencyPulse, { transform: [{ scale: pulse }] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Activate emergency assistance"
          style={({ pressed }) => [styles.emergencyButton, pressed && styles.emergencyButtonPressed]}
          onPress={onEmergencyPress}
        >
          <Text style={styles.emergencyLabel}>EMERGENCY</Text>
          <Text style={styles.emergencySubLabel}>Press to Start Assistance</Text>
        </Pressable>
      </Animated.View>

      <Text style={styles.status}>{statusMessage}</Text>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: palette.background,
  },
  hero: {
    width: "100%",
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginBottom: 24,
    backgroundColor: "rgba(20, 30, 47, 0.88)",
    borderWidth: 1,
    borderColor: palette.panelBorder,
  },
  kicker: {
    color: palette.cyan,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    color: palette.textPrimary,
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  emergencyButton: {
    width: "100%",
    minHeight: 140,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 149, 149, 0.35)",
    backgroundColor: palette.emergency,
    shadowColor: palette.emergency,
    shadowOpacity: 0.36,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  emergencyPulse: {
    width: "100%",
  },
  emergencyButtonPressed: {
    transform: [{ scale: 0.985 }],
    backgroundColor: palette.emergencyPressed,
  },
  emergencyLabel: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 1,
  },
  emergencySubLabel: {
    marginTop: 4,
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "600",
  },
  status: {
    marginTop: 16,
    color: palette.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },
  error: {
    marginTop: 10,
    color: palette.danger,
    fontSize: 14,
    textAlign: "center",
  },
});
