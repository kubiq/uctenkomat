import type { CreatedExpense, Receipt, Subject } from "../types";
import type { AccountingProvider, CreateExpenseOpts, Creds } from "./provider";
import { HOME_CURRENCY, cnbRate, currencyCode } from "../exchange";

// iDoklad API v3. Auth is OAuth2 client-credentials against IdentityServer.
const TOKEN_URL = "https://identity.idoklad.cz/server/connect/token";
const API_BASE = "https://api.idoklad.cz/v3";

// ⚠ VERIFY against a live account (we built this without one):
//  - VatRateType enum ints. iDoklad maps these to the account's configured rates.
//  - PriceType: 0 = price including VAT (gross), per the API docs/samples.
// Our receipts are gross, so PriceType = WithVat. Rate mapping: 21→Basic, 12→Reduced1, 0→Zero.
const PRICE_TYPE_WITH_VAT = 0;
const VatRateType = { Basic: 0, Reduced1: 1, Reduced2: 2, Zero: 3 } as const;
function mapVatRateType(rate: number | null): number {
  if (rate == null) return VatRateType.Basic;
  if (rate >= 20) return VatRateType.Basic; // 21%
  if (rate >= 5) return VatRateType.Reduced1; // 12% (15% pre-2024)
  return VatRateType.Zero;
}

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
// DIČ comparison key: uppercase, alphanumerics only (so "CZ 123" == "cz123").
const dicKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// EU VAT IDs are prefixed with the country (DE, SK, AT, …); derive that ISO
// alpha-2 code from the DIČ. Greece's VAT prefix "EL" maps to ISO "GR". Returns
// null when there's no alphabetic prefix (older bare-digit Czech DIČ).
function countryFromDic(dic: string | null | undefined): string | null {
  const prefix = (dic ?? "").trim().toUpperCase().match(/^([A-Z]{2})/)?.[1];
  if (!prefix) return null;
  return prefix === "EL" ? "GR" : prefix;
}

// iDoklad identifies countries by numeric CountryId, so resolve the DIČ's ISO
// code to an Id via /Countries. Country Ids are global (account-independent), so
// cache resolved hits. Falls back to the caller's default (the account's home
// country from /Contacts/Default) when the code is missing or unresolvable.
const countryIdCache = new Map<string, number>();
async function countryIdFromDic(c: Creds, dic: string | null, fallback: number): Promise<number> {
  const code = countryFromDic(dic);
  if (!code) return fallback;
  const cached = countryIdCache.get(code);
  if (cached !== undefined) return cached;
  const q = encodeURIComponent(`Code~eq~${code}`);
  const hit = items(await api(c, "GET", `/Countries?filter=${q}&pageSize=1`))[0];
  if (!hit) return fallback;
  countryIdCache.set(code, hit.Id);
  return hit.Id;
}

// iDoklad identifies currencies by numeric CurrencyId; resolve the ISO 4217 code
// via /Currencies. Ids are global (account-independent), so cache them.
const currencyIdCache = new Map<string, number>();
async function currencyId(c: Creds, code: string): Promise<number> {
  const cached = currencyIdCache.get(code);
  if (cached !== undefined) return cached;
  const q = encodeURIComponent(`Code~eq~${code}`);
  const hit = items(await api(c, "GET", `/Currencies?filter=${q}&pageSize=1`))[0];
  if (!hit) throw new Error(`iDoklad doesn't know the currency ${code}`);
  currencyIdCache.set(code, hit.Id);
  return hit.Id;
}

// --- token cache (keyed by client id) --------------------------------------
let cached: { key: string; value: string; expiresAt: number } | null = null;

