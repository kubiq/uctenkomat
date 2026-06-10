# invoice-extractor

Photograph a Czech store receipt (účtenka) on your phone → a backend parses it into
**line items + prices** with a vision LLM → you **review/edit** → it creates an expense
(**náklad**) in Fakturoid. VAT is not extracted (a flat rate is applied on the Fakturoid
side so the gross matches the receipt).

```
[Expo app] --Bearer key--> [Node API on VPS] --> OpenAI (parse receipt)
  camera/review                 |--> Fakturoid v3 (create náklad)
```

## Layout
```
server/    Node API (parse + Fakturoid) + Dockerfile        → see server/ for env/run
app/       Expo (React Native) mobile app
docker-compose.yml + Caddyfile   deploy: API behind auto-HTTPS Caddy
```

## 1. Backend (local dev)
```bash
cd server
cp .env.example .env     # set APP_API_KEY, EXTRACTOR_API_KEY, FAKTUROID_*
npm install
npm start                # http://localhost:3000
```
Quick check:
```bash
curl localhost:3000/api/health
curl -H "Authorization: Bearer $APP_API_KEY" -F file=@receipts/test.jpg \
     localhost:3000/api/receipts/parse
```
You can still use the CLI: `npm run extract -- receipts/test.jpg`.

### API
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | — | `{ok:true}` (public) |
| POST | `/api/receipts/parse` | multipart `file` | `Receipt` JSON |
| GET | `/api/subjects?query=` | — | supplier list |
| POST | `/api/expenses` | `{receipt, subjectId, vatRate}` | `{id, number, url}` |

All `/api/*` except health require `Authorization: Bearer <APP_API_KEY>`.

## 2. Deploy (your VPS)
1. Point a DNS A-record (e.g. `receipts.yourdomain.tld`) at the VPS.
2. Put that domain in `Caddyfile` (replace `receipts.example.com`).
3. Ensure `server/.env` is filled in.
4. `docker compose up -d --build` → API runs behind Caddy with automatic HTTPS.
5. Verify: `curl https://receipts.yourdomain.tld/api/health`.

## 3. Mobile app
```bash
cd app
npm install
npx expo start            # open in Expo Go on your phone
```
On first launch open **Settings ⚙︎**, set the **Server URL** (your HTTPS domain) and the
**API key** (`APP_API_KEY`), tap *Test connection*, Save. Then: take a photo → review the
items → pick the supplier → set VAT rate → **Create expense**.

> Native modules (camera) need a real device via Expo Go (or a dev build), not the web target.

## Cost
~$0.01 per receipt on gpt-4o; the app downscales photos before upload to keep it down.

## Follow-ups (not built yet)
- Auto-create/match Fakturoid subject by IČO/DIČ.
- Toggle: one summary line vs per-item lines.
- Offline queue + receipt history.
