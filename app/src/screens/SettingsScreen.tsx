import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { checkOpenAiKey } from "../openai";
import { PROVIDERS, getProvider, providerCreds } from "../accounting";
import { saveSettings } from "../storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardHeight } from "../keyboard";
import { showAlert } from "../ui";
import { useI18n } from "../i18n";
import { SUPPORTED_LANGUAGES, type LanguagePref, type ProviderId, type Settings } from "../types";

type Props = {
  initial: Settings;
  onChange: (s: Settings) => void; // update app state (no navigation)
  onClose: () => void;
};

const OPENAI_BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";

// Native language names for the picker (endonyms); "system" label is translated.
const LANGUAGE_ENDONYMS: Record<string, string> = { en: "English", cs: "Čeština", de: "Deutsch", sk: "Slovenčina" };

// Trim values when persisting (raw stays in the fields for smooth typing).
// Spread `s` so fields we don't touch (provider, recentTags, language) survive.
function trimmed(s: Settings): Settings {
  return {
    ...s,
    openaiApiKey: s.openaiApiKey.trim(),
    ico: (s.ico ?? "").trim(),
    vatId: (s.vatId ?? "").trim(),
    creds: Object.fromEntries(Object.entries(s.creds).map(([k, v]) => [k, (v ?? "").trim()])),
  };
}

export default function SettingsScreen({ initial, onChange, onClose }: Props) {
  const { t } = useI18n();
  const [s, setS] = useState<Settings>(initial);
  const [testing, setTesting] = useState(false);
  const mounted = useRef(false);

  const provider = getProvider(s.provider);
  const kb = useKeyboardHeight();
  const insets = useSafeAreaInsets();

  function persist(next: Settings) {
    const tv = trimmed(next);
    onChange(tv);
    saveSettings(tv);
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
  const setIco = (v: string) => setS((p) => ({ ...p, ico: v }));
  const setVatId = (v: string) => setS((p) => ({ ...p, vatId: v }));
  const setProvider = (id: ProviderId) => setS((p) => ({ ...p, provider: id }));
  // Apply the language immediately (bypass the debounce) so the UI re-translates now.
  const setLanguage = (language: LanguagePref) => {
    const next = { ...s, language };
    setS(next);
    persist(next);
  };
  const currentLanguage: LanguagePref = s.language ?? "system";
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
      const tv = trimmed(s);
      const openaiOk = tv.openaiApiKey ? await checkOpenAiKey(tv.openaiApiKey) : false;
      let providerStatus: string;
      try {
        await provider.check(providerCreds(tv));
        providerStatus = t("alerts.ok");
      } catch (e: any) {
        providerStatus = t("alerts.providerFail", { msg: e?.message ?? t("alerts.failed") });
      }
      const openaiLine = t("alerts.openaiLine", { status: openaiOk ? t("alerts.ok") : t("alerts.failed") });
      const providerLine = t("alerts.providerLine", { label: provider.label, status: providerStatus });
      showAlert(t("alerts.connectionTestTitle"), `${openaiLine}\n${providerLine}`);
    } catch (e: any) {
      showAlert(t("alerts.testFailedTitle"), e?.message ?? String(e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      // Clear the keyboard when open, else the Android navigation bar (edge-to-edge).
      contentContainerStyle={[styles.content, { paddingBottom: 24 + (kb || insets.bottom) }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Pressable onPress={close} hitSlop={12}>
          <Text style={styles.back}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("settings.title")}</Text>
        <View style={{ width: 48 }} />
      </View>

      <Text style={styles.group}>{t("settings.openai")}</Text>
      <Field label={t("settings.apiKey")} value={s.openaiApiKey} onChange={setOpenAi} secure placeholder="sk-…" />
      <Text style={styles.hint}>{t("settings.apiKeyHint")}</Text>
      <Pressable onPress={() => Linking.openURL(OPENAI_BILLING_URL)} hitSlop={8}>
        <Text style={styles.link}>{t("settings.addCredit")}</Text>
      </Pressable>

      <Text style={styles.group}>{t("settings.accountingService")}</Text>
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
      <Text style={styles.hint}>{t(provider.setupHint)}</Text>
      {provider.credentialFields.map((f) => (
        <Field
          key={f.key}
          label={t(f.label)}
          value={credValue(f.key)}
          onChange={(v) => setCred(f.key, v)}
          secure={f.secret}
          placeholder={f.placeholder ? t(f.placeholder) : undefined}
        />
      ))}

      <Pressable style={styles.secondary} onPress={test} disabled={testing}>
        <Text style={styles.secondaryText}>{testing ? t("settings.testing") : t("settings.test")}</Text>
      </Pressable>

      <Text style={styles.group}>{t("settings.vat")}</Text>
      <Field label={t("settings.ico")} value={s.ico ?? ""} onChange={setIco} placeholder={t("settings.icoPlaceholder")} />
      <Field label={t("settings.vatId")} value={s.vatId ?? ""} onChange={setVatId} placeholder={t("settings.vatIdPlaceholder")} />
      <Text style={styles.hint}>{t("settings.vatHint")}</Text>

      <Text style={styles.group}>{t("settings.language")}</Text>
      <View style={styles.langRow}>
        {(["system", ...SUPPORTED_LANGUAGES] as LanguagePref[]).map((lang) => (
          <Pressable
            key={lang}
            style={[styles.providerChip, currentLanguage === lang && styles.providerChipActive]}
            onPress={() => setLanguage(lang)}
          >
            <Text style={[styles.providerChipText, currentLanguage === lang && styles.providerChipTextActive]}>
              {lang === "system" ? t("settings.languageSystem") : LANGUAGE_ENDONYMS[lang]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.savedNote}>{t("settings.savedNote")}</Text>
      <Text style={styles.version}>{t("settings.version", { version: Constants.expoConfig?.version ?? "?" })}</Text>
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
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 },
  providerChip: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, borderColor: "#cbd5e1" },
  providerChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  providerChipText: { color: "#334155", fontWeight: "600" },
  providerChipTextActive: { color: "#fff" },
  secondary: { marginTop: 24, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center" },
  secondaryText: { color: "#334155", fontSize: 16, fontWeight: "500" },
  savedNote: { textAlign: "center", color: "#94a3b8", fontSize: 12, marginTop: 14 },
  version: { textAlign: "center", color: "#cbd5e1", fontSize: 11, marginTop: 6 },
});
