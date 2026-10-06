import type { CreatedExpense, Receipt, Subject } from "../types";
import type { AccountingProvider, CreateExpenseOpts, Creds } from "./provider";
import { HOME_CURRENCY, cnbRate, currencyCode } from "../exchange";

// Hermes (RN 0.74+) provides btoa globally; declare it for TypeScript.
declare const btoa: (data: string) => string;

const API_BASE = "https://app.fakturoid.cz/api/v3";
const USER_AGENT = "ReceiptToFakturoid/1.0 (app)";

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
// DIČ comparison key: uppercase, alphanumerics only (so "CZ 123" == "cz123").
const dicKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Fakturoid's subject `country` is an ISO 3166-1 alpha-2 code. EU VAT IDs are
// prefixed with the country (DE, SK, AT, …), so derive it from the DIČ instead
// of assuming CZ — otherwise a German supplier lands under CZ with a DE VAT no.
// Greece's VAT prefix "EL" maps to ISO "GR". Fall back to CZ when there's no
// alphabetic prefix (older bare-digit Czech DIČ).
function countryFromDic(dic: string | null | undefined): string {
  const prefix = (dic ?? "").trim().toUpperCase().match(/^([A-Z]{2})/)?.[1];
  if (!prefix) return "CZ";
  return prefix === "EL" ? "GR" : prefix;
}

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

type Supplier = { ico: string | null; dic: string | null; name: string | null };

// Look up an existing subject without creating one. Precise identifiers first
// (IČO, then DIČ — Fakturoid fulltext indexes both registration_no and vat_no),
// then a fuzzy name match. Returns null when nothing matches.
async function findSubject(
  c: Creds,
  supplier: Supplier,
): Promise<{ id: number; name: string; matchedBy: string } | null> {
  const icoDigits = onlyDigits(supplier.ico);
  const dic = dicKey(supplier.dic);
  if (icoDigits) {
    const hit = (await searchSubjects(c, icoDigits)).find((x) => onlyDigits(x.registration_no) === icoDigits);
    if (hit) return { id: hit.id, name: hit.name, matchedBy: "ico" };
  }
  if (dic) {
    const hit = (await searchSubjects(c, dic)).find((x) => dicKey(x.vat_no) === dic);
    if (hit) return { id: hit.id, name: hit.name, matchedBy: "dic" };
  }
  if (supplier.name) {
    const first = (await searchSubjects(c, supplier.name))[0];
    if (first) return { id: first.id, name: first.name, matchedBy: "name" };
  }
  return null;
}

async function findOrCreateSubject(
  c: Creds,
  supplier: Supplier,
): Promise<{ id: number; name: string; matchedBy: string; created: boolean }> {
  const existing = await findSubject(c, supplier);
  if (existing) return { ...existing, created: false };
  const icoDigits = onlyDigits(supplier.ico);
  const name = supplier.name || (icoDigits ? `Supplier ${icoDigits}` : "");
  if (!name) throw new Error("Cannot resolve supplier: no IČO/DIČ match and no name to create one.");
  const created = await api(c, "POST", "/subjects.json", {
    name,
    registration_no: icoDigits || undefined,
    vat_no: supplier.dic || undefined,
    type: "supplier",
    country: countryFromDic(supplier.dic),
  });
  return { id: created.id, name: created.name, matchedBy: "created", created: true };
}

// Detect a receipt that's already been entered in Fakturoid, so the user isn't
// prompted to create a duplicate. Matches within the resolved supplier on the
// supplier's document number (original_number); when the receipt has no document
// number, falls back to same issue date + matching gross total. Only the first
// page of the supplier's expenses (newest first) is checked — enough for the
// common "just scanned it again" case.
async function findDuplicate(c: Creds, receipt: Receipt): Promise<CreatedExpense | null> {
  const subject = await findSubject(c, {
    ico: receipt.supplier_ico,
    dic: receipt.supplier_dic,
    name: receipt.supplier_name || receipt.merchant,
  });
  if (!subject) return null; // supplier unknown → no prior expense to collide with

  const wantNo = dicKey(receipt.doc_number); // reuse the alnum-uppercase normaliser
  const list: any[] =
    (await api(c, "GET", `/expenses.json?subject_id=${subject.id}`, undefined, { allow404: true })) || [];

  const match = list.find((e) => {
    if (e.subject_id !== subject.id) return false; // guard in case the filter was ignored
    if (wantNo) return dicKey(e.original_number) === wantNo;
    // No document number: fall back to same date + total (within rounding).
    return (
      receipt.date != null &&
      receipt.total != null &&
      e.issued_on === receipt.date &&
      Math.abs(Number(e.total) - receipt.total) < 0.5
    );
  });
  if (!match) return null;
  return {
    id: match.id,
    number: match.number ?? null,
    url: `https://app.fakturoid.cz/${c.slug}/expenses/${match.id}`,
    subject: { id: subject.id, name: subject.name },
  };
}

