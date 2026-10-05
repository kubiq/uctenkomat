import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import { isConfigured } from "../accounting";
import { capturePhoto, pickImageUris } from "../pickers";
import { showAlert } from "../ui";
import { useI18n } from "../i18n";
import type { PickedFile, Settings } from "../types";

type Props = {
  settings: Settings;
  onSelected: (files: PickedFile[]) => void;
  onMultiPage: () => void;
  onOpenSettings: () => void;
};

const isWeb = Platform.OS === "web";

export default function CaptureScreen({ settings, onSelected, onMultiPage, onOpenSettings }: Props) {
  const { t } = useI18n();
  const needsSettings = !isConfigured(settings);

  function guard(): boolean {
    if (needsSettings) {
      showAlert(t("alerts.setupNeededTitle"), t("alerts.setupNeededMsg"));
      return false;
    }
    return true;
  }

  async function takePhoto() {
    if (!guard()) return;
    const uri = await capturePhoto();
    if (uri) onSelected([{ uri, isPdf: false }]);
  }

  async function pickImages() {
    if (!guard()) return;
    const uris = await pickImageUris(isWeb);
    if (uris.length) onSelected(uris.map((uri) => ({ uri, isPdf: false })));
  }

  async function pickPdfs() {
    if (!guard()) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true,
      base64: true, // web only; native reads base64 lazily off disk
    });
    if (!result.canceled && result.assets?.length)
      onSelected(result.assets.map((a) => ({ uri: a.uri, isPdf: true, base64: a.base64, name: a.name })));
  }

  function multiPage() {
    if (guard()) onMultiPage();
  }

  return (
    <LinearGradient colors={["#3b82f6", "#1d4ed8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Účtenkomat</Text>
        <Pressable onPress={onOpenSettings} hitSlop={12}>
          <Text style={styles.gear}>⚙︎</Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        <View style={styles.buttons}>
          {!isWeb && (
            <Pressable style={styles.primary} onPress={takePhoto}>
              <Text style={styles.primaryText}>{t("capture.takePhoto")}</Text>
            </Pressable>
          )}
          <Pressable style={isWeb ? styles.primary : styles.secondary} onPress={pickImages}>
            <Text style={isWeb ? styles.primaryText : styles.secondaryText}>
              {isWeb ? t("capture.selectImages") : t("capture.pickGallery")}
            </Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={multiPage}>
            <Text style={styles.secondaryText}>{t("capture.multiPage")}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={pickPdfs}>
            <Text style={styles.secondaryText}>{t("capture.selectPdf")}</Text>
          </Pressable>
        </View>
        {isWeb && <Text style={styles.muted}>{t("capture.multiHint")}</Text>}
        {needsSettings && <Text style={styles.warn}>{t("capture.setKeysHint")}</Text>}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "800", color: "#fff" },
  gear: { fontSize: 24, color: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  // One fixed-width column so every button lines up regardless of label length.
  buttons: { width: "100%", maxWidth: 320, gap: 14 },
  primary: { minHeight: 58, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, backgroundColor: "#fff", borderRadius: 12, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  primaryText: { color: "#1d4ed8", fontSize: 18, fontWeight: "700", textAlign: "center" },
  secondary: { minHeight: 52, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)" },
  secondaryText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
  muted: { color: "rgba(255,255,255,0.85)", textAlign: "center", maxWidth: 360 },
  warn: { color: "#fde68a", marginTop: 8, fontWeight: "600" },
});
