import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { Settings } from "./types";

// SecureStore keys must be alphanumeric/._- ; map each setting field to one.
const KEYS: Record<keyof Settings, string> = {
  openaiApiKey: "openai_api_key",
  fakturoidClientId: "fakturoid_client_id",
  fakturoidClientSecret: "fakturoid_client_secret",
  fakturoidSlug: "fakturoid_slug",
};

const isWeb = Platform.OS === "web";

// Web/Electron has no secure-store; fall back to localStorage (user's own machine).
async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function loadSettings(): Promise<Settings> {
  const entries = await Promise.all(
    (Object.keys(KEYS) as (keyof Settings)[]).map(
      async (k) => [k, (await getItem(KEYS[k])) ?? ""] as const,
    ),
  );
  return Object.fromEntries(entries) as Settings;
}

export async function saveSettings(s: Settings): Promise<void> {
  await Promise.all(
    (Object.keys(KEYS) as (keyof Settings)[]).map((k) => setItem(KEYS[k], (s[k] ?? "").trim())),
  );
}

export function isConfigured(s: Settings): boolean {
  return Boolean(s.openaiApiKey && s.fakturoidClientId && s.fakturoidClientSecret && s.fakturoidSlug);
}