async function createExpense(c: Creds, receipt: Receipt, opts: CreateExpenseOpts): Promise<CreatedExpense> {
  const subject = opts.subjectId
    ? { id: opts.subjectId, name: undefined as string | undefined, matchedBy: "explicit", created: false }
    : await findOrCreateSubject(c, {
        ico: receipt.supplier_ico,
        dic: receipt.supplier_dic,
        name: receipt.supplier_name || receipt.merchant,
      });

  const tags = (opts.tags ?? []).map((t) => t.trim()).filter(Boolean);
  // Left out, Fakturoid books the expense in the account currency (CZK). A
  // foreign receipt keeps its own currency; Fakturoid then requires an exchange
  // rate, so send the ČNB rate for the document date.
  const currency = currencyCode(receipt.currency);
  const foreign = currency !== HOME_CURRENCY;
  const exchangeRate = foreign ? await cnbRate(currency, receipt.date) : null;
  if (foreign && !exchangeRate) throw new Error(`Couldn't load the ČNB exchange rate for ${currency}, which Fakturoid requires.`);
  // A receipt is issued and taxable on the document date; when it's paid at the
  // till it's also due that day (align due_on too, avoiding Fakturoid's +14d
  // default). For an unpaid invoice we leave due_on to Fakturoid's default.
  const day = receipt.date || undefined;
  const payload = {
    subject_id: subject.id,
    document_type: "bill",
    vat_price_mode: "from_total_with_vat",
    original_number: receipt.doc_number || undefined,
    issued_on: day,
    taxable_fulfillment_due: day,
    ...(opts.markPaid ? { due_on: day } : {}),
    ...(foreign ? { currency, exchange_rate: String(exchangeRate) } : {}),
    // Fakturoid expenses accept a plain string array of tags.
    ...(tags.length ? { tags } : {}),
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    lines: receipt.items.map((item) => ({
      name: item.name,
      quantity: String(item.quantity ?? 1),
      unit_price: String(item.unit_price ?? item.total_price),
      vat_rate: String(item.vat_rate ?? 21),
    })),
  };

  const expense = await api(c, "POST", "/expenses.json", payload);

  // Mark paid on the due date (receipts are paid at the till). Best-effort: the
  // expense already exists, so a payment hiccup shouldn't fail the whole flow.
  if (opts.markPaid) {
    try {
      await api(c, "POST", `/expenses/${expense.id}/payments.json`, { paid_on: day });
    } catch {
      // leave it unpaid; the user can mark it in Fakturoid
    }
  }

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
  // setupHint / field labels / placeholder are i18n keys, resolved in SettingsScreen.
  setupHint: "settings.setupHint.fakturoid",
  credentialFields: [
    { key: "clientId", label: "settings.field.clientId" },
    { key: "clientSecret", label: "settings.field.clientSecret", secret: true },
    { key: "slug", label: "settings.field.slug", placeholder: "settings.slugPlaceholder" },
  ],
  check: async (c) => {
    // getToken validates the Client ID/secret; account.json validates the slug
    // (client-credentials auth itself ignores the slug, so a typo slips past it).
    await getToken(c);
    if (!c.slug?.trim()) throw new Error("Account slug is empty");
    try {
      await api(c, "GET", "/account.json");
    } catch (e: any) {
      if (String(e?.message ?? "").includes("(404)")) throw new Error(`Account slug "${c.slug}" not found`);
      throw e;
    }
    return true;
  },
  searchSubjects,
  createExpense,
  findDuplicate,
};
