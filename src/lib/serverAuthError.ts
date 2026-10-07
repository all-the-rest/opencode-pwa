import { t } from "@lingui/core/macro";

/**
 * Basic-auth failure mapping (Caddy Basic-gate in front of the API).
 *
 * When the gate rejects the credentials it answers 401 with a `text/plain`
 * body. That body never reaches the caller as a declared 401: the generated
 * client first tries to parse it as JSON (`declaredStatuses` includes 401)
 * and throws `ClientError` (`reason: "UnsupportedContentType"`, message
 * `UnsupportedContentType: text/plain; charset=utf-8`) instead. The server
 * is REACHABLE in that case (CORS fine) — only the credentials are wrong —
 * so the UI must not print the technical string as an "offline" note.
 *
 * Pure module, unit-testable without rendering.
 */

/** Friendly German message shown when the credentials are rejected. */
export function authFailureMessage(): string {
  return t`Anmeldung fehlgeschlagen. Bitte Benutzername und Server-Passwort in den Einstellungen prüfen.`;
}

const FETCH_STATUS_RE = /failed with status\s+40[13]\b/i;
const CLIENT_STATUS_RE = /UnexpectedStatus:\s*40[13]\b/;
const STATUS_WORD_RE = /\bstatus\D{0,4}40[13]\b/i;
const UNAUTHORIZED_RE = /\bunauthorized\b/i;
const FORBIDDEN_RE = /\bforbidden\b/i;
const GATE_PAGE_RE = /text\/html/i;
const PLAIN_PAGE_RE = /UnsupportedContentType:[^\n]*text\/plain/i;
const PLAIN_WORD_RE = /text\/plain/i;

/**
 * String-level auth detection. Everything the API layer stores in page
 * state is already a string (`guarded` maps the thrown error via
 * `error.message`), so the banner only ever sees text:
 * - direct-fetch fallback: `GET /api/project failed with status 401`
 * - client rejection: `UnexpectedStatus: 401`
 * - Caddy 401 page: `UnsupportedContentType: text/plain; charset=utf-8`
 *
 * The cookie-gate login page (`text/html`) is explicitly NOT an auth
 * failure — it has its own hint (`isGateLoginError`).
 */
export function isAuthFailureMessage(text: string): boolean {
  if (GATE_PAGE_RE.test(text)) return false;
  if (FETCH_STATUS_RE.test(text)) return true;
  if (CLIENT_STATUS_RE.test(text)) return true;
  if (STATUS_WORD_RE.test(text)) return true;
  if (UNAUTHORIZED_RE.test(text)) return true;
  if (FORBIDDEN_RE.test(text)) return true;
  if (PLAIN_PAGE_RE.test(text)) return true;
  return false;
}

function errorReason(error: Error): unknown {
  return (error as { reason?: unknown }).reason;
}

/** `cause.status` of a `ClientError("UnexpectedStatus", ...)`, if 401/403. */
function causeStatus(error: Error): 401 | 403 | null {
  const cause: unknown = (error as { cause?: unknown }).cause;
  if (cause !== null && typeof cause === "object") {
    const status: unknown = (cause as Record<string, unknown>)["status"];
    if (status === 401 || status === 403) return status;
  }
  return null;
}

/**
 * Object-level auth detection: accepts the thrown error itself (with
 * `reason`/`cause`/`name` intact) as well as the already-stringified page
 * error. Plain network failures (`Transport`, `Failed to fetch`, …) return
 * `false` and keep the existing offline text.
 */
export function isAuthFailure(error: unknown): boolean {
  if (typeof error === "string") return isAuthFailureMessage(error);
  if (!(error instanceof Error)) return false;
  const reason = errorReason(error);
  if (reason === "UnsupportedContentType") {
    // The Caddy 401 page arrives as text/plain; the cookie-gate login page
    // (text/html) belongs to the gate hint, not to the credentials message.
    if (GATE_PAGE_RE.test(error.message)) return false;
    return PLAIN_WORD_RE.test(error.message);
  }
  if (reason === "UnexpectedStatus") {
    if (causeStatus(error) !== null) return true;
    return isAuthFailureMessage(error.message);
  }
  if (error.name === "Unauthorized" || error.name === "Forbidden") return true;
  return isAuthFailureMessage(error.message);
}
