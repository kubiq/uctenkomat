import type { ProviderId, Settings } from "../types";
import type { AccountingProvider, Creds } from "./provider";
import { fakturoidProvider } from "./fakturoid";
import { idokladProvider } from "./idoklad";

export type { AccountingProvider, CredentialField, Creds } from "./provider";

export const PROVIDERS: AccountingProvider[] = [fakturoidProvider, idokladProvider];

export function getProvider(id: ProviderId): AccountingProvider {
  return PROVIDERS.find((p) => p.id === id) ?? fakturoidProvider;
}

/** Extract the active provider's flat credentials ({ fieldKey: value }). */
export function providerCreds(settings: Settings): Creds {
  const provider = getProvider(settings.provider);
  const out: Creds = {};
  for (const f of provider.credentialFields) {
    out[f.key] = settings.creds[`${settings.provider}.${f.key}`] ?? "";
  }
  return out;
}

/** Ready to scan = OpenAI key + all of the active provider's credential fields. */
export function isConfigured(settings: Settings): boolean {
  if (!settings.openaiApiKey) return false;
  const creds = providerCreds(settings);
  return getProvider(settings.provider).credentialFields.every((f) => creds[f.key]);
}
