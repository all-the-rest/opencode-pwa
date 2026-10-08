/**
 * Server base-URL normalization.
 *
 * `opencode serve` serves the API (`/api/*`) and the web client (`/`) on the
 * SAME origin, and the generated client resolves its request paths relative to
 * that origin (`new URL("api/info", baseUrl)`), while the direct-fetch
 * fallbacks string-concat (`{baseUrl}/api/…`). Any path, query, fragment or
 * `/api` suffix in the entered base URL therefore breaks the request
 * (`https://host/api` → `/api/api/info` → 404) or is silently dropped. This
 * module collapses every http(s) URL to its origin (scheme + host + port).
 *
 * Used in three places so all input paths agree:
 * - on paste in the Settings form (once, visibly),
 * - on save (`addServer`/`updateServer`), so typed or autofilled deep URLs
 *   also end in a working server entry,
 * - in the connection test, so the test reflects what will actually be saved.
 *
 * Non-URL text (or non-http(s) schemes) passes through trimmed but otherwise
 * unchanged, so pasting a hostname fragment never destroys what the user
 * pasted.
 */

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
 * Normalize entered text to the server origin. Non-URL text (or non-http(s)
 * schemes) passes through trimmed but otherwise unchanged, so a hostname
 * fragment never gets destroyed.
 */
export function normalizeServerBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return trimmed;
  const parsed = parseHttpUrl(trimmed);
  if (parsed === null) return trimmed;
  return parsed.origin;
}
