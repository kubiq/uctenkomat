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

// BYOK config — each user supplies their own keys, stored in expo-secure-store.
export type Settings = {
  openaiApiKey: string;
  fakturoidClientId: string;
  fakturoidClientSecret: string;
  fakturoidSlug: string; // account slug from the Fakturoid URL
};
