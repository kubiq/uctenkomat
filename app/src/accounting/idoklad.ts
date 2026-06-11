import type { CreatedExpense, Receipt, Subject } from "../types";
import type { AccountingProvider, Creds } from "./provider";

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

async function findOrCreateContact(
  c: Creds,
  supplier: { ico: string | null; dic: string | null; name: string | null },
): Promise<{ id: number; name: string; matchedBy: string; created: boolean }> {
  const icoDigits = onlyDigits(supplier.ico);
  if (icoDigits) {
    const hit = await findContactByIco(c, icoDigits);
    if (hit) return { id: hit.id, name: hit.name, matchedBy: "ico", created: false };
  } else if (supplier.name) {
    const first = (await searchSubjects(c, supplier.name))[0];
    if (first) return { id: first.id, name: first.name, matchedBy: "name", created: false };
  }
  const name = supplier.name || (icoDigits ? `Supplier ${icoDigits}` : "");
  if (!name) throw new Error("Cannot resolve supplier: no IČO match and no name to create one.");
  // Start from the default contact model so required fields (e.g. CountryId) are set.
  const model = unwrap(await api(c, "GET", "/Contacts/Default"));
  const created = unwrap(
    await api(c, "POST", "/Contacts", {
      ...model,
      CompanyName: name,
      IdentificationNumber: icoDigits || undefined,
      VatIdentificationNumber: supplier.dic || undefined,
    }),
  );
  return { id: created.Id, name: created.CompanyName ?? name, matchedBy: "created", created: true };
}

function isoDate(date: string | null): string | undefined {
  if (!date) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : undefined;
}

async function createExpense(c: Creds, receipt: Receipt, opts: { subjectId?: number }): Promise<CreatedExpense> {
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

  const payload = {
    ...model,
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

export const idokladProvider: AccountingProvider = {
  id: "idoklad",
  label: "iDoklad",
  setupHint: "Create API credentials in iDoklad → Nastavení → API (Client Credentials).",
  credentialFields: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client secret", secret: true },
  ],
  check: async (c) => {
    await getToken(c);
    return true;
  },
  searchSubjects,
  createExpense,
};
