# invoice-extractor

A mobile app that photographs a Czech store receipt (účtenka), parses it into **line
items + prices + per-line VAT** with a vision LLM, lets you **review/edit**, and creates an
expense (**náklad**) in Fakturoid — all from the phone, no backend.

```
[Expo app]  ──your OpenAI key──▶  OpenAI (photo → structured JSON)
  capture / review / confirm
            ──your Fakturoid creds──▶  Fakturoid v3 (match supplier by IČO, create náklad)
```

## Bring your own keys (BYOK)
The app holds no shared secrets. Each user enters, in **Settings** (stored in
`expo-secure-store` on the device):
- an **OpenAI API key** (parses the image — ~$0.01/receipt)
- **Fakturoid** Client ID + Client Secret + account slug (creates the expense)

## Run
```bash
cd app
npm install
npx expo start          # open in Expo Go (SDK 54) on your phone
```
See `app/README.md` for the SDK note and troubleshooting.

First launch → **Settings ⚙︎**: paste your OpenAI key and Fakturoid Client ID / Secret /
slug, tap **Test connection**, Save. Then take a photo → review items, per-line VAT, and
supplier (auto-matched by IČO, with manual override) → **Create expense**.

## How it works
- `app/src/openai.ts` — sends the downscaled photo to OpenAI with Structured Outputs and a
  receipt JSON schema (`app/src/receipt.ts`).
- `app/src/fakturoid.ts` — Fakturoid v3 client: OAuth token, search/create supplier by IČO,
  create expense (per-line VAT, `vat_price_mode: from_total_with_vat`).
- `app/src/screens/` — Capture, Review (edit + VAT reconciliation), Settings, Success.

## Notes
- Native camera needs a real device (Expo Go or a dev build), not the web target.
- A prior version used a Node/Express backend; it was removed in favor of BYOK app-direct.
  It's still in git history if you ever want a managed backend (recommended if this goes
  public — see below).

## If this ever goes public / to a store
BYOK gets clunky (per-user key setup) and storing each user's Fakturoid secret on-device is
a powerful credential. At that point a managed backend — users authorize via Fakturoid
OAuth redirect and you hold tokens server-side — is the cleaner model.
