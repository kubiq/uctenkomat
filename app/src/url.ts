// Normalize / validate the server URL the user types in Settings.
// - trims whitespace
// - prepends http:// when no protocol is given (the common mistake)
// - strips trailing slashes
// - rejects clearly malformed input
//
// Done with a regex rather than `new URL()` because RN's URL parsing is unreliable.
export function normalizeBaseUrl(input: string): { url: string } | { error: string } {
  let s = (input || "").trim();
  if (!s) return { error: "Enter the server URL." };

  if (/\s/.test(s)) return { error: "URL must not contain spaces." };

  // Missing protocol → assume http (fine for LAN dev).
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "http://" + s;

  const m = /^https?:\/\/[^\s/:?#]+(:\d+)?(\/[^\s]*)?$/i.exec(s);
  if (!m) {
    return { error: "That doesn't look like a valid URL (e.g. http://10.69.69.200:3300)." };
  }

  return { url: s.replace(/\/+$/, "") };
}
