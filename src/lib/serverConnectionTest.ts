import { t } from "@lingui/core/macro";
import { isGateLoginContentType } from "./opencodeCookie.ts";
import { basicAuthHeader } from "./opencode.ts";
import { authFailureMessage, isAuthFailureMessage } from "./serverAuthError.ts";
import { normalizeServerBaseUrl } from "./serverBaseUrl.ts";

/**
 * Connection test before save ("Verbindung testen" next to the server
 * add/edit form).
 *
 * Performs `GET {baseUrl}/api/info` with the ENTERED credentials — passed in
 * directly, never read from (or written to) the credential vault, so testing
 * never persists anything. The base URL is normalized first (same
 * `normalizeServerBaseUrl` the save path uses), so a deep URL that was typed
 * rather than pasted (session link, `/api` suffix) tests the URL that will
 * actually be saved, while a real reverse-proxy subpath is kept.
 *
 * Results are differentiated German messages: success (with version), 401/403
 * via the shared auth-error mapping (`src/lib/serverAuthError.ts`), 302/HTML
 * login page via the gate detection (`src/lib/opencodeCookie.ts`), a foreign
 * origin that serves a page instead of the API, network/CORS failure with an
 * Erreichbarkeits-Hinweis mentioning `--cors`, and a 15s timeout.
 *
 * Gate vs. foreign origin: the cookie gate answers API requests with a
 * redirect (verified: `302 → /login.html`), so a followed redirect to the
 * HTML login page is a gate. HTML served DIRECTLY at `/api/info` without a
 * redirect comes from an origin that has no opencode API behind it — that is
 * the foreign-origin case. Both are told apart from the single `/api/info`
 * response; no extra request is made.
 *
 * Pure module (fetch is injected), unit-testable without rendering.
 */

export interface ConnectionTestInput {
  baseUrl: string;
  username: string;
  password: string;
}

export type ConnectionTestStatus =
  | "success"
  | "auth"
  | "gate"
  | "no-api"
  | "timeout"
  | "unreachable"
  | "invalid-url"
  | "http-error";

export interface ConnectionTestResult {
  status: ConnectionTestStatus;
  message: string;
  /** Server version from `/api/info`, when the response carried one. */
  version: string | null;
  /**
   * The actually requested URL (`{base}/api/info`, base = normalized origin or
   * reverse-proxy subpath), so path mistakes stay visible. `null` when no
   * request was made (invalid URL).
   */
  url: string | null;
}

export type ConnectionTestFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** Hard cap for one connection test; a hanging host must not hang the UI. */
export const CONNECTION_TEST_TIMEOUT_MS = 15_000;

/** Sentinel thrown by the timeout timer so it is not confused with a real failure. */
class ConnectionTimeoutError extends Error {}

export function connectionSuccessMessage(version: string | null): string {
  if (version === null) return t`Verbindung erfolgreich.`;
  return t`Verbindung erfolgreich (Version ${version}).`;
}

/** 401/403 — reuses the shared auth-error mapping text. */
export function connectionAuthMessage(): string {
  return authFailureMessage();
}

export function connectionGateMessage(): string {
  return t`Server antwortet mit einer Login-Seite statt mit der API. Bitte zuerst im Browser einloggen (Cookie-Gate).`;
}

export function connectionNoApiMessage(): string {
  return t`Unter dieser URL läuft keine Opencode-API. Bitte die Basis-URL prüfen (Origin oder Reverse-Proxy-Pfad, ohne /api).`;
}

export function connectionTimeoutMessage(): string {
  return t`Zeitüberschreitung: Der Server hat nicht innerhalb von 15 Sekunden geantwortet. Bitte prüfen, ob der Server erreichbar ist.`;
}

export function connectionUnreachableMessage(): string {
  return t`Server nicht erreichbar (Netzwerk- oder CORS-Fehler). Bitte prüfen, ob der Server läuft, und CORS beachten (opencode serve --cors).`;
}

export function connectionInvalidUrlMessage(): string {
  return t`Basis-URL ist ungültig. Bitte mit http:// oder https:// eingeben.`;
}

export function connectionHttpErrorMessage(status: number): string {
  return t`Server antwortet mit Fehler-Status ${status}.`;
}

