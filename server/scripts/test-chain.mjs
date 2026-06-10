// Full chain test: parse image -> resolve supplier by IČO -> (optionally) create expense.
// Usage:
//   node --env-file=.env scripts/test-chain.mjs [image-path]            # dry run
//   node --env-file=.env scripts/test-chain.mjs [image-path] --create   # really create the náklad
//   (npm run test:chain -- [image-path] [--create])
import { readFile } from "node:fs/promises";
import path from "node:path";

const PORT = process.env.PORT || 3000;
const KEY = process.env.APP_API_KEY;
const BASE = `http://localhost:${PORT}`;

const args = process.argv.slice(2);
const create = args.includes("--create");
const imagePath =
  args.find((a) => !a.startsWith("--")) || "/home/jakub/Pictures/Camera/20260610_105123.jpg";

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };

if (!KEY) {
  console.error("APP_API_KEY missing in .env");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${KEY}` };

function die(label, status, body) {
  console.error(`\n${label} failed [${status}]:`, body);
  process.exit(1);
}

// 1) parse ------------------------------------------------------------------
const buf = await readFile(imagePath);
const mime = MIME[path.extname(imagePath).toLowerCase()] || "image/jpeg";
const form = new FormData();
form.append("file", new Blob([buf], { type: mime }), path.basename(imagePath));

console.log(`Parsing ${path.basename(imagePath)} …`);
let res = await fetch(`${BASE}/api/receipts/parse`, { method: "POST", headers: auth, body: form });
let text = await res.text();
if (!res.ok) die("parse", res.status, text);
const receipt = JSON.parse(text);
console.log("\n--- parsed receipt ---");
console.log(JSON.stringify(receipt, null, 2));

// 1b) VAT reconciliation ----------------------------------------------------
const round2 = (n) => Math.round(n * 100) / 100;
const lineGross = round2(receipt.items.reduce((a, it) => a + (it.total_price || 0), 0));
console.log("\n--- VAT check ---");
console.log(`line gross sum: ${lineGross}   receipt total: ${receipt.total}` +
  (Math.abs(lineGross - (receipt.total ?? lineGross)) > 0.001 ? "  ⚠ differs" : "  ✓"));
if (receipt.vat_summary?.length) {
  for (const v of receipt.vat_summary) {
    console.log(`  DPH ${v.rate}%: base ${v.base} + vat ${v.vat} = ${round2(v.base + v.vat)}`);
  }
  const recapTotal = round2(receipt.vat_summary.reduce((a, v) => a + v.base + v.vat, 0));
  console.log(`  recap total: ${recapTotal}` +
    (Math.abs(recapTotal - (receipt.total ?? recapTotal)) > 0.001 ? "  ⚠ differs from receipt total" : "  ✓"));
} else {
  console.log("  (no VAT recap extracted)");
}

// 2) preview supplier match by IČO -----------------------------------------
const ico = (receipt.supplier_ico || "").replace(/\D/g, "");
console.log(`\n--- supplier ---\nIČO: ${ico || "(none extracted)"}  DIČ: ${receipt.supplier_dic || "-"}`);
if (ico) {
  res = await fetch(`${BASE}/api/subjects?query=${encodeURIComponent(ico)}`, { headers: auth });
  const sBody = await res.text();
  if (!res.ok) {
    console.log(`subject lookup error [${res.status}]: ${sBody}`);
  } else {
    const subjects = JSON.parse(sBody);
    const match = subjects.find((s) => (s.registration_no || "").replace(/\D/g, "") === ico);
    console.log(match ? `Existing subject: #${match.id} ${match.name}` : "No existing subject — would be created.");
  }
}

// 3) create expense (only with --create) ------------------------------------
if (!create) {
  console.log("\nDry run. Re-run with --create to actually create the náklad in Fakturoid.");
  process.exit(0);
}

console.log("\nCreating expense in Fakturoid …");
res = await fetch(`${BASE}/api/expenses`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ receipt }), // no subjectId -> server resolves by IČO
});
text = await res.text();
if (!res.ok) die("create expense", res.status, text);
const result = JSON.parse(text);
console.log("\n--- created ---");
console.log(JSON.stringify(result, null, 2));
if (result.url) console.log(`\nOpen: ${result.url}`);
