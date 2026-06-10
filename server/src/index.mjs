import { extractReceiptFile } from "./extract.mjs";
import { createExpense, findOrCreateSubjectByIco } from "./fakturoid.mjs";

// End-to-end CLI: receipt file -> extracted items -> Fakturoid expense.
// The supplier is resolved from the receipt's IČO (created if missing).
// Usage: npm run expense -- <path-to-receipt>
const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run expense -- <path-to-receipt>");
  process.exit(1);
}

const receipt = await extractReceiptFile(file);
console.log("Extracted:", JSON.stringify(receipt, null, 2));

if (process.env.FAKTUROID_CLIENT_ID) {
  const subject = await findOrCreateSubjectByIco({
    ico: receipt.supplier_ico,
    dic: receipt.supplier_dic,
    name: receipt.supplier_name || receipt.merchant,
  });
  const expense = await createExpense(receipt, { subjectId: subject.id });
  console.log(`\nSupplier: #${subject.id} ${subject.name} (${subject.matchedBy})`);
  console.log(`Created Fakturoid expense #${expense.id} (${expense.number ?? ""})`);
} else {
  console.log("\n(Fakturoid not configured — set FAKTUROID_* in .env to push this as a naklad)");
}
