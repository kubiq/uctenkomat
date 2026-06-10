import type { CreatedExpense, Receipt, Settings, Subject } from "./types";

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function asError(res: Response): Promise<Error> {
  let msg = `${res.status}`;
  try {
    const body = await res.json();
    msg = body?.error ? `${body.error}` : msg;
  } catch {
    // ignore non-JSON bodies
  }
  return new Error(msg);
}

/** Public health check — used by Settings "test connection". */
export async function checkHealth(baseUrl: string): Promise<boolean> {
  const res = await fetch(`${trimBase(baseUrl)}/api/health`);
  return res.ok;
}

/** Upload a photo (file://… uri) and get the parsed receipt back. */
export async function parseReceipt(s: Settings, imageUri: string): Promise<Receipt> {
  const form = new FormData();
  // React Native FormData file shape:
  form.append("file", {
    uri: imageUri,
    name: "receipt.jpg",
    type: "image/jpeg",
  } as any);

  const res = await fetch(`${trimBase(s.baseUrl)}/api/receipts/parse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s.apiKey}` },
    body: form,
  });
  if (!res.ok) throw await asError(res);
  return res.json();
}

export async function searchSubjects(s: Settings, query: string): Promise<Subject[]> {
  const url = `${trimBase(s.baseUrl)}/api/subjects?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${s.apiKey}` } });
  if (!res.ok) throw await asError(res);
  return res.json();
}

export async function createExpense(
  s: Settings,
  // subjectId is optional — when omitted the server resolves the supplier by IČO.
  // VAT is taken per-line from receipt.items[].vat_rate, not a flat rate.
  payload: { receipt: Receipt; subjectId?: number },
): Promise<CreatedExpense> {
  const res = await fetch(`${trimBase(s.baseUrl)}/api/expenses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await asError(res);
  return res.json();
}
