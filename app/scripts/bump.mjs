// Bump the app version in one place. Updates app.json expo.version (semver) and
// increments android.versionCode, then syncs package.json.
// Usage: npm run bump -- <patch|minor|major>   (default: patch)
import { readFileSync, writeFileSync } from "node:fs";

const kind = process.argv[2] || "patch";
if (!["patch", "minor", "major"].includes(kind)) {
  console.error("usage: npm run bump -- <patch|minor|major>");
  process.exit(1);
}

const appPath = new URL("../app.json", import.meta.url);
const pkgPath = new URL("../package.json", import.meta.url);

const app = JSON.parse(readFileSync(appPath, "utf8"));
let [maj, min, pat] = String(app.expo.version).split(".").map(Number);
if (kind === "major") {
  maj += 1;
  min = 0;
  pat = 0;
} else if (kind === "minor") {
  min += 1;
  pat = 0;
} else {
  pat += 1;
}
const version = `${maj}.${min}.${pat}`;

app.expo.version = version;
app.expo.android.versionCode = (app.expo.android.versionCode || 0) + 1;
writeFileSync(appPath, JSON.stringify(app, null, 2) + "\n");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`Bumped to ${version} (versionCode ${app.expo.android.versionCode}). package.json synced.`);
console.log(`Next: git commit -am "Bump to v${version}" && git tag v${version} && git push --tags`);
