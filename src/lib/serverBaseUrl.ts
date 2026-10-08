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
 * - A path segment naming the API or one of this app's own routes
 *   (`api`, `sessions`, `servers`, case-insensitive) — and everything after
 *   it — is dropped: it is a deep link, never a proxy prefix. `…/api/info`,
 *   `…/sessions/<id>` and `…/servers/<id>` all collapse to whatever precedes
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
const RESERVED_SEGMENTS = new Set(["api", "sessions", "servers"]);

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
  const deepLink = segments.findIndex((segment) =>
    RESERVED_SEGMENTS.has(segment.toLowerCase()),
  );
  const prefix = deepLink === -1 ? segments : segments.slice(0, deepLink);
  if (prefix.length === 0) return parsed.origin;
  return `${parsed.origin}/${prefix.join("/")}`;
}
