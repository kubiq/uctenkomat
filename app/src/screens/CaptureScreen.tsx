import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { isConfigured } from "../accounting";
import { showAlert } from "../ui";
import type { PickedFile, Settings } from "../types";

type Props = {
  settings: Settings;
  onSelected: (files: PickedFile[]) => void;
  onOpenSettings: () => void;
};

const isWeb = Platform.OS === "web";

export default function CaptureScreen({ settings, onSelected, onOpenSettings }: Props) {
  const needsSettings = !isConfigured(settings);

  function guard(): boolean {
    if (needsSettings) {
      showAlert("Setup needed", "Set your OpenAI and Fakturoid/iDoklad keys in Settings first.");
      return false;
    }
    return true;
  }

  async function takePhoto() {
    if (!guard()) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return showAlert("Permission denied", "Cannot access the camera.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (!result.canceled && result.assets?.length)
      onSelected(result.assets.map((a) => ({ uri: a.uri, isPdf: false })));
  }

  async function pickImages() {
    if (!guard()) return;
    if (!isWeb) {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return showAlert("Permission denied", "Cannot access photos.");
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsMultipleSelection: isWeb,
    });
    if (!result.canceled && result.assets?.length)
      onSelected(result.assets.map((a) => ({ uri: a.uri, isPdf: false })));
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

  return (
    <LinearGradient colors={["#3b82f6", "#1d4ed8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Účtenkomat</Text>
        <Pressable onPress={onOpenSettings} hitSlop={12}>
          <Text style={styles.gear}>⚙︎</Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        {!isWeb && (
          <Pressable style={styles.primary} onPress={takePhoto}>
            <Text style={styles.primaryText}>Take photo</Text>
          </Pressable>
        )}
        <Pressable style={isWeb ? styles.primary : styles.secondary} onPress={pickImages}>
          <Text style={isWeb ? styles.primaryText : styles.secondaryText}>
            {isWeb ? "Select receipt images" : "Pick from gallery"}
          </Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={pickPdfs}>
          <Text style={styles.secondaryText}>Select PDF</Text>
        </Pressable>
        {isWeb && <Text style={styles.muted}>You can select multiple images or PDFs — each is processed as its own receipt.</Text>}
        {needsSettings && <Text style={styles.warn}>Set your keys in Settings ⚙︎</Text>}
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
  primary: { backgroundColor: "#fff", paddingVertical: 16, paddingHorizontal: 40, borderRadius: 12, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  primaryText: { color: "#1d4ed8", fontSize: 18, fontWeight: "700" },
  secondary: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)" },
  secondaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  muted: { color: "rgba(255,255,255,0.85)", textAlign: "center", maxWidth: 360 },
  warn: { color: "#fde68a", marginTop: 8, fontWeight: "600" },
});
