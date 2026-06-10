import { z } from "zod";

/**
 * Normalize Czech-formatted numbers before validation:
 *   "1 234,50" -> 1234.5   (space/nbsp thousands, comma decimal)
 * Numbers returned by the model pass through untouched.
 */
const czDecimal = (v) => {
  if (typeof v !== "string") return v;
  const cleaned = v
    .replace(/\s/g, "") // strip spaces / nbsp thousands separators
    .replace(/[^\d,.-]/g, "") // drop currency symbols / letters
    .replace(",", "."); // comma decimal -> dot
  const n = Number(cleaned);
  return Number.isNaN(n) ? v : n;
};
const czNumber = (schema) => z.preprocess(czDecimal, schema);

/**
 * What we want out of a Czech store receipt (uctenka).
 * Items + prices only — VAT is intentionally NOT extracted.
 * .nullable() (not .optional()) is used for missing fields — most providers
 * handle nullable better than optional in structured output.
 */
export const ReceiptItem = z.object({
  name: z.string().describe("Product/line name as printed on the receipt"),
  quantity: czNumber(z.number().nullable()).describe("Quantity, null if not printed"),
  unit_price: czNumber(z.number().nullable()).describe("Price per unit, null if not printed"),
  total_price: czNumber(z.number()).describe("Line total actually paid for this item (gross, incl. VAT)"),
  vat_rate: czNumber(z.number().nullable()).describe(
    "VAT/DPH rate in percent for this line (e.g. 21, 12, 0), from the 'DPH%' column. null if not printed",
  ),
});

/** One row of the receipt's VAT recap (the 'DPH% / Bez DPH / DPH / Celkem' block). */
export const VatSummaryRow = z.object({
  rate: czNumber(z.number()).describe("VAT/DPH rate in percent"),
  base: czNumber(z.number()).describe("Net amount for this rate (Bez DPH)"),
  vat: czNumber(z.number()).describe("VAT amount for this rate (DPH)"),
});

export const Receipt = z.object({
  merchant: z.string().nullable().describe("Store / merchant name as printed (trade name)"),
  supplier_name: z
    .string()
    .nullable()
    .describe("Legal company name shown next to the IČO (e.g. 'JIMO PLUS s.r.o.'), if present"),
  supplier_ico: z
    .string()
    .nullable()
    .describe("Supplier IČO — the 8-digit Czech company id, labelled 'IČ' or 'IČO'. Digits only."),
  supplier_dic: z
    .string()
    .nullable()
    .describe("Supplier DIČ — Czech VAT id labelled 'DIČ', usually 'CZ' + digits."),
  date: z.string().nullable().describe("Purchase date, ISO 8601 (YYYY-MM-DD) if possible"),
  currency: z.string().nullable().describe("Currency code, e.g. CZK"),
  items: z.array(ReceiptItem).describe("Every purchased line item"),
  vat_summary: z
    .array(VatSummaryRow)
    .describe("VAT recap rows from the 'DPH% / Bez DPH / DPH' block (empty array if none printed)"),
  total: czNumber(z.number().nullable()).describe("Grand total paid"),
});

/** @typedef {z.infer<typeof Receipt>} Receipt */

/** Instruction sent to the vision model (overrides the library's default invoice prompt). */
export const RECEIPT_PROMPT = [
  "You are reading a Czech retail store receipt (uctenka / paragon).",
  "Extract every purchased line item with its name and prices.",
  "Also extract the supplier identifiers: IČO (label 'IČ'/'IČO', 8 digits) and",
  "DIČ (label 'DIČ', 'CZ' + digits), plus the legal company name next to the IČO.",
  "For each line item, extract its VAT/DPH rate in percent from the 'DPH%' column (e.g. 21, 12, 0).",
  "Also extract the receipt's VAT recap block (the rows of 'DPH% / Bez DPH / DPH / Celkem',",
  "often printed twice) into vat_summary, one entry per VAT rate with its base and VAT amount.",
  "Skip non-item lines such as subtotals, rounding, payment method, change, loyalty points.",
  "Numbers may use a comma as the decimal separator; return them as plain numbers.",
].join(" ");
