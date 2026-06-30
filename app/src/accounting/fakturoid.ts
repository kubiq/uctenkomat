import type { CreatedExpense, Receipt, Subject } from "../types";
import type { AccountingProvider, Creds } from "./provider";

// Hermes (RN 0.74+) provides btoa globally; declare it for TypeScript.
declare const btoa: (data: string) => string;

const API_BASE = "https://app.fakturoid.cz/api/v3";
const USER_AGENT = "ReceiptToFakturoid/1.0 (app)";

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
// DIČ comparison key: uppercase, alphanumerics only (so "CZ 123" == "cz123").
const dicKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// --- token cache (per app session, keyed by client id) ---------------------
let cached: { key: string; value: string; expiresAt: number } | null = null;

async function getToken(c: Creds): Promise<string> {
  if (cached && cached.key === c.clientId && cached.expiresAt > Date.now() + 30_000) return cached.value;
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Authorization: "Basic " + btoa(`${c.clientId}:${c.clientSecret}`),
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Fakturoid auth failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  cached = { key: c.clientId, value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 7200) * 1000 };
  return cached.value;
}

async function api(
  c: Creds,
  method: string,
  path: string,
  body?: unknown,
  opts: { allow404?: boolean } = {},
): Promise<any> {
  const token = await getToken(c);
  const res = await fetch(`${API_BASE}/accounts/${c.slug}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (opts.allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`Fakturoid ${method} ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function searchSubjects(c: Creds, query: string): Promise<Subject[]> {
  // Fakturoid's fulltext search returns 404 (resource_not_found) when nothing
  // matches — treat that as an empty result so callers fall through to create.
  const list = await api(c, "GET", `/subjects/search.json?query=${encodeURIComponent(query || "")}`, undefined, {
    allow404: true,
  });
  return (list || []).map((x: any) => ({
    id: x.id,
    name: x.name,
    registration_no: x.registration_no,
    vat_no: x.vat_no,
  }));
}

async function findOrCreateSubject(
  c: Creds,
  supplier: { ico: string | null; dic: string | null; name: string | null },
): Promise<{ id: number; name: string; matchedBy: string; created: boolean }> {
  const icoDigits = onlyDigits(supplier.ico);
  const dic = dicKey(supplier.dic);
  // Try precise identifiers first (IČO, then DIČ — Fakturoid fulltext indexes
  // both registration_no and vat_no), then fall back to a fuzzy name match.
  if (icoDigits) {
    const hit = (await searchSubjects(c, icoDigits)).find((x) => onlyDigits(x.registration_no) === icoDigits);
    if (hit) return { id: hit.id, name: hit.name, matchedBy: "ico", created: false };
  }
  if (dic) {
    const hit = (await searchSubjects(c, dic)).find((x) => dicKey(x.vat_no) === dic);
    if (hit) return { id: hit.id, name: hit.name, matchedBy: "dic", created: false };
  }
  if (supplier.name) {
    const first = (await searchSubjects(c, supplier.name))[0];
    if (first) return { id: first.id, name: first.name, matchedBy: "name", created: false };
  }
  const name = supplier.name || (icoDigits ? `Supplier ${icoDigits}` : "");
  if (!name) throw new Error("Cannot resolve supplier: no IČO/DIČ match and no name to create one.");
  const created = await api(c, "POST", "/subjects.json", {
    name,
    registration_no: icoDigits || undefined,
    vat_no: supplier.dic || undefined,
    type: "supplier",
    country: "CZ",
  });
  return { id: created.id, name: created.name, matchedBy: "created", created: true };
}

async function createExpense(
  c: Creds,
  receipt: Receipt,
  opts: { subjectId?: number; tags?: string[] },
): Promise<CreatedExpense> {
  const subject = opts.subjectId
    ? { id: opts.subjectId, name: undefined as string | undefined, matchedBy: "explicit", created: false }
    : await findOrCreateSubject(c, {
        ico: receipt.supplier_ico,
        dic: receipt.supplier_dic,
        name: receipt.supplier_name || receipt.merchant,
      });

  const tags = (opts.tags ?? []).map((t) => t.trim()).filter(Boolean);
  const payload = {
    subject_id: subject.id,
    document_type: "bill",
    vat_price_mode: "from_total_with_vat",
    issued_on: receipt.date || undefined,
    // Fakturoid expenses accept a plain string array of tags.
    ...(tags.length ? { tags } : {}),
    lines: receipt.items.map((item) => ({
      name: item.name,
      quantity: String(item.quantity ?? 1),
      unit_price: String(item.unit_price ?? item.total_price),
      vat_rate: String(item.vat_rate ?? 21),
    })),
  };

  const expense = await api(c, "POST", "/expenses.json", payload);
  return {
    id: expense.id,
    number: expense.number ?? null,
    url: `https://app.fakturoid.cz/${c.slug}/expenses/${expense.id}`,
    subject: { id: subject.id, name: subject.name, matchedBy: subject.matchedBy, created: subject.created },
  };
}

export const fakturoidProvider: AccountingProvider = {
  id: "fakturoid",
  label: "Fakturoid",
  supportsTags: true,
  setupHint: "Create an app in Fakturoid → Nastavení → API / Propojení aplikací (Client Credentials).",
  credentialFields: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client secret", secret: true },
    { key: "slug", label: "Account slug", placeholder: "from app.fakturoid.cz/<slug>/…" },
  ],
  check: async (c) => {
    await getToken(c);
    return true;
  },
  searchSubjects,
  createExpense,
};
