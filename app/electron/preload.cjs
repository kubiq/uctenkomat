// Exposes a tiny persistent key/value store backed by a JSON file in the main
// process. The renderer (web app) uses this on desktop so settings survive
// restarts (custom-scheme localStorage isn't reliably persisted to disk).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopStore", {
  get: (key) => ipcRenderer.invoke("store:get", key),
  set: (key, value) => ipcRenderer.invoke("store:set", key, value),
});
