// Electron shell: serves the exported Expo web build (../dist) under a fixed
// custom scheme `app://bundle/` so the origin is STABLE across launches —
// localStorage (where the API keys live) is scoped per-origin, so a stable
// origin is required for settings to persist.
//
// webSecurity is disabled so the renderer can call the Fakturoid API directly
// (Fakturoid sends no CORS headers); safe here because the window only loads
// our own bundled, local content.
const { app, BrowserWindow, protocol, ipcMain, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "..", "dist");

// --- persistent settings store (encrypted JSON file in userData) -----------
// Values are encrypted with the OS keyring via safeStorage when available,
// falling back to plaintext if no keyring is present.
function storeFile() {
  return path.join(app.getPath("userData"), "settings.json");
}
function readStore() {
  try {
    const outer = JSON.parse(fs.readFileSync(storeFile(), "utf8"));
    if (outer && outer.enc === true) {
      return JSON.parse(safeStorage.decryptString(Buffer.from(outer.data, "base64")));
    }
    if (outer && outer.enc === false) return JSON.parse(outer.data);
    // legacy plaintext format: flat { key: value }
    return outer && typeof outer === "object" ? outer : {};
  } catch {
    return {};
  }
}
function writeStore(obj) {
  const json = JSON.stringify(obj);
  const outer = safeStorage.isEncryptionAvailable()
    ? { enc: true, data: safeStorage.encryptString(json).toString("base64") }
    : { enc: false, data: json };
  fs.writeFileSync(storeFile(), JSON.stringify(outer));
}
ipcMain.handle("store:get", (_e, key) => readStore()[key] ?? null);
ipcMain.handle("store:set", (_e, key, value) => {
  const s = readStore();
  s[key] = value;
  writeStore(s);
  return true;
});

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

// Must run before app is ready. `standard: true` is required for localStorage.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    let pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === "/" || pathname === "") pathname = "/index.html";
    const filePath = path.normalize(path.join(DIST, pathname));
    if (!filePath.startsWith(DIST)) return new Response("Forbidden", { status: 403 });
    try {
      const data = await fs.promises.readFile(filePath);
      return new Response(data, { headers: { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" } });
    } catch {
      // SPA fallback
      const html = await fs.promises.readFile(path.join(DIST, "index.html"));
      return new Response(html, { headers: { "content-type": "text/html" } });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 860,
    title: "Účtenkomat",
    webPreferences: {
      webSecurity: false, // allow direct calls to the Fakturoid API (no CORS)
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  win.removeMenu?.();
  win.loadURL("app://bundle/index.html");
}

app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
