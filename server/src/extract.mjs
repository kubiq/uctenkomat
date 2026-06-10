import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { Receipt, RECEIPT_PROMPT } from "./schema.mjs";

// Same engine WellApp's extractor uses under the hood: a vision LLM via the
// Vercel AI SDK with generateObject + a Zod schema. We inline it because the
// published WellApp package ships only a macOS-arm64 binary (won't run here).

const EXT_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};
const SUPPORTED_MIME = new Set(Object.values(EXT_MIME));

function getModel(vendor, modelId, apiKey) {
  if (vendor === "anthropic") {
    return createAnthropic({ apiKey })(modelId || "claude-3-5-sonnet-latest");
  }
  if (vendor === "openai") {
    return createOpenAI({ apiKey })(modelId || "gpt-4o");
  }
  throw new Error(`Unsupported EXTRACTOR_VENDOR: ${vendor} (use anthropic|openai)`);
}

/**
 * Build the AI SDK content part for a file.
 * Images -> { type: "image" }, PDFs -> { type: "file" }.
 */
function fileContentPart(bytes, mimeType) {
  if (!SUPPORTED_MIME.has(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType} (png/jpg/webp/pdf)`);
  }
  if (mimeType === "application/pdf") {
    return { type: "file", data: bytes, mimeType };
  }
  return { type: "image", image: bytes, mimeType };
}

/**
 * Extract line items from receipt bytes.
 *
 * @param {Buffer|Uint8Array} bytes - raw image/PDF bytes
 * @param {string} mimeType - e.g. "image/jpeg", "application/pdf"
 * @returns {Promise<import("./schema.mjs").Receipt>}
 */
export async function extractReceipt(bytes, mimeType) {
  const vendor = process.env.EXTRACTOR_VENDOR || "anthropic";
  const modelId = process.env.EXTRACTOR_MODEL;
  const apiKey = process.env.EXTRACTOR_API_KEY;

  if (!apiKey) throw new Error("EXTRACTOR_API_KEY is not set (see .env.example)");

  const model = getModel(vendor, modelId, apiKey);

  const { object, usage } = await generateObject({
    model,
    schema: Receipt,
    system: RECEIPT_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          fileContentPart(bytes, mimeType),
          { type: "text", text: "Extract the purchased line items and their prices." },
        ],
      },
    ],
  });

  if (usage) {
    console.log(
      `[extract] tokens in=${usage.promptTokens} out=${usage.completionTokens} items=${object.items?.length ?? 0}`,
    );
  }
  return object;
}

/** Convenience for the CLI / tests: read a file and extract. */
export async function extractReceiptFile(filePath) {
  const mimeType = EXT_MIME[path.extname(filePath).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
  return extractReceipt(await readFile(filePath), mimeType);
}

export { EXT_MIME, SUPPORTED_MIME };

// CLI: node --env-file=.env src/extract.mjs <receipt-file>
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run extract -- <path-to-receipt>");
    process.exit(1);
  }
  try {
    const receipt = await extractReceiptFile(file);
    console.log(JSON.stringify(receipt, null, 2));
  } catch (err) {
    console.error("Extraction failed:", err?.message || err);
    process.exit(1);
  }
}
