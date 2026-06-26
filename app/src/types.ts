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

// BYOK config. OpenAI key is provider-independent; each accounting provider has
// its own credentials, stored namespaced as `${providerId}.${fieldKey}`.
export type Settings = {
  openaiApiKey: string;
  provider: ProviderId;
  creds: Record<string, string>;
  recentTags?: string[]; // recently used expense tags, most-recent first (for quick re-add)
};
