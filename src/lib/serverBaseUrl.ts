/**
 * Server base-URL normalization.
 *
 * `opencode serve` serves the API (`/api/*`) and the web client (`/`) on the
 * SAME origin, and the generated client resolves its request paths relative to
 * the base (`new URL("api/info", baseUrl + "/")`), while the direct-fetch
 * fallbacks string-concat (`{baseUrl}/api/…`). A deep URL therefore breaks the
 * request (`https://host/api` → `/api/api/info` → 404) or is silently dropped.
 *
 * A server may also sit behind a reverse proxy under a subpath
 * (`https://host/opencode`), where the API lives at
 * `https://host/opencode/api/info`. That prefix MUST survive normalization,
 * because the client resolves every request relative to it and the fallbacks
 * concatenate it.
 *
 * Rules (http/https only):
 * - A path starting with `/server/<base64>` (this app's own share/deep-link
 *   shape, e.g. `…/server/<base64>/session/<id>`) resolves to the DECODED
 *   server URL: the segment is base64-decoded (standard and urlsafe
 *   alphabets, padding optional), validated as an http(s) URL, and normalized
 *   with these same rules — so a decoded reverse-proxy subpath survives while
 *   a decoded deep tail is dropped. Invalid base64 (or a decoded value that
 *   is not an http(s) URL) falls through to the rules below, never destroying
 *   the input.
 * - A path segment naming the API or one of this app's own routes
 *   (`api`, `session`, `sessions`, `servers`, case-insensitive) — and
 *   everything after it — is dropped: it is a deep link, never a proxy
 *   prefix. `…/api/info`, `…/session/<id>`, `…/sessions/<id>` and
 *   `…/servers/<id>` all collapse to whatever precedes
 *   the reserved segment (the origin when nothing does).
 * - Any other path is kept minus trailing slashes; query and fragment are
 *   always dropped. `https://host/opencode` stays `https://host/opencode`.
 * - Non-URL text (or non-http(s) schemes) passes through trimmed but otherwise
 *   unchanged, so pasting a hostname fragment never destroys it.
 *
 * Used in four places so all input paths agree:
 * - on paste in the Settings form (once, visibly),
 * - on save (`addServer`/`updateServer`),
 * - in the connection test, so the test reflects what will actually be saved,
 * - for the `VITE_DEFAULT_SERVER_URL` selection.
 */

/** Path segments that mark a deep link (opencode API / this app's routes). */
const RESERVED_SEGMENTS = new Set(["api", "session", "sessions", "servers"]);

/** First path segment of this app's own share/deep-link shape. */
const EMBEDDED_SERVER_SEGMENT = "server";

/** Parse `value` as an http(s) URL, or `null` when it is not one. */
function parseHttpUrl(value: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed;
}

/**
 * Decode a base64-encoded server URL from a `/server/<base64>` path segment.
 * Accepts the standard and urlsafe alphabets, with or without padding. The
 * decoded text must itself parse as an http(s) URL; anything else (invalid
 * base64, non-URL text, non-http(s) scheme) yields `null` so the caller falls
 * through to the regular normalization rules instead of destroying input.
 */
function decodeEmbeddedServerUrl(segment: string): string | null {
  const standard = segment.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(standard)) return null;
  if (standard.length % 4 === 1) return null;
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  let bytes: string;
  try {
    bytes = atob(padded);
  } catch {
    return null;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bytes, (char) => char.charCodeAt(0)),
    );
  } catch {
    return null;
  }
  const decoded = text.trim();
  if (parseHttpUrl(decoded) === null) return null;
  return decoded;
}

/**
 * Normalize entered text to a working server base URL: the origin plus an
 * optional reverse-proxy subpath, with any deep-link tail removed. Non-URL
 * text (or non-http(s) schemes) passes through trimmed but otherwise
 * unchanged, so a hostname fragment never gets destroyed.
 */
export function normalizeServerBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return trimmed;
  const parsed = parseHttpUrl(trimmed);
  if (parsed === null) return trimmed;
  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
  const head = segments[0];
  if (segments.length >= 2 && head !== undefined && head.toLowerCase() === EMBEDDED_SERVER_SEGMENT) {
    const segment = segments[1];
    if (segment !== undefined) {
      const decoded = decodeEmbeddedServerUrl(segment);
      // The decoded value is the real server URL: normalize it with the same
      // rules (a decoded subpath survives, a decoded deep tail is dropped).
      if (decoded !== null) return normalizeServerBaseUrl(decoded);
    }
  }
  const deepLink = segments.findIndex((segment) =>
    RESERVED_SEGMENTS.has(segment.toLowerCase()),
  );
  const prefix = deepLink === -1 ? segments : segments.slice(0, deepLink);
  if (prefix.length === 0) return parsed.origin;
  return `${parsed.origin}/${prefix.join("/")}`;
}
