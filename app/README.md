# Účtenkomat (app)

The Expo / React Native app. See the repo root `README.md` for what the project does and how to
install released builds; this file is the developer/build reference. Everything lives here — there
is no backend.

## Run in development
```bash
cd app
npm install
npm start                 # Expo Go on a phone (Android)
# or:
npm run electron:dev      # desktop (Electron)
```
On first launch open **Settings ⚙︎** and enter your own **OpenAI API key** and, for the chosen
accounting provider (Fakturoid or iDoklad), its **Client ID / Secret** (+ account slug for
Fakturoid). Settings save automatically. Keys are stored on-device (secure-store on mobile,
encrypted file on desktop, localStorage on web).

## Expo SDK
Pinned to **Expo SDK 54** to match the Expo Go on the Play Store. To move to a newer SDK:
`npx expo install expo@^<n>` then `npx expo install --fix`.

### "You need a newer version of Expo Go"
The project's SDK is newer than the installed Expo Go (the store build can lag). Either:
- **Dev build (any SDK):** `npx expo run:android`, or `eas build --profile development --platform android`.
- **Match Expo Go's SDK:** its home screen shows the supported SDK; pin the project to it as above.

## Desktop (Electron)
Same code, wrapped in Electron. It runs with Node underneath, so it calls the Fakturoid/iDoklad APIs
**directly** — no CORS proxy (a browser PWA would need one). On desktop the camera button is hidden;
the gallery button selects **multiple images at once**, each processed as its own receipt.
```bash
npm run electron:dev        # export web build + launch
npm run electron:build      # installer → app/electron-dist/ (Linux AppImage / Windows .exe / macOS .dmg)
```
- electron-builder packages for the **OS you run it on** (CI builds all three — see root
  `.github/workflows/release.yml`).
- If `npm install` skipped Electron's binary (npm allow-scripts), run `node node_modules/electron/install.js`.
- `webSecurity` is disabled (the window only loads our own local bundle) so the renderer can reach
  the accounting APIs; settings are stored encrypted via the OS keyring (`safeStorage`).

## Versioning
`npm run bump -- <patch|minor|major>` bumps `app.json` version + `android.versionCode` and syncs
`package.json`. A pre-commit hook keeps the two version fields in sync — don't hand-edit them.

## Notes
- Typecheck with `npx tsc --noEmit` (no other test suite). Web bundles via `npx expo export -p web`.
- Native (mobile) camera needs a real device/emulator; web/desktop use file selection instead.
