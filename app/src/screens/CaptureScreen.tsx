import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { parseReceipt } from "../api";
import type { Receipt, Settings } from "../types";

type Props = {
  settings: Settings;
  onParsed: (receipt: Receipt, imageUri: string) => void;
  onOpenSettings: () => void;
};

// Downscale before upload: smaller upload + fewer image tokens (lower cost/latency).
async function prepare(uri: string): Promise<string> {
  const out = await manipulateAsync(uri, [{ resize: { width: 1500 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
  });
  return out.uri;
}

export default function CaptureScreen({ settings, onParsed, onOpenSettings }: Props) {
  const [busy, setBusy] = useState(false);

  const needsSettings = !settings.baseUrl || !settings.apiKey;

  async function run(pick: () => Promise<ImagePicker.ImagePickerResult>, askPerm: () => Promise<ImagePicker.PermissionResponse>) {
    if (needsSettings) {
      Alert.alert("Setup needed", "Set the server URL and API key in Settings first.");
      return;
    }
    const perm = await askPerm();
    if (!perm.granted) {
      Alert.alert("Permission denied", "Cannot access camera / photos.");
      return;
    }
    const result = await pick();
    if (result.canceled || !result.assets?.[0]) return;

    setBusy(true);
    try {
      const uri = await prepare(result.assets[0].uri);
      const receipt = await parseReceipt(settings, uri);
      onParsed(receipt, uri);
    } catch (e: any) {
      Alert.alert("Parsing failed", e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const takePhoto = () =>
    run(
      () => ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 }),
      () => ImagePicker.requestCameraPermissionsAsync(),
    );

  const pickPhoto = () =>
    run(
      () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 }),
      () => ImagePicker.requestMediaLibraryPermissionsAsync(),
    );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Receipt → Fakturoid</Text>
        <Pressable onPress={onOpenSettings} hitSlop={12}>
          <Text style={styles.gear}>⚙︎</Text>
        </Pressable>
      </View>

      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.muted}>Reading the receipt…</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Pressable style={styles.primary} onPress={takePhoto}>
            <Text style={styles.primaryText}>Take photo</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={pickPhoto}>
            <Text style={styles.secondaryText}>Pick from gallery</Text>
          </Pressable>
          {needsSettings && (
            <Text style={styles.warn}>Set server URL + API key in Settings ⚙︎</Text>
          )}
        </View>
      )}
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
  muted: { color: "#64748b", marginTop: 12 },
  warn: { color: "#b45309", marginTop: 8 },
});
