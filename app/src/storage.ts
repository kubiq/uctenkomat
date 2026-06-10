import * as SecureStore from "expo-secure-store";
import type { Settings } from "./types";

const BASE_URL_KEY = "baseUrl";
const API_KEY_KEY = "apiKey";

export async function loadSettings(): Promise<Settings> {
  const [baseUrl, apiKey] = await Promise.all([
    SecureStore.getItemAsync(BASE_URL_KEY),
    SecureStore.getItemAsync(API_KEY_KEY),
  ]);
  return { baseUrl: baseUrl ?? "", apiKey: apiKey ?? "" };
}

export async function saveSettings({ baseUrl, apiKey }: Settings): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(BASE_URL_KEY, baseUrl.trim()),
    SecureStore.setItemAsync(API_KEY_KEY, apiKey.trim()),
  ]);
}
