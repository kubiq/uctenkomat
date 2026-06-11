// Electron shell: serves the exported Expo web build (../dist) over a local
// HTTP server and loads it. webSecurity is disabled so the renderer can call
// the Fakturoid API directly (Fakturoid sends no CORS headers); this is safe
// here because the window only ever loads our own bundled, local content.
const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "..", "dist");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const filePath = path.join(DIST, urlPath);
      // Prevent path traversal outside DIST.
      if (!filePath.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback to index.html
          fs.readFile(path.join(DIST, "index.html"), (e2, html) => {
            if (e2) return res.writeHead(404).end("Not found");
            res.writeHead(200, { "Content-Type": "text/html" }).end(html);
          });
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" }).end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function createWindow() {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 460,
    height: 860,
    title: "Receipt to Fakturoid",
    webPreferences: {
      webSecurity: false, // allow direct calls to the Fakturoid API (no CORS)
      contextIsolation: true,
    },
  });
  win.removeMenu?.();
  win.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
