/**
 * Deep-URL paste normalization (board TODO): pasting a deep URL into the
 * base-URL field (e.g. `https://host/sessions/…`, `https://host/api/info?x=…`,
 * PWA URLs like `https://ocweb…/servers/…`) normalizes ONCE on paste to the
 * server origin (scheme + host + port only).
 *
 * Paste-only: manual typing is untouched — the Settings form calls this from
 * the input's `onPaste` handler, never from `onChange`. Pure module,
 * unit-testable without rendering.
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
 * Normalize pasted text to the server origin. Non-URL text (or non-http(s)
 * schemes) passes through trimmed but otherwise unchanged, so pasting a
 * hostname fragment never destroys what the user pasted.
 */
export function normalizeServerBaseUrlOnPaste(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return trimmed;
  const parsed = parseHttpUrl(trimmed);
  if (parsed === null) return trimmed;
  return parsed.origin;
}
