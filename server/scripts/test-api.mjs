// Test the running server end-to-end: health -> parse a receipt image.
// Usage: node --env-file=.env scripts/test-api.mjs [image-path]
//   (npm run test:api -- [image-path])
import { readFile } from "node:fs/promises";
import path from "node:path";

const PORT = process.env.PORT || 3000;
const KEY = process.env.APP_API_KEY;
const BASE = `http://localhost:${PORT}`;
const imagePath =
  process.argv[2] || "/home/jakub/Pictures/Camera/20260610_105123.jpg";

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

if (!KEY) {
  console.error("APP_API_KEY missing — run with: npm run test:api -- <image>");
  process.exit(1);
}

// 1) health (public)
const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch((e) => {
  console.error(`Server not reachable at ${BASE} — is it running? (npm start)`);
  console.error(e.message);
  process.exit(1);
});
console.log("health:", health);

// 2) parse the receipt
const buf = await readFile(imagePath);
const mime = MIME[path.extname(imagePath).toLowerCase()] || "image/jpeg";
console.log(`\nuploading ${path.basename(imagePath)} (${(buf.length / 1024).toFixed(0)} KB, ${mime})…`);

const form = new FormData();
form.append("file", new Blob([buf], { type: mime }), path.basename(imagePath));

const res = await fetch(`${BASE}/api/receipts/parse`, {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}` },
  body: form,
});

const body = await res.text();
if (!res.ok) {
  console.error(`\nparse failed [${res.status}]:`, body);
  process.exit(1);
}
console.log("\nparsed receipt:");
console.log(JSON.stringify(JSON.parse(body), null, 2));
