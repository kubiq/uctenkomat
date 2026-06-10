import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { checkOpenAiKey } from "../openai";
import { checkFakturoid } from "../fakturoid";
import { saveSettings } from "../storage";
import type { Settings } from "../types";

type Props = {
  initial: Settings;
  onSaved: (s: Settings) => void;
  onBack: () => void;
};

export default function SettingsScreen({ initial, onSaved, onBack }: Props) {
  const [s, setS] = useState<Settings>(initial);
  const [testing, setTesting] = useState(false);

  const set = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));

  async function test() {
    setTesting(true);
    try {
      const openaiOk = s.openaiApiKey ? await checkOpenAiKey(s.openaiApiKey.trim()) : false;
      let fakturoidOk = false;
      try {
        fakturoidOk = await checkFakturoid({
          ...s,
          fakturoidClientId: s.fakturoidClientId.trim(),
          fakturoidClientSecret: s.fakturoidClientSecret.trim(),
          fakturoidSlug: s.fakturoidSlug.trim(),
        });
      } catch {
        fakturoidOk = false;
      }
      Alert.alert(
        "Connection test",
        `OpenAI: ${openaiOk ? "✓ ok" : "✗ failed"}\nFakturoid: ${fakturoidOk ? "✓ ok" : "✗ failed"}`,
      );
    } catch (e: any) {
      Alert.alert("Test failed", e?.message ?? String(e));
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    const trimmed: Settings = {
      openaiApiKey: s.openaiApiKey.trim(),
      fakturoidClientId: s.fakturoidClientId.trim(),
      fakturoidClientSecret: s.fakturoidClientSecret.trim(),
      fakturoidSlug: s.fakturoidSlug.trim().replace(/^https?:\/\/[^/]+\//, "").replace(/\/.*$/, ""),
    };
    const missing = Object.entries(trimmed).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      Alert.alert("Missing fields", `Please fill in: ${missing.join(", ")}`);
      return;
    }
    await saveSettings(trimmed);
    onSaved(trimmed);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 48 }} />
      </View>

      <Text style={styles.group}>OpenAI</Text>
      <Field label="API key" value={s.openaiApiKey} onChange={(t) => set({ openaiApiKey: t })} secure placeholder="sk-…" />
      <Text style={styles.hint}>Your own key from platform.openai.com. ~$0.01 per receipt.</Text>

      <Text style={styles.group}>Fakturoid</Text>
      <Text style={styles.hint}>Create an app in Fakturoid → Nastavení → API / Propojení aplikací (Client Credentials).</Text>
      <Field label="Client ID" value={s.fakturoidClientId} onChange={(t) => set({ fakturoidClientId: t })} />
      <Field label="Client secret" value={s.fakturoidClientSecret} onChange={(t) => set({ fakturoidClientSecret: t })} secure />
      <Field label="Account slug" value={s.fakturoidSlug} onChange={(t) => set({ fakturoidSlug: t })} placeholder="from app.fakturoid.cz/<slug>/…" />

      <Pressable style={styles.secondary} onPress={test} disabled={testing}>
        <Text style={styles.secondaryText}>{testing ? "Testing…" : "Test connection"}</Text>
      </Pressable>
      <Pressable style={styles.primary} onPress={save}>
        <Text style={styles.primaryText}>Save</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  secure?: boolean;
  placeholder?: string;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 56, backgroundColor: "#fff" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  back: { color: "#2563eb", fontSize: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  group: { fontSize: 16, fontWeight: "700", marginTop: 22, marginBottom: 6 },
  label: { fontSize: 13, color: "#475569", marginTop: 12, marginBottom: 4 },
  hint: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 15 },
  secondary: { marginTop: 24, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center" },
  secondaryText: { color: "#334155", fontSize: 16, fontWeight: "500" },
  primary: { marginTop: 12, backgroundColor: "#2563eb", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
