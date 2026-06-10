# Receipt → Fakturoid (Expo app)

Mobile frontend: photograph a receipt → the backend parses it → review/edit → create a
náklad in Fakturoid. See the repo root `README.md` for the backend.

## Run in development
```bash
npm install
npx expo start
```
Then open the project in **Expo Go** (or a dev build — see troubleshooting) on your phone.

On first launch, open **Settings ⚙︎** and set:
- **Server URL** — your backend (see LAN setup below for local dev)
- **API key** — the `APP_API_KEY` from `server/.env`

Tap **Test connection**, Save, then capture a receipt.

## Local dev: reaching the backend over LAN
The backend runs on your computer (port `3300`), but the app runs on your **phone**, so
`localhost` won't work — the phone needs your computer's **LAN IP**.

1. Phone and computer must be on the **same Wi‑Fi**.
2. Find your computer's LAN IP:
   ```bash
   ip -4 addr | grep -oP 'inet \K[0-9.]+' | grep -v '^127\.'
   # ignore Docker ranges (172.x); use the real LAN one, e.g. 10.69.69.200
   ```
3. In the app **Settings → Server URL**, enter:
   ```
   http://10.69.69.200:3300
   ```
   (replace with your IP). Plain `http` is fine for LAN dev.
4. Make sure the backend is running (`cd ../server && npm start`) and the port is open:
   ```bash
   # if you use a firewall, allow the port, e.g. ufw:
   sudo ufw allow 3300/tcp
   ```
5. Sanity check from the phone's browser: open `http://10.69.69.200:3300/api/health`
   → should show `{"ok":true}`.

> The Metro bundler (`expo start`, port 8081) also needs the same Wi‑Fi. If the QR won't
> connect, try `npx expo start --tunnel`.

For production, point Server URL at your deployed HTTPS domain instead (see root README).

## Expo SDK
This project is pinned to **Expo SDK 54** to match the Expo Go available on the Play Store.
If you upgrade Expo Go later and want a newer SDK, bump it with `npx expo install expo@^<n>`
then `npx expo install --fix`.

## Troubleshooting: "you need a newer version of Expo Go"
This means the project's Expo SDK is newer than the Expo Go app installed on your phone.
Even the Play Store build can lag a new SDK for a while. Two ways to fix it:

**A. Use a development build (recommended — works with any SDK)**
A dev build is your own app binary with the dev client baked in; it always matches this
project's SDK.
```bash
# build + install on a USB-connected device / emulator (needs Android Studio + SDK):
npx expo run:android

# or build in the cloud and install the APK on your phone (no Android Studio):
npm install -g eas-cli
eas build --profile development --platform android
```
Then run `npx expo start` and open the project in that dev build instead of Expo Go.

**B. Match the project to your Expo Go's SDK**
Open Expo Go — its home screen lists the **supported SDK**. If it's older than 56, pin this
project to it:
```bash
npx expo install expo@<supported-sdk>   # e.g. expo@^55
npx expo install --fix                  # align all packages to that SDK
```
Re-run `npx expo start`. (Option A is cleaner long-term; B is the quick path.)

## Notes
- Native camera needs a real device (or emulator) — the web target won't capture photos.
- The app stores Server URL + API key in `expo-secure-store`.
