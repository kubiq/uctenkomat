import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { checkOpenAiKey } from "../openai";
import { PROVIDERS, getProvider, providerCreds } from "../accounting";
import { saveSettings } from "../storage";
import { useKeyboardHeight } from "../keyboard";
import { showAlert } from "../ui";
import type { ProviderId, Settings } from "../types";

type Props = {
  initial: Settings;
  onChange: (s: Settings) => void; // update app state (no navigation)
  onClose: () => void;
};

const OPENAI_BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";

// Trim values when persisting (raw stays in the fields for smooth typing).
function trimmed(s: Settings): Settings {
  return {
    openaiApiKey: s.openaiApiKey.trim(),
    provider: s.provider,
    creds: Object.fromEntries(Object.entries(s.creds).map(([k, v]) => [k, (v ?? "").trim()])),
  };
}

export default function SettingsScreen({ initial, onChange, onClose }: Props) {
  const [s, setS] = useState<Settings>(initial);
  const [testing, setTesting] = useState(false);
  const mounted = useRef(false);

  const provider = getProvider(s.provider);
  const kb = useKeyboardHeight();

  function persist(next: Settings) {
    const t = trimmed(next);
    onChange(t);
    saveSettings(t);
  }

  // Auto-save: debounce persistence whenever settings change.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const id = setTimeout(() => persist(s), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const setOpenAi = (v: string) => setS((p) => ({ ...p, openaiApiKey: v }));
  const setProvider = (id: ProviderId) => setS((p) => ({ ...p, provider: id }));
  const setCred = (fieldKey: string, v: string) =>
    setS((p) => ({ ...p, creds: { ...p.creds, [`${p.provider}.${fieldKey}`]: v } }));
  const credValue = (fieldKey: string) => s.creds[`${s.provider}.${fieldKey}`] ?? "";

  function close() {
    persist(s); // flush any pending debounce before leaving
    onClose();
  }

  async function test() {
    setTesting(true);
    try {
      const t = trimmed(s);
      const openaiOk = t.openaiApiKey ? await checkOpenAiKey(t.openaiApiKey) : false;
      let providerLine: string;
      try {
        await provider.check(providerCreds(t));
        providerLine = `${provider.label}: ✓ ok`;
      } catch (e: any) {
        providerLine = `${provider.label}: ✗ ${e?.message ?? "failed"}`;
      }
      showAlert("Connection test", `OpenAI: ${openaiOk ? "✓ ok" : "✗ failed"}\n${providerLine}`);
    } catch (e: any) {
      showAlert("Test failed", e?.message ?? String(e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 24 + kb }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Pressable onPress={close} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 48 }} />
      </View>

      <Text style={styles.group}>OpenAI</Text>
      <Field label="API key" value={s.openaiApiKey} onChange={setOpenAi} secure placeholder="sk-…" />
      <Text style={styles.hint}>Your own key from platform.openai.com. ~$0.01 per receipt.</Text>
      <Pressable onPress={() => Linking.openURL(OPENAI_BILLING_URL)} hitSlop={8}>
        <Text style={styles.link}>Add OpenAI credit →</Text>
      </Pressable>

      <Text style={styles.group}>Accounting service</Text>
      <View style={styles.providerRow}>
        {PROVIDERS.map((p) => (
          <Pressable
            key={p.id}
            style={[styles.providerChip, s.provider === p.id && styles.providerChipActive]}
            onPress={() => setProvider(p.id)}
          >
            <Text style={[styles.providerChipText, s.provider === p.id && styles.providerChipTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>{provider.setupHint}</Text>
      {provider.credentialFields.map((f) => (
        <Field
          key={f.key}
          label={f.label}
          value={credValue(f.key)}
          onChange={(v) => setCred(f.key, v)}
          secure={f.secret}
          placeholder={f.placeholder}
        />
      ))}

      <Pressable style={styles.secondary} onPress={test} disabled={testing}>
        <Text style={styles.secondaryText}>{testing ? "Testing…" : "Test connection"}</Text>
      </Pressable>
      <Text style={styles.savedNote}>Changes are saved automatically.</Text>
      <Text style={styles.version}>Účtenkomat v{Constants.expoConfig?.version ?? "?"}</Text>
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
        placeholderTextColor="#94a3b8"
        value={value}
        onChangeText={onChange}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 56 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  back: { color: "#2563eb", fontSize: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  group: { fontSize: 16, fontWeight: "700", marginTop: 22, marginBottom: 6 },
  label: { fontSize: 13, color: "#475569", marginTop: 12, marginBottom: 4 },
  hint: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  link: { fontSize: 13, color: "#2563eb", fontWeight: "600", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 15, color: "#0f172a", backgroundColor: "#fff" },
  providerRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  providerChip: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, borderColor: "#cbd5e1" },
  providerChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  providerChipText: { color: "#334155", fontWeight: "600" },
  providerChipTextActive: { color: "#fff" },
  secondary: { marginTop: 24, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center" },
  secondaryText: { color: "#334155", fontSize: 16, fontWeight: "500" },
  savedNote: { textAlign: "center", color: "#94a3b8", fontSize: 12, marginTop: 14 },
  version: { textAlign: "center", color: "#cbd5e1", fontSize: 11, marginTop: 6 },
});
