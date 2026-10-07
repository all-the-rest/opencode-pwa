import { ClientError } from "@opencode/client";
import { describe, expect, it } from "vitest";
import {
  authFailureMessage,
  isAuthFailure,
  isAuthFailureMessage,
} from "./serverAuthError.ts";

function unsupportedContentTypeError(detail: string): Error {
  return new ClientError("UnsupportedContentType", { detail });
}

describe("isAuthFailure", () => {
  it("detects a 401 client error (UnexpectedStatus with status cause)", () => {
    const error = new ClientError("UnexpectedStatus", {
      detail: "401",
      cause: { status: 401 },
    });
    expect(isAuthFailure(error)).toBe(true);
    expect(isAuthFailureMessage(error.message)).toBe(true);
  });

  it("detects a 403 client error", () => {
    const error = new ClientError("UnexpectedStatus", {
      detail: "403",
      cause: { status: 403 },
    });
    expect(isAuthFailure(error)).toBe(true);
  });

  it("detects the 401 fetch fallback (non-ok status)", () => {
    expect(isAuthFailureMessage("GET /api/project failed with status 401")).toBe(true);
    expect(isAuthFailure(new Error("GET /api/project failed with status 401"))).toBe(true);
  });

  it("detects 403 fetch failures and forbidden names", () => {
    expect(isAuthFailureMessage("GET /api/agent failed with status 403")).toBe(true);
    const forbidden = new Error("Forbidden");
    forbidden.name = "Forbidden";
    expect(isAuthFailure(forbidden)).toBe(true);
    const unauthorized = new Error("Unauthorized");
    unauthorized.name = "Unauthorized";
    expect(isAuthFailure(unauthorized)).toBe(true);
  });

  it("detects the Caddy 401 page (UnsupportedContentType text/plain)", () => {
    const error = unsupportedContentTypeError("text/plain; charset=utf-8");
    expect(error.message).toContain("UnsupportedContentType");
    expect(isAuthFailure(error)).toBe(true);
    expect(isAuthFailureMessage("UnsupportedContentType: text/plain; charset=utf-8")).toBe(
      true,
    );
  });

  it("rejects the cookie-gate login page (text/html is not credentials)", () => {
    expect(isAuthFailure(unsupportedContentTypeError("text/html; charset=utf-8"))).toBe(
      false,
    );
  });

  it("keeps plain network failures on the offline text", () => {
    expect(isAuthFailure(new Error("Failed to fetch"))).toBe(false);
    expect(isAuthFailure(new TypeError("Load failed"))).toBe(false);
    expect(
      isAuthFailure(new ClientError("Transport", { cause: new Error("boom") })),
    ).toBe(false);
    expect(isAuthFailureMessage("Transport: boom")).toBe(false);
    expect(isAuthFailure(null)).toBe(false);
    expect(isAuthFailure(undefined)).toBe(false);
  });
});

describe("authFailureMessage", () => {
  it("asks for a credential check in German", () => {
    expect(authFailureMessage()).toContain("Anmeldung fehlgeschlagen");
    expect(authFailureMessage()).toContain("Server-Passwort");
  });
});
