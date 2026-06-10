import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { loadSettings } from "./src/storage";
import type { CreatedExpense, Receipt, Settings } from "./src/types";
import CaptureScreen from "./src/screens/CaptureScreen";
import ReviewScreen from "./src/screens/ReviewScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import SuccessScreen from "./src/screens/SuccessScreen";

type Screen = "capture" | "review" | "settings" | "success";

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [screen, setScreen] = useState<Screen>("capture");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [expense, setExpense] = useState<CreatedExpense | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  if (!settings) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {screen === "capture" && (
        <CaptureScreen
          settings={settings}
          onParsed={(r) => {
            setReceipt(r);
            setScreen("review");
          }}
          onOpenSettings={() => setScreen("settings")}
        />
      )}

      {screen === "review" && receipt && (
        <ReviewScreen
          settings={settings}
          initial={receipt}
          onBack={() => setScreen("capture")}
          onDone={(e) => {
            setExpense(e);
            setScreen("success");
          }}
        />
      )}

      {screen === "settings" && (
        <SettingsScreen
          initial={settings}
          onSaved={(s) => {
            setSettings(s);
            setScreen("capture");
          }}
          onBack={() => setScreen("capture")}
        />
      )}

      {screen === "success" && expense && (
        <SuccessScreen
          expense={expense}
          onNew={() => {
            setReceipt(null);
            setExpense(null);
            setScreen("capture");
          }}
        />
      )}
    </>
  );
}
