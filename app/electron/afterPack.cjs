// electron-builder afterPack hook: ad-hoc sign the macOS bundle.
// electron-builder 25 can't ad-hoc sign, but Apple Silicon needs a valid
// signature on every Mach-O — unsigned reads as "damaged", and re-signing
// without the JIT entitlements makes V8 SIGTRAP at launch. So sign inside-out.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ENTITLEMENTS = path.join(__dirname, "entitlements.mac.plist");

function sign(target, withEntitlements) {
  const args = ["--force", "--sign", "-"];
  if (withEntitlements) args.push("--entitlements", ENTITLEMENTS);
  args.push(target);
  execFileSync("codesign", args, { stdio: "inherit" });
}

function walk(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, fn);
    else fn(full);
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const frameworks = path.join(appPath, "Contents", "Frameworks");

  // Loose dylibs (libffmpeg/libEGL etc.) first.
  walk(frameworks, (p) => {
    if (p.endsWith(".dylib")) sign(p, false);
  });

  // Standalone executables in the framework (e.g. chrome_crashpad_handler).
  const efHelpers = path.join(
    frameworks,
    "Electron Framework.framework",
    "Versions",
    "A",
    "Helpers",
  );
  if (fs.existsSync(efHelpers)) {
    for (const f of fs.readdirSync(efHelpers)) sign(path.join(efHelpers, f), true);
  }

  // Helper apps (run V8 → need entitlements): binary then bundle.
  for (const entry of fs.readdirSync(frameworks)) {
    if (!entry.endsWith(".app")) continue;
    const helper = path.join(frameworks, entry);
    const macos = path.join(helper, "Contents", "MacOS");
    for (const bin of fs.readdirSync(macos)) sign(path.join(macos, bin), true);
    sign(helper, true);
  }

  // Re-seal framework bundles after their nested code is signed.
  for (const entry of fs.readdirSync(frameworks)) {
    if (entry.endsWith(".framework")) sign(path.join(frameworks, entry), false);
  }

  // Main app last (browser process runs V8).
  sign(appPath, true);
};
