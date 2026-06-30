// Prompt + JSON Schema for extracting a Czech receipt via OpenAI Structured Outputs.
// Mirrors the schema the old server used (items + per-line VAT + supplier IČO/DIČ + recap).

export const RECEIPT_PROMPT = [
  "You are reading a Czech purchase document: a retail store receipt (uctenka / paragon)",
  "or an invoice (faktura). Both describe a purchase from a supplier.",
  "Extract every purchased line item with its name and prices.",
  "Also extract the supplier identifiers: IČO (label 'IČ'/'IČO', 8 digits) and",
  "DIČ (label 'DIČ', 'CZ' + digits), plus the legal company name next to the IČO.",
  "Set 'merchant' to the seller's name: the printed store/trade name on a receipt,",
  "or on an invoice the supplier (dodavatel) company name — never leave it empty when a",
  "supplier is identifiable. Ignore the customer/buyer (odběratel) block.",
  "For each line item, extract its VAT/DPH rate in percent from the 'DPH%' column (e.g. 21, 12, 0).",
  "Also extract the receipt's VAT recap block (rows of 'DPH% / Bez DPH / DPH / Celkem',",
  "often printed twice) into vat_summary, one entry per VAT rate with its base and VAT amount.",
  "Skip non-item lines such as subtotals, rounding, payment method, change, loyalty points.",
  "Return numbers as plain JSON numbers (a comma decimal like 24,90 becomes 24.90).",
].join(" ");

// Strict Structured Outputs schema: every property required; nullable via ["type","null"].
export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["merchant", "supplier_name", "supplier_ico", "supplier_dic", "date", "currency", "items", "vat_summary", "total"],
  properties: {
    merchant: { type: ["string", "null"], description: "Seller name: receipt trade name, or invoice supplier (dodavatel) company name" },
    supplier_name: { type: ["string", "null"], description: "Legal company name next to the IČO" },
    supplier_ico: { type: ["string", "null"], description: "IČO, 8 digits, digits only" },
    supplier_dic: { type: ["string", "null"], description: "DIČ, usually 'CZ' + digits" },
    date: { type: ["string", "null"], description: "Purchase date, YYYY-MM-DD if possible" },
    currency: { type: ["string", "null"], description: "Currency code, e.g. CZK" },
    items: {
      type: "array",
      description: "Every purchased line item",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "unit_price", "total_price", "vat_rate"],
        properties: {
          name: { type: "string" },
          quantity: { type: ["number", "null"] },
          unit_price: { type: ["number", "null"], description: "Price per unit (gross)" },
          total_price: { type: "number", description: "Line total paid (gross, incl. VAT)" },
          vat_rate: { type: ["number", "null"], description: "VAT/DPH rate % for this line" },
        },
      },
    },
    vat_summary: {
      type: "array",
      description: "VAT recap rows (empty array if none printed)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rate", "base", "vat"],
        properties: {
          rate: { type: "number" },
          base: { type: "number", description: "Net amount (Bez DPH)" },
          vat: { type: "number", description: "VAT amount (DPH)" },
        },
      },
    },
    total: { type: ["number", "null"], description: "Grand total paid" },
  },
} as const;
