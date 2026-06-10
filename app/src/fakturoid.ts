import type { CreatedExpense, Receipt, Settings, Subject } from "./types";

// Hermes (RN 0.74+) provides btoa globally; declare it for TypeScript.
declare const btoa: (data: string) => string;

const API_BASE = "https://app.fakturoid.cz/api/v3";
// Fakturoid requires a User-Agent with a contact. BYOK app uses a fixed identifier.
const USER_AGENT = "ReceiptToFakturoid/1.0 (app)";

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// --- token cache (per app session, keyed by client id) ---------------------
let cached: { key: string; value: string; expiresAt: number } | null = null;

async function getToken(s: Settings): Promise<string> {
  const key = s.fakturoidClientId;
  if (cached && cached.key === key && cached.expiresAt > Date.now() + 30_000) return cached.value;

  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Authorization: "Basic " + btoa(`${s.fakturoidClientId}:${s.fakturoidClientSecret}`),
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Fakturoid auth failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  cached = { key, value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 7200) * 1000 };
  return cached.value;
}

async function api(s: Settings, method: string, path: string, body?: unknown): Promise<any> {
  const token = await getToken(s);
  const res = await fetch(`${API_BASE}/accounts/${s.fakturoidSlug}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Fakturoid ${method} ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Validate Fakturoid credentials cheaply (used by Settings "test"). */
export async function checkFakturoid(s: Settings): Promise<boolean> {
  await getToken(s);
  return true;
}

export async function searchSubjects(s: Settings, query: string): Promise<Subject[]> {
  const list = await api(s, "GET", `/subjects/search.json?query=${encodeURIComponent(query || "")}`);
  return (list || []).map((x: any) => ({
    id: x.id,
    name: x.name,
    registration_no: x.registration_no,
    vat_no: x.vat_no,
  }));
}

async function createSubject(s: Settings, name: string, ico: string, dic: string | null): Promise<Subject> {
  return api(s, "POST", "/subjects.json", {
    name,
    registration_no: ico || undefined,
    vat_no: dic || undefined,
    type: "supplier",
    country: "CZ",
  });
}

/** Resolve a subject by IČO (create if missing); name-search fallback if no IČO. */
export async function findOrCreateSubjectByIco(
  s: Settings,
  supplier: { ico: string | null; dic: string | null; name: string | null },
): Promise<{ id: number; name: string; matchedBy: string; created: boolean }> {
  const icoDigits = onlyDigits(supplier.ico);
  if (icoDigits) {
    const hit = (await searchSubjects(s, icoDigits)).find((x) => onlyDigits(x.registration_no) === icoDigits);
    if (hit) return { id: hit.id, name: hit.name, matchedBy: "ico", created: false };
  } else if (supplier.name) {
    const first = (await searchSubjects(s, supplier.name))[0];
    if (first) return { id: first.id, name: first.name, matchedBy: "name", created: false };
  }
  const name = supplier.name || (icoDigits ? `Supplier ${icoDigits}` : "");
  if (!name) throw new Error("Cannot resolve supplier: no IČO match and no name to create one.");
  const created = await createSubject(s, name, icoDigits, supplier.dic);
  return { id: created.id, name: created.name, matchedBy: "created", created: true };
}

/**
 * Create the expense. Lines use each item's own VAT rate and the printed
 * quantity/unit price (vat_price_mode from_total_with_vat treats them as gross).
 */
export async function createExpense(
  s: Settings,
  receipt: Receipt,
  opts: { subjectId?: number } = {},
): Promise<CreatedExpense> {
  const subject = opts.subjectId
    ? { id: opts.subjectId, name: undefined, matchedBy: "explicit", created: false }
    : await findOrCreateSubjectByIco(s, {
        ico: receipt.supplier_ico,
        dic: receipt.supplier_dic,
        name: receipt.supplier_name || receipt.merchant,
      });

  const payload = {
    subject_id: subject.id,
    document_type: "bill",
    vat_price_mode: "from_total_with_vat",
    issued_on: receipt.date || undefined,
    lines: receipt.items.map((item) => ({
      name: item.name,
      quantity: String(item.quantity ?? 1),
      unit_price: String(item.unit_price ?? item.total_price),
      vat_rate: String(item.vat_rate ?? 21),
    })),
  };

  const expense = await api(s, "POST", "/expenses.json", payload);
  return {
    id: expense.id,
    number: expense.number ?? null,
    url: `https://app.fakturoid.cz/${s.fakturoidSlug}/expenses/${expense.id}`,
    subject: { id: subject.id, name: subject.name, matchedBy: subject.matchedBy, created: subject.created },
  };
}
