import { describe, expect, it } from "vitest";
import { normalizeServerBaseUrl } from "./serverBaseUrl.ts";

describe("normalizeServerBaseUrl", () => {
  it("strips a session deep link to the origin", () => {
    expect(normalizeServerBaseUrl("https://host.example/sessions/abc-123")).toBe(
      "https://host.example",
    );
  });

  it("strips /api/info with a query string", () => {
    expect(normalizeServerBaseUrl("https://host.example/api/info?x=1")).toBe(
      "https://host.example",
    );
  });

  it("strips a bare /api suffix", () => {
    expect(normalizeServerBaseUrl("https://host.example/api")).toBe(
      "https://host.example",
    );
  });

  it("normalizes a PWA deep URL to its own origin", () => {
    expect(
      normalizeServerBaseUrl("https://ocweb.example.com/servers/srv-1?tab=sessions"),
    ).toBe("https://ocweb.example.com");
  });

  it("keeps scheme, host and port while dropping path and query", () => {
    expect(
      normalizeServerBaseUrl("http://192.168.1.10:8080/sessions/xyz?foo=bar#frag"),
    ).toBe("http://192.168.1.10:8080");
  });

  it("keeps http origins untouched", () => {
    expect(normalizeServerBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("leaves a plain origin unchanged", () => {
    expect(normalizeServerBaseUrl("https://host.example")).toBe("https://host.example");
  });

  it("drops a trailing slash on a plain origin", () => {
    expect(normalizeServerBaseUrl("https://host.example/")).toBe("https://host.example");
  });

  it("trims surrounding whitespace before normalizing", () => {
    expect(normalizeServerBaseUrl("  https://host.example/sessions/a  \n")).toBe(
      "https://host.example",
    );
  });

  it("passes non-URL text through (trimmed, never destroyed)", () => {
    expect(normalizeServerBaseUrl("heimserver")).toBe("heimserver");
    expect(normalizeServerBaseUrl("host.example/sessions/abc")).toBe(
      "host.example/sessions/abc",
    );
  });

  it("passes non-http schemes through unchanged", () => {
    expect(normalizeServerBaseUrl("ftp://host.example/sessions/a")).toBe(
      "ftp://host.example/sessions/a",
    );
  });

  it("passes empty and blank input through", () => {
    expect(normalizeServerBaseUrl("")).toBe("");
    expect(normalizeServerBaseUrl("   ")).toBe("");
  });

  it("handles nested deep paths and trailing slashes", () => {
    expect(normalizeServerBaseUrl("https://host.example/a/b/c/")).toBe(
      "https://host.example",
    );
  });

  it("lowercases scheme and host via URL parsing", () => {
    expect(normalizeServerBaseUrl("HTTPS://HOST.EXAMPLE/Sessions/A")).toBe(
      "https://host.example",
    );
  });

  it("drops default ports like URL.origin does", () => {
    expect(normalizeServerBaseUrl("https://host.example:443/sessions/a")).toBe(
      "https://host.example",
    );
  });
});
