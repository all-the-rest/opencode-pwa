import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cookieFetch,
  fetchJsonWithCookies,
  gateLoginMessage,
  isGateLoginContentType,
  isGateLoginError,
  makeCookieClient,
  makeCookieClientFor,
  toGateAwareErrorMessage,
  type CookieFetch,
} from "./opencodeCookie.ts";
import type { ResolvedServerConfig, ServerConfig } from "./opencode.ts";

const makeMock = vi.hoisted(() => vi.fn());
vi.mock("@opencode/client", () => ({
  OpenCode: { make: makeMock },
}));

// The client tests must not touch IndexedDB/WebCrypto: the credential is
// stubbed, so the cookie client builds with a known password.
vi.mock("./credentialVault.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./credentialVault.ts")>();
  return { ...actual, readCredential: () => Promise.resolve("secret") };
});

interface SeenRequest {
  input: string | URL | Request;
  init?: RequestInit;
}

function recordingFetch(seen: SeenRequest[], payload: unknown): CookieFetch {
  return (input, init) => {
    seen.push({ input, init });
    return Promise.resolve(new Response(JSON.stringify(payload)));
  };
}

function fakeResponse(payload: unknown, contentType: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

interface ReasonedError extends Error {
  reason: unknown;
}

function unsupportedContentTypeError(detail: string): Error {
  const error = new Error(`UnsupportedContentType: ${detail}`) as ReasonedError;
  error.reason = "UnsupportedContentType";
  return error;
}

const resolved: ResolvedServerConfig = {
  id: "s1",
  name: "Gate",
  baseUrl: "https://remote-code.all-the.rest/",
  username: "user",
  password: "secret",
};

describe("cookieFetch", () => {
  it("forces credentials include while keeping method, headers and body", async () => {
    const seen: SeenRequest[] = [];
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    };
    await cookieFetch(recordingFetch(seen, {}))("https://gate.local/api/info", init);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.init).toMatchObject({
      method: "POST",
      credentials: "include",
      body: "{}",
    });
    expect(new Headers(seen[0]?.init?.headers).get("content-type")).toBe("application/json");
  });

  it("overrides a caller-supplied credentials value", async () => {
    const seen: SeenRequest[] = [];
    await cookieFetch(recordingFetch(seen, {}))("https://gate.local/api/info", {
      credentials: "omit",
    });
    expect(seen[0]?.init?.credentials).toBe("include");
  });
});

describe("makeCookieClientFor", () => {
  beforeEach(() => {
    makeMock.mockReset();
    makeMock.mockReturnValue({ marker: true });
  });

  it("passes a credential-bearing fetch to OpenCode.make", async () => {
    const seen: SeenRequest[] = [];
    vi.stubGlobal("fetch", recordingFetch(seen, {}));
    try {
      const client = makeCookieClientFor(resolved);
      expect(client).toEqual({ marker: true });
      const options = makeMock.mock.calls[0]?.[0] as {
        baseUrl: string;
        headers: Record<string, string>;
        fetch: CookieFetch;
      };
      expect(options.baseUrl).toBe("https://remote-code.all-the.rest");
      expect(options.headers["Authorization"]).toBe(`Basic ${btoa("user:secret")}`);
      await options.fetch("https://remote-code.all-the.rest/api/info", { method: "GET" });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.init?.credentials).toBe("include");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends no Authorization header without credentials", () => {
    makeCookieClientFor({ ...resolved, username: "", password: "" });
    const options = makeMock.mock.calls[0]?.[0] as {
      headers: Record<string, string>;
    };
    expect(options.headers).toEqual({});
  });
});

describe("makeCookieClient", () => {
  beforeEach(() => {
    makeMock.mockReset();
    makeMock.mockReturnValue({});
  });

  it("resolves the vault password into the Authorization header", async () => {
    const server: ServerConfig = {
      id: "s1",
      name: "Gate",
      baseUrl: "https://remote-code.all-the.rest/",
      username: "user",
    };
    await makeCookieClient(server);
    const options = makeMock.mock.calls[0]?.[0] as {
      headers: Record<string, string>;
    };
    expect(options.headers["Authorization"]).toBe(`Basic ${btoa("user:secret")}`);
  });
});

describe("isGateLoginContentType", () => {
  it("detects the HTML login page", () => {
    expect(isGateLoginContentType("text/html; charset=utf-8")).toBe(true);
    expect(isGateLoginContentType("TEXT/HTML")).toBe(true);
  });

  it("rejects JSON, empty and missing content types", () => {
    expect(isGateLoginContentType("application/json")).toBe(false);
    expect(isGateLoginContentType("")).toBe(false);
    expect(isGateLoginContentType(null)).toBe(false);
  });
});

describe("isGateLoginError", () => {
  it("detects the client's rejection of the HTML login page", () => {
    expect(isGateLoginError(unsupportedContentTypeError("text/html; charset=utf-8"))).toBe(true);
  });

  it("rejects other failures", () => {
    expect(isGateLoginError(unsupportedContentTypeError("application/octet-stream"))).toBe(false);
    expect(isGateLoginError(new Error("Transport: boom"))).toBe(false);
    expect(isGateLoginError(null)).toBe(false);
    expect(isGateLoginError("UnsupportedContentType: text/html")).toBe(false);
  });
});

describe("gateLoginMessage", () => {
  it("asks for a browser login in German", () => {
    expect(gateLoginMessage()).toContain("Bitte zuerst im Browser einloggen");
  });
});

describe("toGateAwareErrorMessage", () => {
  it("maps the gate page to the German login hint", () => {
    expect(toGateAwareErrorMessage(unsupportedContentTypeError("text/html"))).toContain(
      "Bitte zuerst im Browser einloggen",
    );
  });

  it("passes other errors through", () => {
    expect(toGateAwareErrorMessage(new Error("kaputt"))).toBe("kaputt");
    expect(toGateAwareErrorMessage(null)).toBe("Unbekannter Fehler");
  });
});

describe("fetchJsonWithCookies", () => {
  const url = "https://remote-code.all-the.rest/api/agent";

  it("sends the gate cookie and returns parsed JSON", async () => {
    const seen: SeenRequest[] = [];
    const payload = { data: [] };
    const result = await fetchJsonWithCookies(
      url,
      { headers: { accept: "application/json" } },
      recordingFetch(seen, payload),
    );
    expect(result).toEqual(payload);
    expect(seen[0]?.init?.credentials).toBe("include");
    expect(new Headers(seen[0]?.init?.headers).get("accept")).toBe("application/json");
  });

  it("throws the German login hint for the HTML gate page", async () => {
    const base: CookieFetch = () =>
      Promise.resolve(fakeResponse("<html>login</html>", "text/html; charset=utf-8"));
    await expect(fetchJsonWithCookies(url, {}, base)).rejects.toThrow(
      "Bitte zuerst im Browser einloggen",
    );
  });

  it("surfaces the fetch status when the request fails", async () => {
    const base: CookieFetch = () =>
      Promise.resolve(fakeResponse({}, "application/json", 500));
    await expect(fetchJsonWithCookies(url, {}, base)).rejects.toThrow("500");
  });

  it("uses the global fetch by default", async () => {
    const fetchMock = vi.fn(async () => fakeResponse({ data: [] }, "application/json"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(fetchJsonWithCookies(url)).resolves.toEqual({ data: [] });
      expect(fetchMock).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ credentials: "include" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
