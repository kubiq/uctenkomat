// Smoke test — no API calls. Verifies imports resolve and the schema parses,
// so you know the wiring is correct before spending tokens on a real receipt.
import { Receipt } from "./schema.mjs";
import { generateObject } from "ai";

const sample = {
  merchant: "Albert",
  supplier_name: "Albert Česká republika, s.r.o.",
  supplier_ico: "44012373",
  supplier_dic: "CZ44012373",
  date: "2026-06-10",
  currency: "CZK",
  items: [
    { name: "Mleko 1l", quantity: 2, unit_price: "24,90", total_price: "49,80", vat_rate: 12 },
    { name: "Chleb", quantity: 1, unit_price: 39, total_price: 39, vat_rate: "12" },
  ],
  vat_summary: [{ rate: "12", base: "79,29", vat: "9,51" }],
  total: "88,80",
};

const parsed = Receipt.parse(sample);
console.log("Schema OK — coerced output:");
console.log(JSON.stringify(parsed, null, 2));
console.log("\nAI SDK import OK:", typeof generateObject === "function");
