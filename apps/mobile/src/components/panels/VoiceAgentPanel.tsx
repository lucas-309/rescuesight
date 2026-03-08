import type { CvLiveSummary } from "@rescuesight/shared";
import { useMemo, useState, type ComponentType } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ELEVENLABS_AGENT_ID } from "../../config/env";
import { palette } from "../../theme/palette";
import { formatCvContextForVoiceAgent } from "../../utils/voiceContext";
import { PanelCard } from "../PanelCard";

interface VoiceAgentPanelProps {
  summary: CvLiveSummary | null;
}

type MinimalWebViewProps = {
  source: { html: string };
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  allowsInlineMediaPlayback?: boolean;
  mediaPlaybackRequiresUserAction?: boolean;
  style?: object;
};

type WebViewComponent = ComponentType<MinimalWebViewProps>;

let WebViewImpl: WebViewComponent | null = null;
try {
  const webViewModule = require("react-native-webview") as { WebView?: WebViewComponent };
  if (webViewModule.WebView) {
    WebViewImpl = webViewModule.WebView;
  }
} catch {
  WebViewImpl = null;
}

const buildVoiceWidgetHtml = (agentId: string, cvContext: string): string => {
  const safeAgentId = agentId.replace(/"/g, "");
  const contextLiteral = JSON.stringify(cvContext);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://unpkg.com/@elevenlabs/convai-widget-embed@0.10.2" type="text/javascript"></script>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #060a12;
      }
      .wrap {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: stretch;
        justify-content: stretch;
      }
      elevenlabs-convai {
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <elevenlabs-convai
        id="voice-agent"
        agent-id="${safeAgentId}"
        variant="full"
        action-text="Voice CPR guide"
        start-call-text="Start"
      ></elevenlabs-convai>
    </div>
    <script>
      (function () {
        var contextValue = ${contextLiteral};
        var widget = document.getElementById("voice-agent");
        if (widget) {
          widget.setAttribute("cv-context", contextValue);
        }
      })();
    </script>
  </body>
</html>`;
};

export const VoiceAgentPanel = ({ summary }: VoiceAgentPanelProps) => {
  const [open, setOpen] = useState(false);
  const cvContext = useMemo(() => formatCvContextForVoiceAgent(summary), [summary]);
  const widgetHtml = useMemo(
    () => buildVoiceWidgetHtml(ELEVENLABS_AGENT_ID, cvContext),
    [cvContext],
  );
  const webViewKey = useMemo(
    () => `${ELEVENLABS_AGENT_ID}:${cvContext.length}:${cvContext.slice(0, 24)}`,
    [cvContext],
  );

  const unsupportedMessage =
    Platform.OS === "web"
      ? "Voice agent panel is intended for iOS/Android app runtime. Use web dashboard widget on desktop."
      : "Voice panel requires react-native-webview. Install it with: npx expo install react-native-webview";

  return (
    <>
      <PanelCard title="Voice Agent">
        <Text style={styles.description}>
          Start a live voice conversation in-app. The agent receives current CV context (person-down,
          placement, BPM, visibility, location) for targeted coaching.
        </Text>
        <Text style={styles.meta}>
          {summary ? "CV context: live" : "CV context: waiting for first live summary"}
        </Text>
        <Text style={styles.meta}>Agent ID: {ELEVENLABS_AGENT_ID}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
        >
          <Text style={styles.buttonLabel}>Open Voice CPR Guide</Text>
        </Pressable>
        {!WebViewImpl ? <Text style={styles.warning}>{unsupportedMessage}</Text> : null}
      </PanelCard>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        presentationStyle="fullScreen"
      >
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Voice CPR Guide</Text>
              <Text style={styles.modalSubtitle}>Tap Start, allow microphone, then speak naturally.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={({ pressed }) => [styles.closeButton, pressed ? styles.closeButtonPressed : null]}
            >
              <Text style={styles.closeButtonLabel}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            {WebViewImpl ? (
              <WebViewImpl
                key={webViewKey}
                source={{ html: widgetHtml }}
                originWhitelist={["*"]}
                javaScriptEnabled={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                style={styles.webview}
              />
            ) : (
              <View style={styles.fallbackBox}>
                <Text style={styles.warning}>{unsupportedMessage}</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  description: {
    color: palette.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  meta: {
    color: palette.textSecondary,
    fontSize: 11,
    marginBottom: 4,
  },
  button: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: palette.cyan,
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonLabel: {
    color: "#041018",
    fontSize: 14,
    fontWeight: "700",
  },
  warning: {
    marginTop: 8,
    color: palette.warning,
    fontSize: 12,
    lineHeight: 18,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: palette.background,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.panelBorder,
  },
  modalTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: palette.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: palette.backgroundAlt,
  },
  closeButtonPressed: {
    opacity: 0.78,
  },
  closeButtonLabel: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  modalBody: {
    flex: 1,
    padding: 10,
  },
  webview: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: palette.backgroundAlt,
  },
  fallbackBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    backgroundColor: palette.panel,
  },
});
