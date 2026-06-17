import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { Settings } from "./types";

const STORAGE_KEY = "settings_v2";
const DEFAULTS: Settings = { openaiApiKey: "", provider: "fakturoid", creds: {}, recentTags: [] };

const isWeb = Platform.OS === "web";

// On desktop (Electron) a preload bridge persists to a JSON file; on web,
// localStorage; on native, expo-secure-store.
type DesktopStore = { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<unknown> };
const desktopStore: DesktopStore | undefined = (globalThis as any).desktopStore;

async function getItem(key: string): Promise<string | null> {
  if (desktopStore) return desktopStore.get(key);
  if (isWeb) return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (desktopStore) {
    await desktopStore.set(key, value);
    return;
  }
  if (isWeb) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function loadSettings(): Promise<Settings> {
  const raw = await getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, creds: { ...DEFAULTS.creds, ...(parsed.creds ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await setItem(STORAGE_KEY, JSON.stringify(s));
}
