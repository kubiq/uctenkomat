import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { isConfigured } from "../accounting";
import { showAlert } from "../ui";
import type { Settings } from "../types";

type Props = {
  settings: Settings;
  onSelected: (uris: string[]) => void;
  onOpenSettings: () => void;
};

const isWeb = Platform.OS === "web";

export default function CaptureScreen({ settings, onSelected, onOpenSettings }: Props) {
  const needsSettings = !isConfigured(settings);

  function guard(): boolean {
    if (needsSettings) {
      showAlert("Setup needed", "Set your OpenAI and Fakturoid keys in Settings first.");
      return false;
    }
    return true;
  }

  async function takePhoto() {
    if (!guard()) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return showAlert("Permission denied", "Cannot access the camera.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (!result.canceled && result.assets?.length) onSelected(result.assets.map((a) => a.uri));
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
      allowsMultipleSelection: isWeb, // desktop/web: pick several receipts at once
    });
    if (!result.canceled && result.assets?.length) onSelected(result.assets.map((a) => a.uri));
  }

  return (
    <View style={styles.container}>
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
        {isWeb && <Text style={styles.muted}>You can select multiple images — each is processed as its own receipt.</Text>}
        {needsSettings && <Text style={styles.warn}>Set your keys in Settings ⚙︎</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700" },
  gear: { fontSize: 24 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  primary: { backgroundColor: "#2563eb", paddingVertical: 16, paddingHorizontal: 40, borderRadius: 12 },
  primaryText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  secondary: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12, borderWidth: 1, borderColor: "#cbd5e1" },
  secondaryText: { color: "#334155", fontSize: 16, fontWeight: "500" },
  muted: { color: "#64748b", textAlign: "center", maxWidth: 360 },
  warn: { color: "#b45309", marginTop: 8 },
});
