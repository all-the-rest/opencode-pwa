import { describe, expect, it, vi } from "vitest";
import {
  connectionAuthMessage,
  connectionGateMessage,
  connectionUnreachableMessage,
  testServerConnection,
  type ConnectionTestFetch,
  type ConnectionTestInput,
} from "./serverConnectionTest.ts";

const input: ConnectionTestInput = {
  baseUrl: "https://opencode.example.com",
  username: "e2e",
  password: "secret",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(status = 200): Response {
  return new Response("<html><body>login</body></html>", {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe("testServerConnection", () => {
  it("reports success with the server version", async () => {
    const fetchFn: ConnectionTestFetch = () =>
      Promise.resolve(jsonResponse({ version: "0.9.1", pid: 123, urls: [], paths: {} }));
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("success");
    expect(result.version).toBe("0.9.1");
    expect(result.message).toContain("0.9.1");
    expect(result.message).toContain("Verbindung erfolgreich");
    expect(result.url).toBe("https://opencode.example.com/api/info");
  });

  it("reads a nested version field", async () => {
    const fetchFn: ConnectionTestFetch = () =>
      Promise.resolve(jsonResponse({ data: { version: "1.2.3" } }));
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("success");
    expect(result.version).toBe("1.2.3");
  });

  it("succeeds without a version when the body carries none", async () => {
    const fetchFn: ConnectionTestFetch = () => Promise.resolve(jsonResponse({ ok: true }));
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("success");
    expect(result.version).toBeNull();
    expect(result.message).toContain("Verbindung erfolgreich");
  });

  it("sends the entered credentials as Basic auth to {baseUrl}/api/info", async () => {
    const fetchFn: ConnectionTestFetch = vi.fn(() => Promise.resolve(jsonResponse({})));
    await testServerConnection(input, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://opencode.example.com/api/info",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: `Basic ${btoa("e2e:secret")}`,
        }),
      }),
    );
  });

  it("normalizes a typed deep base URL before requesting the origin's /api/info", async () => {
    let requested = "";
    const fetchFn: ConnectionTestFetch = (url) => {
      requested = url;
      return Promise.resolve(jsonResponse({}));
    };
    const result = await testServerConnection(
      { ...input, baseUrl: "https://opencode.example.com/api/info?x=1" },
      fetchFn,
    );
    expect(requested).toBe("https://opencode.example.com/api/info");
    // The effective (normalized) URL is still shown, so the path is visible.
    expect(result.url).toBe("https://opencode.example.com/api/info");
    expect(result.status).toBe("success");
  });

  it("normalizes a PWA deep URL on another origin to its origin", async () => {
    let requested = "";
    const fetchFn: ConnectionTestFetch = (url) => {
      requested = url;
      return Promise.resolve(jsonResponse({}));
    };
    const result = await testServerConnection(
      { ...input, baseUrl: "https://ocweb.example.com/servers/srv-1?tab=sessions" },
      fetchFn,
    );
    expect(requested).toBe("https://ocweb.example.com/api/info");
    expect(result.url).toBe("https://ocweb.example.com/api/info");
  });

  it("maps 401 to the shared credentials message", async () => {
    const fetchFn: ConnectionTestFetch = () =>
      Promise.resolve(
        new Response("401 Unauthorized", {
          status: 401,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("auth");
    expect(result.message).toBe(connectionAuthMessage());
    expect(result.message).toContain("Anmeldung fehlgeschlagen");
  });

  it("maps 403 to the credentials message", async () => {
    const fetchFn: ConnectionTestFetch = () => Promise.resolve(jsonResponse({}, 403));
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("auth");
    expect(result.message).toContain("Anmeldung fehlgeschlagen");
  });

  it("maps an HTML login page to the gate hint, not the credentials text", async () => {
    const fetchFn: ConnectionTestFetch = () => Promise.resolve(htmlResponse());
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("gate");
    expect(result.message).toBe(connectionGateMessage());
    expect(result.message).toContain("einloggen");
    expect(result.message).not.toContain("Anmeldung fehlgeschlagen");
  });

  it("maps a bare 302 to the gate hint", async () => {
    const fetchFn: ConnectionTestFetch = () =>
      Promise.resolve(new Response(null, { status: 302 }));
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("gate");
    expect(result.message).toContain("einloggen");
  });

  it("maps a rejected fetch to the reachability hint mentioning --cors", async () => {
    const fetchFn: ConnectionTestFetch = () =>
      Promise.reject(new TypeError("Failed to fetch"));
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("unreachable");
    expect(result.message).toBe(connectionUnreachableMessage());
    expect(result.message).toContain("--cors");
  });

  it("maps server errors to the http-error message with the status", async () => {
    const fetchFn: ConnectionTestFetch = () => Promise.resolve(jsonResponse({}, 500));
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("http-error");
    expect(result.message).toContain("500");
  });

  it("rejects invalid and non-http base URLs without fetching", async () => {
    const fetchFn: ConnectionTestFetch = vi.fn(() => Promise.resolve(jsonResponse({})));
    for (const baseUrl of ["", "keine-url", "ftp://host.example/x"]) {
      const result = await testServerConnection({ ...input, baseUrl }, fetchFn);
      expect(result.status).toBe("invalid-url");
      expect(result.url).toBeNull();
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps a non-JSON success body to the unexpected-body hint", async () => {
    const fetchFn: ConnectionTestFetch = () =>
      Promise.resolve(
        new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
      );
    const result = await testServerConnection(input, fetchFn);
    expect(result.status).toBe("http-error");
  });
});
