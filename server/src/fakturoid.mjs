/**
 * Minimal Fakturoid API v3 client — token (cached), subject search, create expense.
 * Docs: https://www.fakturoid.cz/api/v3/expenses
 *
 * Auth: OAuth 2.0 "Client Credentials" flow (machine-to-machine).
 * Create an app in Fakturoid (Nastaveni -> API / Propojeni aplikaci).
 */

const API_BASE = "https://app.fakturoid.cz/api/v3";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

function userAgent() {
  return requireEnv("FAKTUROID_USER_AGENT"); // "AppName (email@example.com)"
}

// --- token cache -----------------------------------------------------------
let cachedToken = null; // { value, expiresAt }

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const clientId = requireEnv("FAKTUROID_CLIENT_ID");
  const clientSecret = requireEnv("FAKTUROID_CLIENT_SECRET");

  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": userAgent(),
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);

  const json = await res.json();
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 7200) * 1000,
  };
  return cachedToken.value;
}

/** Authenticated fetch against an account-scoped endpoint. */
async function api(method, urlPath, body) {
  const slug = requireEnv("FAKTUROID_ACCOUNT_SLUG");
  const token = await getToken();
  const res = await fetch(`${API_BASE}/accounts/${slug}${urlPath}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": userAgent(),
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Fakturoid ${method} ${urlPath} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Fetch a single expense (for verification/inspection). */
export async function getExpense(id) {
  return api("GET", `/expenses/${id}.json`);
}

/**
 * Search suppliers/contacts for the review screen.
 * @param {string} query
 * @returns {Promise<Array<{id:number,name:string,registration_no?:string,vat_no?:string}>>}
 */
export async function searchSubjects(query) {
  const q = encodeURIComponent(query || "");
  const list = await api("GET", `/subjects/search.json?query=${q}`);
  return (list || []).map((s) => ({
    id: s.id,
    name: s.name,
    registration_no: s.registration_no, // ICO
    vat_no: s.vat_no, // DIC
  }));
}

const onlyDigits = (s) => (s || "").replace(/\D/g, "");

/** Create a supplier subject. */
export async function createSubject({ name, ico, dic }) {
  if (!name) throw new Error("subject name is required to create a subject");
  return api("POST", "/subjects.json", {
    name,
    registration_no: ico || undefined,
    vat_no: dic || undefined,
    type: "supplier",
    country: "CZ",
  });
}

/**
 * Resolve a Fakturoid subject for a receipt: match by IČO, create if missing.
 * Falls back to a name search when there is no IČO.
 *
 * @param {{ ico?: string|null, dic?: string|null, name?: string|null }} supplier
 * @returns {Promise<{ id:number, name:string, created:boolean, matchedBy:string }>}
 */
export async function findOrCreateSubjectByIco({ ico, dic, name }) {
  const icoDigits = onlyDigits(ico);

  if (icoDigits) {
    const results = await searchSubjects(icoDigits);
    const hit = results.find((s) => onlyDigits(s.registration_no) === icoDigits);
    if (hit) return { id: hit.id, name: hit.name, created: false, matchedBy: "ico" };
  } else if (name) {
    const results = await searchSubjects(name);
    if (results[0]) return { id: results[0].id, name: results[0].name, created: false, matchedBy: "name" };
  }

  // Not found -> create. Need a name (prefer legal name over trade header).
  const subjectName = name || (icoDigits ? `Supplier ${icoDigits}` : null);
  if (!subjectName) throw new Error("cannot resolve subject: no IČO match and no name to create one");
  const created = await createSubject({ name: subjectName, ico: icoDigits, dic });
  return { id: created.id, name: created.name, created: true, matchedBy: "created" };
}

/**
 * Map an extracted receipt into a Fakturoid expense (naklad) and create it.
 *
 * Each line uses its own VAT rate from the receipt's 'DPH%' column, and the
 * quantity / unit price exactly as printed on the receipt. Note: when
 * quantity × unit_price doesn't equal the receipt's line total (receipts round
 * the displayed unit price), Fakturoid recomputes the line, so the document
 * total can differ from the receipt by a few haléř. `vat_price_mode:
 * from_total_with_vat` treats unit prices as gross (incl. VAT).
 *
 * @param {import("./schema.mjs").Receipt} receipt
 * @param {{ subjectId: number, vatRate?: string|number }} opts  vatRate = fallback when a line has no extracted rate
 */
export async function createExpense(receipt, { subjectId, vatRate } = {}) {
  if (!subjectId) throw new Error("subjectId is required to create an expense");
  const fallbackRate = String(vatRate ?? process.env.FAKTUROID_VAT_RATE ?? "21");

  const payload = {
    subject_id: subjectId,
    document_type: "bill", // uctenka / paragon
    vat_price_mode: "from_total_with_vat", // receipt prices are gross
    issued_on: receipt.date || undefined,
    lines: receipt.items.map((item) => ({
      name: item.name,
      quantity: String(item.quantity ?? 1),
      unit_price: String(item.unit_price ?? item.total_price),
      vat_rate: String(item.vat_rate ?? fallbackRate),
    })),
  };

  return api("POST", "/expenses.json", payload);
}
