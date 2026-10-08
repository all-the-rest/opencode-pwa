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

  it("strips a singular session deep link to the origin", () => {
    expect(normalizeServerBaseUrl("https://host.example/session/abc-123")).toBe(
      "https://host.example",
    );
  });

  it("strips a singular session deep link case-insensitively", () => {
    expect(normalizeServerBaseUrl("https://host.example/Session/abc")).toBe(
      "https://host.example",
    );
  });

  it("strips a singular session deep link but keeps a preceding proxy subpath", () => {
    expect(normalizeServerBaseUrl("https://host.example/opencode/session/abc")).toBe(
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

  it("decodes a padded base64-embedded server link to the decoded origin", () => {
    expect(
      normalizeServerBaseUrl(
        "https://app.example/server/aHR0cHM6Ly9yZW1vdGUtY29kZS5hbGwtdGhlLnJlc3Q=/session/abc-123",
      ),
    ).toBe("https://remote-code.all-the.rest");
  });

  it("decodes an unpadded base64-embedded server link", () => {
    expect(
      normalizeServerBaseUrl(
        "https://app.example/server/aHR0cHM6Ly9yZW1vdGUtY29kZS5hbGwtdGhlLnJlc3Q/session/abc-123",
      ),
    ).toBe("https://remote-code.all-the.rest");
  });

  it("decodes a urlsafe base64-embedded server link and keeps the decoded subpath", () => {
    // Decodes to `https://host.example:9999/~user/x?y=>>>&z=~~~`: the query is
    // dropped, the decoded subpath survives per the regular rules.
    expect(
      normalizeServerBaseUrl(
        "https://app.example/server/aHR0cHM6Ly9ob3N0LmV4YW1wbGU6OTk5OS9-dXNlci94P3k9Pj4-Jno9fn5-/session/abc",
      ),
    ).toBe("https://host.example:9999/~user/x");
  });

  it("decodes an underscore urlsafe base64-embedded server link", () => {
    // Decodes to `https://host.example/ÿþ` (its base64 carries `/`).
    expect(
      normalizeServerBaseUrl(
        "https://app.example/server/aHR0cHM6Ly9ob3N0LmV4YW1wbGUvw7_Dvg/session/abc",
      ),
    ).toBe("https://host.example/%C3%BF%C3%BE");
  });

  it("drops a decoded deep tail but keeps a decoded proxy subpath", () => {
    // Decodes to `https://remote.example/opencode/api/info`.
    expect(
      normalizeServerBaseUrl(
        "https://app.example/server/aHR0cHM6Ly9yZW1vdGUuZXhhbXBsZS9vcGVuY29kZS9hcGkvaW5mbw==/session/abc",
      ),
    ).toBe("https://remote.example/opencode");
  });

  it("drops a decoded singular-session tail to the decoded origin", () => {
    // Decodes to `https://remote.example/session/abc`.
    expect(
      normalizeServerBaseUrl(
        "https://app.example/server/aHR0cHM6Ly9yZW1vdGUuZXhhbXBsZS9zZXNzaW9uL2FiYw==/session/abc",
      ),
    ).toBe("https://remote.example");
  });

  it("drops a decoded singular-session tail but keeps a decoded proxy subpath", () => {
    // Decodes to `https://remote.example/opencode/session/abc`.
    expect(
      normalizeServerBaseUrl(
        "https://app.example/server/aHR0cHM6Ly9yZW1vdGUuZXhhbXBsZS9vcGVuY29kZS9zZXNzaW9uL2FiYw==/session/abc",
      ),
    ).toBe("https://remote.example/opencode");
  });

  it("falls through to the regular rules for garbage in the server slot", () => {
    // `!!!` is not base64, so the embedded decode fails and the regular
    // rules apply: the singular `session` tail is still stripped instead of
    // destroying the surviving prefix.
    expect(normalizeServerBaseUrl("https://app.example/server/!!!/session/abc")).toBe(
      "https://app.example/server/!!!",
    );
  });

  it("still strips a reserved tail when the embedded value is garbage", () => {
    expect(normalizeServerBaseUrl("https://app.example/server/!!!/sessions/abc")).toBe(
      "https://app.example/server/!!!",
    );
  });

  it("falls through when the embedded value decodes to non-URL text", () => {
    // `aGVsbG8=` decodes to `hello` — valid base64, but no server URL, so the
    // regular rules apply and the singular `session` tail is stripped.
    expect(
      normalizeServerBaseUrl("https://app.example/server/aGVsbG8=/session/abc"),
    ).toBe("https://app.example/server/aGVsbG8=");
  });

  it("falls through when the embedded value decodes to a non-http URL", () => {
    // Decodes to `ftp://host.example/x`: not a server URL, so the regular
    // rules apply and the singular `session` tail is stripped.
    expect(
      normalizeServerBaseUrl(
        "https://app.example/server/ZnRwOi8vaG9zdC5leGFtcGxlL3g=/session/abc",
      ),
    ).toBe("https://app.example/server/ZnRwOi8vaG9zdC5leGFtcGxlL3g=");
  });

  it("ignores a base64-looking segment when it is not the /server slot", () => {
    expect(
      normalizeServerBaseUrl(
        "https://host.example/opencode/aHR0cHM6Ly9yZW1vdGUtY29kZS5hbGwtdGhlLnJlc3Q",
      ),
    ).toBe("https://host.example/opencode/aHR0cHM6Ly9yZW1vdGUtY29kZS5hbGwtdGhlLnJlc3Q");
  });

  it("leaves a bare /server path without an embedded value alone", () => {
    expect(normalizeServerBaseUrl("https://host.example/server")).toBe(
      "https://host.example/server",
    );
  });
});
