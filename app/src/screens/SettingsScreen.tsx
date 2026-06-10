import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { checkHealth } from "../api";
import { saveSettings } from "../storage";
import { normalizeBaseUrl } from "../url";
import type { Settings } from "../types";

type Props = {
  initial: Settings;
  onSaved: (s: Settings) => void;
  onBack: () => void;
};

export default function SettingsScreen({ initial, onSaved, onBack }: Props) {
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [testing, setTesting] = useState(false);

  async function test() {
    const r = normalizeBaseUrl(baseUrl);
    if ("error" in r) {
      Alert.alert("Invalid URL", r.error);
      return;
    }
    setBaseUrl(r.url); // reflect the corrected URL (e.g. http:// prepended)
    setTesting(true);
    try {
      const ok = await checkHealth(r.url);
      Alert.alert(ok ? "Connected" : "No response", ok ? "Server is reachable." : "Health check failed.");
    } catch (e: any) {
      Alert.alert("Connection failed", e?.message ?? String(e));
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    const r = normalizeBaseUrl(baseUrl);
    if ("error" in r) {
      Alert.alert("Invalid URL", r.error);
      return;
    }
    if (!apiKey.trim()) {
      Alert.alert("API key required", "Enter the API key (APP_API_KEY from the server).");
      return;
    }
    const next = { baseUrl: r.url, apiKey: apiKey.trim() };
    setBaseUrl(r.url);
    await saveSettings(next);
    onSaved(next);
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 48 }} />
      </View>

      <Text style={styles.label}>Server URL</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://10.69.69.200:3300"
        value={baseUrl}
        onChangeText={setBaseUrl}
      />
      <Text style={styles.hint}>Include the protocol — http:// for LAN dev, https:// for a deployed server.</Text>

      <Text style={styles.label}>API key</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="APP_API_KEY"
        value={apiKey}
        onChangeText={setApiKey}
      />

      <Pressable style={styles.secondary} onPress={test} disabled={testing}>
        <Text style={styles.secondaryText}>{testing ? "Testing…" : "Test connection"}</Text>
      </Pressable>
      <Pressable style={styles.primary} onPress={save}>
        <Text style={styles.primaryText}>Save</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 56, backgroundColor: "#fff" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  back: { color: "#2563eb", fontSize: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  label: { fontSize: 13, color: "#475569", marginTop: 16, marginBottom: 4 },
  hint: { fontSize: 12, color: "#94a3b8", marginTop: 6 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 15 },
  secondary: { marginTop: 24, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center" },
  secondaryText: { color: "#334155", fontSize: 16, fontWeight: "500" },
  primary: { marginTop: 12, backgroundColor: "#2563eb", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
