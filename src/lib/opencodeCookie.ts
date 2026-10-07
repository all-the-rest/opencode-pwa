import { t } from "@lingui/core/macro";
import { OpenCode } from "@opencode/client";
import {
  basicAuthHeader,
  getDecryptedConfig,
  type OpencodeClient,
  type ResolvedServerConfig,
  type ServerConfig,
} from "./opencode.ts";

/**
 * Cookie-bearing client variant for cookie-gated cross-origin servers.
 *
 * The PWA (`https://ocweb.all-the.rest`) talks to the API
 * (`https://remote-code.all-the.rest`) cross-origin behind a gate cookie.
 * Browsers only send that cookie when `fetch` runs with
 * `credentials: "include"`. The generated client
 * (`node_modules/@opencode/client/dist/promise/generated/client.d.ts`,
 * `ClientOptions`) accepts a custom `fetch: typeof globalThis.fetch` but no
 * per-request credentials option (`RequestOptions` only carries
 * `signal`/`headers`/`onActivity`), so the credentials flag is injected by
 * wrapping `fetch` instead.
 *
 * Nothing here changes `src/lib/opencode.ts` — this module is additive until
 * the cookie variant is proven and can take over.
 */

/** A `fetch` implementation, shaped exactly like the client's `fetch` option. */
export type CookieFetch = typeof globalThis.fetch;

/**
 * Wrap `base` so every request carries `credentials: "include"`. Any
 * caller-supplied `credentials` value is overridden — the gate cookie must
 * always travel.
 */
export function cookieFetch(base: CookieFetch = globalThis.fetch): CookieFetch {
  return (input, init) => base(input, { ...init, credentials: "include" });
}

function cookieAuthHeaders(resolved: ResolvedServerConfig): Record<string, string> {
  return resolved.username !== "" || resolved.password !== ""
    ? {
        Authorization: basicAuthHeader({
          username: resolved.username,
          password: resolved.password,
        }),
      }
    : {};
}

/** Build a cookie-bearing API client from a resolved (decrypted) config. */
export function makeCookieClientFor(resolved: ResolvedServerConfig): OpencodeClient {
  return OpenCode.make({
    baseUrl: resolved.baseUrl.replace(/\/$/, ""),
    headers: cookieAuthHeaders(resolved),
    fetch: cookieFetch(),
  });
}

/**
 * Build a cookie-bearing API client. Async because the password is sealed in
 * the credential vault and has to be opened first.
 */
export async function makeCookieClient(server: ServerConfig): Promise<OpencodeClient> {
  return makeCookieClientFor(await getDecryptedConfig(server));
}

// ---------------------------------------------------------------------------
// Gate login detection
//
// When the gate session is missing, API calls do not fail with JSON — the
// request is answered (after a 302) with the HTML login page. The generated
// client then throws `ClientError` (`reason: "UnsupportedContentType"`,
// message carries the `text/html` content type) instead of parsed data, and a
// direct `fetch` fallback would crash in `response.json()`. Both paths are
// mapped to a German login hint here.
// ---------------------------------------------------------------------------

/** German hint shown when the gate needs a browser login first. */
export function gateLoginMessage(): string {
  return t`Bitte zuerst im Browser einloggen.`;
}

/** True when `contentType` is the gate's HTML login page (not JSON). */
export function isGateLoginContentType(contentType: string | null): boolean {
  return contentType !== null && contentType.toLowerCase().includes("text/html");
}

interface ReasonedError extends Error {
  reason: unknown;
}

function errorReason(error: Error): unknown {
  return (error as Partial<ReasonedError>).reason;
}

/**
 * True when `error` is the client's rejection of the gate login page:
 * `ClientError` with reason `UnsupportedContentType` whose detail names an
 * HTML content type.
 */
export function isGateLoginError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (errorReason(error) !== "UnsupportedContentType") return false;
  return error.message.toLowerCase().includes("text/html");
}

/** Map any failure to a display string, translating the gate page to German. */
export function toGateAwareErrorMessage(error: unknown): string {
  if (isGateLoginError(error)) return gateLoginMessage();
  if (error instanceof Error) return error.message;
  return t`Unbekannter Fehler`;
}

/**
 * Direct-fetch fallback with gate handling: sends the gate cookie, throws
 * the German login hint when the gate answers with its HTML login page, and
 * otherwise returns the parsed JSON body.
 */
export async function fetchJsonWithCookies(
  url: string,
  init: RequestInit = {},
  base: CookieFetch = globalThis.fetch,
): Promise<unknown> {
  const response = await base(url, { ...init, credentials: "include" });
  if (!response.ok) {
    throw new Error(`fetch ${url} failed with status ${response.status}`);
  }
  if (isGateLoginContentType(response.headers.get("content-type"))) {
    throw new Error(gateLoginMessage());
  }
  return response.json();
}
