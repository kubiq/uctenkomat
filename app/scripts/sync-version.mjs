// Keep package.json version in sync with app.json (expo.version is the source of
// truth). electron-builder reads package.json; Expo/EAS read app.json — this stops
// them drifting. Run by the pre-commit hook and the bump script.
import { readFileSync, writeFileSync } from "node:fs";

const appPath = new URL("../app.json", import.meta.url);
const pkgPath = new URL("../package.json", import.meta.url);

const app = JSON.parse(readFileSync(appPath, "utf8"));
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

const version = app?.expo?.version;
if (!version) {
  console.error("[sync-version] no expo.version in app.json");
  process.exit(1);
}

if (pkg.version !== version) {
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`[sync-version] package.json version -> ${version}`);
}
