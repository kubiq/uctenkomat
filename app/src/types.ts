export type ReceiptItem = {
  name: string;
  quantity: number | null;
  unit_price: number | null;
  total_price: number;
  vat_rate: number | null; // DPH % for this line
};

export type VatSummaryRow = {
  rate: number;
  base: number; // Bez DPH
  vat: number; // DPH
};

export type Receipt = {
  merchant: string | null;
  supplier_name: string | null;
  supplier_ico: string | null; // IČO
  supplier_dic: string | null; // DIČ
  buyer_ico: string | null; // buyer's (odběratel) IČO printed on the receipt, if any
  buyer_dic: string | null; // buyer's (odběratel) DIČ printed on the receipt, if any
  doc_number: string | null; // the receipt's own document number (Doklad / účtenka č.)
  date: string | null;
  currency: string | null;
  items: ReceiptItem[];
  vat_summary: VatSummaryRow[];
  total: number | null;
};

// A receipt source picked by the user: an image (camera/gallery) or a PDF.
// `base64` is pre-read on web by the document picker; native reads it lazily.
export type PickedFile = {
  uri: string;
  isPdf: boolean;
  base64?: string;
  name?: string;
};

export type Subject = {
  id: number;
  name: string;
  registration_no?: string; // ICO
  vat_no?: string; // DIC
};

export type CreatedExpense = {
  id: number;
  number: string | null;
  url: string | null;
  subject?: { id: number; name?: string; matchedBy?: string; created?: boolean };
};

export type ProviderId = "fakturoid" | "idoklad";

// UI languages the app ships translations for; "system" follows the device.
export const SUPPORTED_LANGUAGES = ["en", "cs", "de", "sk"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePref = "system" | Language;

// BYOK config. OpenAI key is provider-independent; each accounting provider has
// its own credentials, stored namespaced as `${providerId}.${fieldKey}`.
export type Settings = {
  openaiApiKey: string;
  provider: ProviderId;
  creds: Record<string, string>;
  recentTags?: string[]; // recently used expense tags, most-recent first (for quick re-add)
  language?: LanguagePref; // UI language; "system" (default) follows the device locale
  // Your own company identifiers, checked against receipts over the simplified-document limit.
  ico?: string; // your IČO
  vatId?: string; // your DIČ
};