export function connectionUnexpectedBodyMessage(): string {
  return t`Server antwortet unerwartet (kein JSON). Bitte Basis-URL prüfen.`;
}

function readStringField(record: Record<string, unknown>, key: string): string | null {
  const value: unknown = record[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/** Tolerant version read: `{version}` or nested under `data`/`info`. */
function readVersion(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const direct = readStringField(record, "version");
  if (direct !== null) return direct;
  for (const key of ["data", "info"]) {
    const nested: unknown = record[key];
    if (nested !== null && typeof nested === "object") {
      const version = readStringField(nested as Record<string, unknown>, "version");
      if (version !== null) return version;
    }
  }
  return null;
}

/**
 * `GET {base}/api/info` with the given (unsaved) credentials, mapped to a
 * German result. Never persists anything — callers pass the form values
 * directly. The request is aborted after {@link CONNECTION_TEST_TIMEOUT_MS}.
 */
export async function testServerConnection(
  input: ConnectionTestInput,
  fetchFn: ConnectionTestFetch = globalThis.fetch,
): Promise<ConnectionTestResult> {
  const base = normalizeServerBaseUrl(input.baseUrl).replace(/\/+$/, "");
  try {
    const url = new URL(base);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { status: "invalid-url", message: connectionInvalidUrlMessage(), version: null, url: null };
    }
  } catch {
    return { status: "invalid-url", message: connectionInvalidUrlMessage(), version: null, url: null };
  }
  const target = `${base}/api/info`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (input.username.trim() !== "" || input.password !== "") {
    headers["Authorization"] = basicAuthHeader({
      username: input.username.trim(),
      password: input.password,
    });
  }
  let response: Response;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      // Abort the real request and fail the race even when the injected fetch
      // ignores the signal (a hanging mock must still time out).
      controller.abort();
      reject(new ConnectionTimeoutError());
    }, CONNECTION_TEST_TIMEOUT_MS);
  });
  try {
    const request = fetchFn(target, { method: "GET", headers, signal: controller.signal });
    // Swallow a late AbortError so the timeout path leaves no unhandled
    // rejection when the fetch implementation does honour the signal.
    request.catch(() => undefined);
    response = await Promise.race([request, timedOut]);
  } catch (error) {
    // The timeout timer aborts the controller and rejects; a real fetch may
    // reject with its own AbortError first, so the aborted signal is the
    // reliable timeout marker.
    if (error instanceof ConnectionTimeoutError || controller.signal.aborted) {
      return { status: "timeout", message: connectionTimeoutMessage(), version: null, url: target };
    }
    // Network down, DNS/host unreachable, or the CORS preflight rejected —
    // the browser surfaces all of these as a rejected fetch.
    return { status: "unreachable", message: connectionUnreachableMessage(), version: null, url: target };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
  const isHtml = isGateLoginContentType(response.headers.get("content-type"));
  // Gate login page: the cookie gate answers API requests with a redirect
  // (302 → /login.html). A followed redirect to HTML marks the gate; a raw,
  // unfollowed 3xx does too. Checked before 401/403 — an HTML body is
  // explicitly NOT an auth failure.
  if ((response.redirected && isHtml) || (response.status >= 300 && response.status < 400)) {
    return { status: "gate", message: connectionGateMessage(), version: null, url: target };
  }
  // Reuse the shared auth-error mapping: 401/403 mean the server is reachable
  // (CORS fine) but the credentials are wrong.
  if (isAuthFailureMessage(`GET /api/info failed with status ${response.status}`)) {
    return { status: "auth", message: connectionAuthMessage(), version: null, url: target };
  }
  // HTML served DIRECTLY at /api/info (no redirect), or a 404: this origin has
  // no opencode API behind it. Distinct from the gate, which redirects to its
  // login page.
  if (isHtml || response.status === 404) {
    return { status: "no-api", message: connectionNoApiMessage(), version: null, url: target };
  }
  if (!response.ok) {
    return {
      status: "http-error",
      message: connectionHttpErrorMessage(response.status),
      version: null,
      url: target,
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      status: "http-error",
      message: connectionUnexpectedBodyMessage(),
      version: null,
      url: target,
    };
  }
  const version = readVersion(body);
  return { status: "success", message: connectionSuccessMessage(version), version, url: target };
}
