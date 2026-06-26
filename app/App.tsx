import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { loadSettings, saveSettings } from "./src/storage";
import { prepareImageBase64, readPdfBase64 } from "./src/image";
import { parseReceipt } from "./src/openai";
import { showAlert } from "./src/ui";
import type { CreatedExpense, PickedFile, Receipt, Settings } from "./src/types";
import CaptureScreen from "./src/screens/CaptureScreen";
import ReviewScreen from "./src/screens/ReviewScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import SuccessScreen from "./src/screens/SuccessScreen";

type Screen = "capture" | "busy" | "review" | "settings" | "done";

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [screen, setScreen] = useState<Screen>("capture");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [queue, setQueue] = useState<PickedFile[]>([]);
  const [busyMsg, setBusyMsg] = useState("Reading the receipt…");
  const [summary, setSummary] = useState<{ count: number; last: CreatedExpense | null }>({ count: 0, last: null });

  const total = useRef(0);
  const createdCount = useRef(0);
  const lastExpense = useRef<CreatedExpense | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  // Walk the queue: parse the first file, show review; on error skip it and continue.
  async function processQueue(files: PickedFile[], current: Settings) {
    if (files.length === 0) {
      finish();
      return;
    }
    setQueue(files);
    const done = total.current - files.length + 1;
    setBusyMsg(total.current > 1 ? `Reading receipt ${done} of ${total.current}…` : "Reading the receipt…");
    setScreen("busy");
    try {
      const file = files[0];
      const base64 = file.isPdf ? await readPdfBase64(file) : await prepareImageBase64(file.uri);
      const parsed = await parseReceipt(current, base64, file.isPdf);
      setReceipt(parsed);
      setScreen("review");
    } catch (e: any) {
      showAlert("Parsing failed", e?.message ?? String(e));
      processQueue(files.slice(1), current);
    }
  }

  // Persist tags just used so they can be re-added quickly on later receipts.
  function rememberTags(used: string[]) {
    if (!settings || used.length === 0) return;
    const merged = Array.from(new Set([...used, ...(settings.recentTags ?? [])])).slice(0, 20);
    const next = { ...settings, recentTags: merged };
    setSettings(next);
    saveSettings(next);
  }

  function finish() {
    if (createdCount.current > 0) {
      setSummary({ count: createdCount.current, last: lastExpense.current });
      setScreen("done");
    } else {
      setScreen("capture");
    }
  }

  function startBatch(files: PickedFile[]) {
    if (!settings) return;
    total.current = files.length;
    createdCount.current = 0;
    lastExpense.current = null;
    processQueue(files, settings);
  }

  if (!settings) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.card}>
      {screen === "capture" && (
        <CaptureScreen settings={settings} onSelected={startBatch} onOpenSettings={() => setScreen("settings")} />
      )}

      {screen === "busy" && (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12, backgroundColor: "#fff" }}>
          <ActivityIndicator size="large" />
          <Text style={{ color: "#64748b" }}>{busyMsg}</Text>
        </View>
      )}

      {screen === "review" && receipt && (
        <ReviewScreen
          settings={settings}
          initial={receipt}
          recentTags={settings.recentTags ?? []}
          onUsedTags={rememberTags}
          onBack={() => processQueue(queue.slice(1), settings)} // skip this one, continue queue
          onDone={(e) => {
            createdCount.current += 1;
            lastExpense.current = e;
            processQueue(queue.slice(1), settings);
          }}
        />
      )}

      {screen === "settings" && (
        <SettingsScreen
          initial={settings}
          onChange={setSettings}
          onClose={() => setScreen("capture")}
        />
      )}

      {screen === "done" && (
        <SuccessScreen
          count={summary.count}
          expense={summary.last}
          onNew={() => {
            setReceipt(null);
            setQueue([]);
            setScreen("capture");
          }}
        />
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, alignItems: "center", backgroundColor: "#e5e7eb" },
  card: { flex: 1, width: "100%", maxWidth: 480, backgroundColor: "#fff" },
});
