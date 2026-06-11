# Receipt to Fakturoid

Snap a photo of a Czech store receipt (**účtenka**) and turn it into an expense
(**náklad**) in [Fakturoid](https://www.fakturoid.cz) — right from your phone. A vision LLM
reads the receipt into structured data (items, prices, per-line VAT, supplier IČO/DIČ), you
review and edit, and the app files it in Fakturoid.

No backend, no accounts to trust — you bring your own OpenAI and Fakturoid keys, and they
never leave your device.

```
┌─────────────┐   your OpenAI key    ┌──────────┐
│  Expo app   │ ───────────────────▶ │  OpenAI  │  photo → structured JSON
│  (Android)  │                      └──────────┘
│  capture →  │   your Fakturoid     ┌──────────┐
│  review →   │ ───credentials─────▶ │ Fakturoid│  match supplier by IČO,
│  confirm    │                      │   API v3 │  create the expense (náklad)
└─────────────┘                      └──────────┘
```

## Features
- 📷 **Photo → expense** in a few taps; works on photos and gallery images.
- 🧾 **Czech receipts**: extracts line items, quantities, unit/total prices, and the
  **per-line VAT rate (DPH%)**.
- 🏢 **Supplier auto-match**: resolves the Fakturoid subject by **IČO** (creates it if
  missing), so "Čerpací stanice JIMO PLUS s.r.o." maps to the right legal entity. Manual
  override available.
- ✅ **Review before filing**: edit every field; built-in **VAT reconciliation** warns if
  the recap doesn't add up (catches OCR misreads before they hit your books).
- 🔐 **Bring your own keys (BYOK)**: keys live only in your device's secure storage.
- 💸 **~$0.01 per receipt** in OpenAI usage.

## Screenshots
<p align="center">
  <img src="docs/screenshots/capture.jpg" width="240" alt="Capture screen" />
  &nbsp;
  <img src="docs/screenshots/review.jpg" width="240" alt="Review: items, per-line VAT, supplier auto-matched by IČO" />
  &nbsp;
  <img src="docs/screenshots/settings.jpg" width="240" alt="Settings: bring your own keys" />
</p>
<p align="center"><em>Capture &nbsp;·&nbsp; Review (per-line VAT, supplier auto-matched by IČO) &nbsp;·&nbsp; Settings (BYOK)</em></p>

## Install (Android)
Not on the Play Store — install the APK directly:

1. Download the latest `.apk` from the [**Releases**](https://github.com/kubiq/receipt-to-fakturoid-app/releases/latest) page on your phone.
2. Open it; when Android asks, allow **installing unknown apps** for your browser/files app.
3. Open the app → **Settings** → enter your OpenAI key and Fakturoid Client ID / Secret / slug.

**Stay updated automatically** with [Obtainium](https://github.com/ImranR98/Obtainium): install
Obtainium, *Add App*, paste `https://github.com/kubiq/receipt-to-fakturoid-app`, and it will
install/update this app straight from GitHub Releases — no app store needed.

## How it works
The app talks directly to OpenAI and Fakturoid — there is no server in between.

- `app/src/openai.ts` — sends the downscaled photo to OpenAI with **Structured Outputs**
  and a receipt JSON schema (`app/src/receipt.ts`).
- `app/src/fakturoid.ts` — Fakturoid v3 client: OAuth token, search/create supplier by
  IČO, create expense (per-line VAT, `vat_price_mode: from_total_with_vat`).
- `app/src/screens/` — Capture, Review (edit + VAT reconciliation), Settings, Success.

## Requirements
- An **OpenAI API key** — <https://platform.openai.com> (vision-capable, e.g. `gpt-4o`).
- A **Fakturoid** account and an **API app** (Client Credentials):
  *Nastavení → API / Propojení aplikací → Nová aplikace*. You'll get a **Client ID** and
  **Client Secret**; your **account slug** is the part in `https://app.fakturoid.cz/<slug>/…`.
- For development: [Node.js](https://nodejs.org) + [Expo](https://expo.dev) and the **Expo
  Go** app (SDK 54) on an Android phone.

## Getting started (development)
```bash
git clone https://github.com/kubiq/receipt-to-fakturoid-app.git
cd receipt-to-fakturoid-app/app
npm install
npx expo start          # open in Expo Go on your phone
```
On first launch, open **Settings ⚙︎** and enter your OpenAI key and Fakturoid Client ID /
Secret / slug, then **Test connection** → **Save**. Take a photo, review the items and VAT,
pick/confirm the supplier, and **Create expense**.

See [`app/README.md`](app/README.md) for the Expo SDK note and troubleshooting (including
the "needs a newer Expo Go" message and LAN setup).

## Build an installable Android app
Standalone APK via [EAS Build](https://docs.expo.dev/build/introduction/) — no Google Play
account needed for personal use:
```bash
cd app
npm install -g eas-cli
eas login                                   # free Expo account
eas build -p android --profile preview      # → installable APK link
```
Open the resulting link on your phone to install. (`production` profile builds an AAB for
the Play Store.)

### Over-the-air updates
JS/UI changes ship without a rebuild once an EAS-Update-enabled build is installed:
```bash
eas update --branch preview -m "what changed"
```
Native changes (SDK bump, new native module, permissions, app version) still require a new
build.

## Privacy & data
- Your OpenAI and Fakturoid keys are stored only in **`expo-secure-store`** on the device;
  they are never sent anywhere except directly to OpenAI and Fakturoid.
- Receipt **images are sent to OpenAI** for parsing (subject to OpenAI's API data policy).
- Creating an expense writes a **real document** to your Fakturoid account.
- Extraction can make mistakes — **review every expense before filing**, especially VAT.

## Tech stack
React Native · Expo (SDK 54) · TypeScript · OpenAI (vision + Structured Outputs) ·
Fakturoid API v3 · EAS Build & Update.

## Status & roadmap
A personal/BYOK tool. A previous Node/Express backend was removed in favor of app-direct
(still in git history). If this ever grows into a public, store-distributed app, a managed
backend — where users authorize via **Fakturoid OAuth redirect** and tokens are held
server-side — would be the better model than each user pasting a client secret.

## Disclaimer
Not affiliated with Fakturoid or OpenAI. Provided as-is; you are responsible for the
accuracy of the accounting data it produces. Always verify amounts and VAT before filing.

## License
[MIT](LICENSE)
