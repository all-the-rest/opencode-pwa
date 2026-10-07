import { t } from "@lingui/core/macro";
import { isGateLoginContentType } from "./opencodeCookie.ts";
import { basicAuthHeader } from "./opencode.ts";
import { authFailureMessage, isAuthFailureMessage } from "./serverAuthError.ts";

/**
 * Connection test before save ("Verbindung testen" next to the server
 * add/edit form).
 *
 * Performs `GET {baseUrl}/api/info` with the ENTERED credentials — passed in
 * directly, never read from (or written to) the credential vault, so testing
 * never persists anything. The result is a differentiated German message:
 * success (with version), 401/403 via the shared auth-error mapping
 * (`src/lib/serverAuthError.ts`), 302/HTML login page via the gate detection
 * (`src/lib/opencodeCookie.ts`), network/CORS failure with an
 * Erreichbarkeits-Hinweis mentioning `--cors`.
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
  | "unreachable"
  | "invalid-url"
  | "http-error";

export interface ConnectionTestResult {
  status: ConnectionTestStatus;
  message: string;
  /** Server version from `/api/info`, when the response carried one. */
  version: string | null;
  /**
   * The actually requested URL (`{baseUrl}/api/info`), so path mistakes in
   * the base URL stay visible. `null` when no request was made (invalid URL).
   */
  url: string | null;
}

export type ConnectionTestFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

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
 * GET `{baseUrl}/api/info` with the given (unsaved) credentials and map the
 * outcome to a German result. Never persists anything — callers pass the
 * form values directly.
 */
export async function testServerConnection(
  input: ConnectionTestInput,
  fetchFn: ConnectionTestFetch = globalThis.fetch,
): Promise<ConnectionTestResult> {
  const base = input.baseUrl.trim().replace(/\/+$/, "");
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
  try {
    response = await fetchFn(target, { method: "GET", headers });
  } catch {
    // Network down, DNS/host unreachable, or the CORS preflight rejected —
    // the browser surfaces all of these as a rejected fetch.
    return { status: "unreachable", message: connectionUnreachableMessage(), version: null, url: target };
  }
  // Login page instead of JSON (gate answered directly, or a 302 was followed
  // to it): gate hint, never the credentials text. Checked before the
  // 401/403 mapping — an HTML body is explicitly NOT an auth failure.
  if (isGateLoginContentType(response.headers.get("content-type"))) {
    return { status: "gate", message: connectionGateMessage(), version: null, url: target };
  }
  // Reuse the shared auth-error mapping: 401/403 mean the server is reachable
  // (CORS fine) but the credentials are wrong.
  if (isAuthFailureMessage(`GET /api/info failed with status ${response.status}`)) {
    return { status: "auth", message: connectionAuthMessage(), version: null, url: target };
  }
  if (response.status >= 300 && response.status < 400) {
    return { status: "gate", message: connectionGateMessage(), version: null, url: target };
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
