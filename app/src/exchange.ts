// Foreign-currency receipts are booked in their own currency, but the accounting
// services still want its CZK rate (Fakturoid requires one): the ČNB (Czech
// National Bank) daily fixing for the document date is the standard source.

export const HOME_CURRENCY = "CZK";

/** Normalise a parsed currency to an ISO 4217 code; a missing one means CZK. */
export function currencyCode(currency: string | null | undefined): string {
  const code = (currency ?? "").trim().toUpperCase();
  return code || HOME_CURRENCY;
}

const CNB_DAILY = "https://api.cnb.cz/cnbapi/exrates/daily";

/**
 * CZK per 1 unit of `currency` from the ČNB fixing valid on `date` (YYYY-MM-DD;
 * today when missing). On a weekend or holiday ČNB serves the last published
 * rate. Returns null when unavailable — an unknown currency, no network, or a
 * browser/Electron build, where ČNB's CORS policy blocks the request.
 */
export async function cnbRate(currency: string, date: string | null): Promise<number | null> {
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `&date=${date}` : "";
  try {
    const res = await fetch(`${CNB_DAILY}?lang=EN${day}`);
    if (!res.ok) return null;
    const json = await res.json();
    const row = (json?.rates ?? []).find((r: any) => r.currencyCode === currency);
    // ČNB quotes some currencies per 100 units (e.g. JPY), so divide by amount.
    if (!row || !(row.rate > 0) || !(row.amount > 0)) return null;
    return Math.round((row.rate / row.amount) * 1e6) / 1e6;
  } catch {
    return null;
  }
}