async function getToken(c: Creds): Promise<string> {
  if (cached && cached.key === c.clientId && cached.expiresAt > Date.now() + 30_000) return cached.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: c.clientId,
    client_secret: c.clientSecret,
    scope: "idoklad_api",
  }).toString();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`iDoklad auth failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  cached = { key: c.clientId, value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.value;
}

async function api(c: Creds, method: string, path: string, body?: unknown): Promise<any> {
  const token = await getToken(c);
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`iDoklad ${method} ${path} failed (${res.status}): ${await res.text()}`);
  // 204 / empty bodies
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// iDoklad wraps payloads in { Data: ... }; collections in { Data: { Items: [...] } }.
const unwrap = (json: any) => json?.Data ?? json;
const items = (json: any) => {
  const d = unwrap(json);
  return Array.isArray(d) ? d : (d?.Items ?? []);
};

function toSubject(x: any): Subject {
  return {
    id: x.Id,
    name: x.CompanyName ?? [x.Firstname, x.Surname].filter(Boolean).join(" "),
    registration_no: x.IdentificationNumber,
    vat_no: x.VatIdentificationNumber,
  };
}

async function searchSubjects(c: Creds, query: string): Promise<Subject[]> {
  const q = encodeURIComponent(`CompanyName~ct~${query || ""}`);
  const json = await api(c, "GET", `/Contacts?filter=${q}&pageSize=20`);
  return items(json).map(toSubject);
}

async function findContactByIco(c: Creds, ico: string): Promise<Subject | null> {
  const q = encodeURIComponent(`IdentificationNumber~eq~${ico}`);
  const json = await api(c, "GET", `/Contacts?filter=${q}&pageSize=20`);
  const hit = items(json).map(toSubject).find((x: Subject) => onlyDigits(x.registration_no) === ico);
  return hit ?? null;
}

async function findContactByDic(c: Creds, dic: string): Promise<Subject | null> {
  const q = encodeURIComponent(`VatIdentificationNumber~eq~${dic}`);
  const json = await api(c, "GET", `/Contacts?filter=${q}&pageSize=20`);
  const hit = items(json).map(toSubject).find((x: Subject) => dicKey(x.vat_no) === dicKey(dic));
  return hit ?? null;
}

type Supplier = { ico: string | null; dic: string | null; name: string | null };

// Look up an existing contact without creating one. Precise identifiers first
// (IČO, then DIČ), then a fuzzy name match. Returns null when nothing matches.
async function findContact(
  c: Creds,
  supplier: Supplier,
): Promise<{ id: number; name: string; matchedBy: string } | null> {
  const icoDigits = onlyDigits(supplier.ico);
  if (icoDigits) {
    const hit = await findContactByIco(c, icoDigits);
    if (hit) return { id: hit.id, name: hit.name, matchedBy: "ico" };
  }
  if (supplier.dic) {
    const hit = await findContactByDic(c, supplier.dic);
    if (hit) return { id: hit.id, name: hit.name, matchedBy: "dic" };
  }
  if (supplier.name) {
    const first = (await searchSubjects(c, supplier.name))[0];
    if (first) return { id: first.id, name: first.name, matchedBy: "name" };
  }
  return null;
}

async function findOrCreateContact(
  c: Creds,
  supplier: Supplier,
): Promise<{ id: number; name: string; matchedBy: string; created: boolean }> {
  const existing = await findContact(c, supplier);
  if (existing) return { ...existing, created: false };
  const icoDigits = onlyDigits(supplier.ico);
  const name = supplier.name || (icoDigits ? `Supplier ${icoDigits}` : "");
  if (!name) throw new Error("Cannot resolve supplier: no IČO/DIČ match and no name to create one.");
  // Start from the default contact model so required fields (e.g. CountryId) are set.
  const model = unwrap(await api(c, "GET", "/Contacts/Default"));
  const created = unwrap(
    await api(c, "POST", "/Contacts", {
      ...model,
      CompanyName: name,
      IdentificationNumber: icoDigits || undefined,
      VatIdentificationNumber: supplier.dic || undefined,
      CountryId: await countryIdFromDic(c, supplier.dic, model.CountryId),
    }),
  );
  return { id: created.Id, name: created.CompanyName ?? name, matchedBy: "created", created: true };
}

function isoDate(date: string | null): string | undefined {
  if (!date) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : undefined;
}

// tags / attachments / markPaid are accepted for interface parity but not yet sent
// to iDoklad (its ReceivedInvoice needs separate lookup/create steps for those).
async function createExpense(c: Creds, receipt: Receipt, opts: CreateExpenseOpts): Promise<CreatedExpense> {
  const subject = opts.subjectId
    ? { id: opts.subjectId, name: undefined as string | undefined, matchedBy: "explicit", created: false }
    : await findOrCreateContact(c, {
        ico: receipt.supplier_ico,
        dic: receipt.supplier_dic,
        name: receipt.supplier_name || receipt.merchant,
      });

  // Prefilled model carries CurrencyId, NumericSequenceId, PaymentOptionId, dates.
  const model = unwrap(await api(c, "GET", "/ReceivedInvoices/Default"));
  const date = isoDate(receipt.date);

  // The default model is in the home currency (CZK); a foreign receipt keeps its
  // own currency, at the ČNB rate for the document date when it can be loaded
  // (otherwise iDoklad's own default rate applies).
  const currency = currencyCode(receipt.currency);
  const foreign = currency !== HOME_CURRENCY;
  const rate = foreign ? await cnbRate(currency, receipt.date) : null;
  const currencyFields = foreign
    ? { CurrencyId: await currencyId(c, currency), ...(rate ? { ExchangeRate: rate, ExchangeRateAmount: 1 } : {}) }
    : {};

  const payload = {
    ...model,
    ...currencyFields,
    PartnerId: subject.id,
    ...(date ? { DateOfIssue: date, DateOfReceiving: date, DateOfTaxing: date } : {}),
    Description: receipt.merchant ?? "Účtenka",
    Items: receipt.items.map((item) => ({
      Name: item.name,
      Amount: item.quantity ?? 1,
      UnitPrice: item.unit_price ?? item.total_price,
      PriceType: PRICE_TYPE_WITH_VAT,
      VatRateType: mapVatRateType(item.vat_rate),
    })),
  };

  const created = unwrap(await api(c, "POST", "/ReceivedInvoices", payload));
  return {
    id: created.Id,
    number: created.DocumentNumber ?? null,
    url: null, // iDoklad has no stable public deep-link we can rely on
    subject: { id: subject.id, name: subject.name, matchedBy: subject.matchedBy, created: subject.created },
  };
}

// Gross total of a received invoice, tolerating where iDoklad puts it.
function grossTotal(e: any): number | null {
  const candidates = [e?.Prices?.TotalWithVat, e?.TotalWithVat, e?.Prices?.TotalWithVatHc, e?.TotalWithVatHc];
  for (const v of candidates) if (typeof v === "number") return v;
  return null;
}

// Detect a receipt already entered in iDoklad. Since createExpense doesn't store
// the supplier's document number on the received invoice, match within the
// resolved partner on issue date + gross total (the "just scanned it again"
// case). Only the first page of the partner's invoices is checked.
async function findDuplicate(c: Creds, receipt: Receipt): Promise<CreatedExpense | null> {
  if (receipt.date == null || receipt.total == null) return null; // nothing reliable to match on
  const contact = await findContact(c, {
    ico: receipt.supplier_ico,
    dic: receipt.supplier_dic,
    name: receipt.supplier_name || receipt.merchant,
  });
  if (!contact) return null;

  const q = encodeURIComponent(`PartnerId~eq~${contact.id}`);
  const json = await api(c, "GET", `/ReceivedInvoices?filter=${q}&pageSize=50`);
  const match = items(json).find((e: any) => {
    const total = grossTotal(e);
    return String(e.DateOfIssue ?? "").slice(0, 10) === receipt.date && total != null && Math.abs(total - receipt.total!) < 0.5;
  });
  if (!match) return null;
  return {
    id: match.Id,
    number: match.DocumentNumber ?? null,
    url: null, // iDoklad has no stable public deep-link we can rely on
    subject: { id: contact.id, name: contact.name },
  };
}

export const idokladProvider: AccountingProvider = {
  id: "idoklad",
  label: "iDoklad",
  // setupHint / field labels are i18n keys, resolved in SettingsScreen.
  setupHint: "settings.setupHint.idoklad",
  credentialFields: [
    { key: "clientId", label: "settings.field.clientId" },
    { key: "clientSecret", label: "settings.field.clientSecret", secret: true },
  ],
  check: async (c) => {
    await getToken(c);
    return true;
  },
  searchSubjects,
  createExpense,
  findDuplicate,
};
