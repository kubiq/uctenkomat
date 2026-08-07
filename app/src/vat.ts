import type { Receipt } from "./types";

// Czech VAT: a simplified tax document (zjednodušený daňový doklad / paragon) is
// valid for input-VAT deduction only up to 10,000 CZK including VAT. Above that
// limit the document must be a full tax document identifying the buyer (IČO/DIČ).
export const SIMPLIFIED_DOC_LIMIT_CZK = 10000;

// DIČ comparison key: uppercase, alphanumerics only (so "CZ 123" == "cz123").
const dicKey = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// IČO comparison key: digits only.
const icoKey = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// True when this receipt is over the simplified-document limit yet doesn't carry
// the configured buyer identifiers — the receipt is fine if it shows either the
// buyer DIČ or the buyer IČO matching yours, otherwise its input VAT can't be
// reclaimed. Returns false — no warning — when no own IČO/DIČ is configured, when
// the total is unknown or within the limit, or when the receipt isn't in CZK
// (the limit is a CZK rule).
export function vatDeductionAtRisk(receipt: Receipt, own: { ico?: string; vatId?: string }): boolean {
  const ownDic = dicKey(own.vatId);
  const ownIco = icoKey(own.ico);
  if (!ownDic && !ownIco) return false; // nothing configured to check against
  if (receipt.total == null || receipt.total <= SIMPLIFIED_DOC_LIMIT_CZK) return false;
  const currency = (receipt.currency ?? "").trim().toUpperCase();
  if (currency && currency !== "CZK") return false;
  const dicMatches = !!ownDic && dicKey(receipt.buyer_dic) === ownDic;
  const icoMatches = !!ownIco && icoKey(receipt.buyer_ico) === ownIco;
  return !dicMatches && !icoMatches; // neither identifier present/ours → at risk
}
