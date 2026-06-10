import type { Receipt, Settings } from "./types";
import { RECEIPT_PROMPT, RECEIPT_JSON_SCHEMA } from "./receipt";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_MODEL = "gpt-4o";

/** Validate the OpenAI key cheaply (used by Settings "test"). Free, no tokens. */
export async function checkOpenAiKey(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

/**
 * Parse a receipt image (base64 JPEG) into structured JSON via OpenAI vision +
 * Structured Outputs. Runs entirely on-device with the user's own key.
 */
export async function parseReceipt(settings: Settings, base64Jpeg: string): Promise<Receipt> {
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: RECEIPT_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the purchased line items and their prices." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "receipt", strict: true, schema: RECEIPT_JSON_SCHEMA },
    },
  };

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = `OpenAI error ${res.status}`;
    try {
      const e = await res.json();
      msg = e?.error?.message ?? msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const json = await res.json();
  const msg = json.choices?.[0]?.message;
  if (msg?.refusal) throw new Error(`Model refused: ${msg.refusal}`);
  const content = msg?.content;
  if (!content) throw new Error("Empty response from OpenAI");
  return JSON.parse(content) as Receipt;
}
