import { describe, expect, it } from "vitest";
import { normalizeServerBaseUrl } from "./serverBaseUrl.ts";

describe("normalizeServerBaseUrl", () => {
  it("keeps a reverse-proxy subpath", () => {
    expect(normalizeServerBaseUrl("https://host.example/opencode")).toBe(
      "https://host.example/opencode",
    );
  });

  it("keeps a reverse-proxy subpath and drops its trailing slash", () => {
    expect(normalizeServerBaseUrl("https://host.example/opencode/")).toBe(
      "https://host.example/opencode",
    );
  });

  it("keeps a nested reverse-proxy subpath", () => {
    expect(normalizeServerBaseUrl("https://host.example/apps/opencode/")).toBe(
      "https://host.example/apps/opencode",
    );
  });

  it("strips a bare /api suffix to the origin", () => {
    expect(normalizeServerBaseUrl("https://host.example/api")).toBe(
      "https://host.example",
    );
  });

  it("strips /api/info with a query string to the origin", () => {
    expect(normalizeServerBaseUrl("https://host.example/api/info?x=1")).toBe(
      "https://host.example",
    );
  });

  it("strips /api case-insensitively", () => {
    expect(normalizeServerBaseUrl("https://host.example/API/Info")).toBe(
      "https://host.example",
    );
  });

  it("strips the /api tail but keeps a preceding proxy subpath", () => {
    expect(normalizeServerBaseUrl("https://host.example/opencode/api/info")).toBe(
      "https://host.example/opencode",
    );
  });

  it("strips a session deep link to the origin", () => {
    expect(normalizeServerBaseUrl("https://host.example/sessions/abc-123")).toBe(
      "https://host.example",
    );
  });

  it("strips a session deep link but keeps a preceding proxy subpath", () => {
    expect(normalizeServerBaseUrl("https://host.example/opencode/sessions/abc")).toBe(
      "https://host.example/opencode",
    );
  });

  it("normalizes a PWA deep URL to its own origin", () => {
    expect(
      normalizeServerBaseUrl("https://ocweb.example.com/servers/srv-1?tab=sessions"),
    ).toBe("https://ocweb.example.com");
  });

  it("keeps scheme, host and port while dropping a session tail", () => {
    expect(
      normalizeServerBaseUrl("http://192.168.1.10:8080/sessions/xyz?foo=bar#frag"),
    ).toBe("http://192.168.1.10:8080");
  });

  it("keeps the port of a reverse-proxy subpath URL", () => {
    expect(normalizeServerBaseUrl("http://192.168.1.10:8080/opencode")).toBe(
      "http://192.168.1.10:8080/opencode",
    );
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

  it("does not treat /apix as the /api segment", () => {
    expect(normalizeServerBaseUrl("https://host.example/apix")).toBe(
      "https://host.example/apix",
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
