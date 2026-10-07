import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  beginIntegrationOauth,
  connectIntegrationKey,
  extractConfigEntries,
  extractConfigShells,
  extractIntegrationConnections,
  extractIntegrationDetail,
  extractIntegrationMethods,
  extractIntegrationOauthAttempt,
  extractIntegrationOauthStatus,
  extractIntegrations,
  extractTerminalScreen,
  getConfig,
  getIntegration,
  getIntegrationOauthStatus,
  listConfigShells,
  listIntegrations,
  readSessionTerminal,
  type ServerConfig,
} from "./opencode.ts";

// Every client call throws, so each function must take its direct-fetch
// fallback (verified paths, see the batch-4 section in `opencode.ts`).
vi.mock("@opencode/client", () => ({
  OpenCode: {
    make: () => {
      throw new Error("Client kaputt");
    },
  },
}));

vi.mock("./credentialVault.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./credentialVault.ts")>();
  return { ...actual, readCredential: () => Promise.resolve("") };
});

const fetchMock = vi.fn();

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://x.local/",
  username: "",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];
  return { url, init };
}

function lastJsonBody(): unknown {
  const { init } = lastCall();
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const integrationPayload = {
  location: {},
  data: [
    {
      id: "github",
      name: "GitHub",
      methods: [
        { id: "m-oauth", type: "oauth", label: "OAuth" },
        { type: "key", label: "API-Schlüssel" },
        { type: "env", names: ["GITHUB_TOKEN"] },
      ],
      connections: [
        { type: "credential", id: "c1", label: "Arbeit", method: "oauth" },
        {
          type: "credential",
          id: "c2",
          label: "Privat",
          method: "key",
          status: { status: "needs_auth", message: "Abgelaufen", url: "https://example.local/auth" },
        },
      ],
    },
  ],
};

describe("extractIntegrationMethods / extractIntegrationConnections", () => {
  it("normalizes method kinds and keeps ids", () => {
    expect(extractIntegrationMethods(integrationPayload.data[0]?.methods)).toEqual([
      { kind: "oauth", id: "m-oauth", label: "OAuth" },
      { kind: "key", id: null, label: "API-Schlüssel" },
      { kind: "env", id: null, label: "GITHUB_TOKEN" },
    ]);
    expect(extractIntegrationMethods("nichts")).toEqual([]);
  });

  it("marks connections waiting for auth", () => {
    expect(extractIntegrationConnections(integrationPayload.data[0]?.connections)).toEqual([
      { kind: "credential", label: "Arbeit", method: "oauth", needsAuth: false, message: null, url: null },
      {
        kind: "credential",
        label: "Privat",
        method: "key",
        needsAuth: true,
        message: "Abgelaufen",
        url: "https://example.local/auth",
      },
    ]);
    expect(extractIntegrationConnections(null)).toEqual([]);
  });
});

describe("integrations", () => {
  it("lists integrations from /api/integration", async () => {
    fetchMock.mockResolvedValue(jsonResponse(integrationPayload));
    const result = await listIntegrations(server);
    expect(result.error).toBeNull();
    expect(result.data?.[0]).toMatchObject({ id: "github", name: "GitHub" });
    expect(result.data?.[0]?.methods).toHaveLength(3);
    expect(result.data?.[0]?.connections).toHaveLength(2);
    expect(lastCall().url).toBe("http://x.local/api/integration");
  });

  it("reads one integration from /api/integration/{id}", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ location: {}, data: integrationPayload.data[0] }),
    );
    const result = await getIntegration(server, "github");
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: "github", name: "GitHub" });
    expect(lastCall().url).toBe("http://x.local/api/integration/github");
  });

  it("rejects detail payloads without an integration", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ location: {}, data: null }));
    const result = await getIntegration(server, "github");
    expect(result.data).toBeNull();
    expect(result.error).toContain("Integrations");
  });

  it("connects a key via POST /api/integration/{id}/connect/key", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await connectIntegrationKey(server, "github", "geheim", { label: "Arbeit" });
    expect(result.error).toBeNull();
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/integration/github/connect/key");
    expect(init.method).toBe("POST");
    expect(lastJsonBody()).toEqual({ key: "geheim", label: "Arbeit" });
  });

  it("begins OAuth via POST /api/integration/{id}/connect/oauth", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        location: {},
        data: { attemptID: "a1", url: "https://example.local/auth", instructions: "Anmelden", mode: "auto" },
      }),
    );
    const result = await beginIntegrationOauth(server, "github", "m-oauth");
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      attemptID: "a1",
      url: "https://example.local/auth",
      instructions: "Anmelden",
      mode: "auto",
    });
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/integration/github/connect/oauth");
    expect(init.method).toBe("POST");
    expect(lastJsonBody()).toEqual({ methodID: "m-oauth" });
  });

  it("polls OAuth status via GET /api/integration/{id}/connect/oauth/{attempt}", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ location: {}, data: { status: "pending" } }));
    const result = await getIntegrationOauthStatus(server, "github", "a1");
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ status: "pending", message: null });
    expect(lastCall().url).toBe("http://x.local/api/integration/github/connect/oauth/a1");
  });
});

describe("extractIntegrationOauthAttempt / extractIntegrationOauthStatus", () => {
  it("needs an attempt id and a url", () => {
    expect(extractIntegrationOauthAttempt(null)).toBeNull();
    expect(extractIntegrationOauthAttempt({ data: { attemptID: "a1" } })).toBeNull();
  });

  it("accepts the four known attempt states", () => {
    expect(extractIntegrationOauthStatus({ data: { status: "complete" } })).toEqual({
      status: "complete",
      message: null,
    });
    expect(extractIntegrationOauthStatus({ status: "failed", message: "Nein" })).toEqual({
      status: "failed",
      message: "Nein",
    });
    expect(extractIntegrationOauthStatus({ data: { status: "raten" } })).toBeNull();
  });
});

describe("extractIntegrations / extractIntegrationDetail", () => {
  it("normalizes list rows and tolerates a bare detail", () => {
    expect(extractIntegrations(integrationPayload)).toHaveLength(1);
    expect(extractIntegrations([])).toEqual([]);
    expect(extractIntegrationDetail({ location: {}, data: integrationPayload.data[0] })).toMatchObject({
      id: "github",
    });
    expect(extractIntegrationDetail({ id: "solo", name: "Solo" })).toMatchObject({ id: "solo" });
    expect(extractIntegrationDetail(null)).toBeNull();
    expect(extractIntegrationDetail({})).toBeNull();
  });
});

describe("config viewer (read-only)", () => {
  it("normalizes config entries", () => {
    expect(
      extractConfigEntries([
        {
          type: "document",
          path: "/repo/opencode.json",
          info: {
            shell: "/bin/bash",
            model: { providerID: "anthropic", model: "claude", variant: "sonnet" },
            default_agent: "coder",
            update: "auto",
            share: "manual",
          },
        },
        { type: "document", info: { model: "openai/gpt" } },
      ]),
    ).toEqual([
      {
        path: "/repo/opencode.json",
        shell: "/bin/bash",
        model: "anthropic/claude#sonnet",
        defaultAgent: "coder",
        update: "auto",
        share: "manual",
      },
      {
        path: null,
        shell: null,
        model: "openai/gpt",
        defaultAgent: null,
        update: null,
        share: null,
      },
    ]);
    expect(extractConfigEntries(null)).toEqual([]);
  });

  it("reads the config from /api/config", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ type: "document", info: { shell: "/bin/zsh" } }]));
    const result = await getConfig(server);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { path: null, shell: "/bin/zsh", model: null, defaultAgent: null, update: null, share: null },
    ]);
    expect(lastCall().url).toBe("http://x.local/api/config");
  });

  it("normalizes config shells", () => {
    expect(
      extractConfigShells([{ path: "/bin/bash", name: "bash", acceptable: true }, { path: "/bin/false" }]),
    ).toEqual([
      { path: "/bin/bash", name: "bash", acceptable: true },
      { path: "/bin/false", name: "/bin/false", acceptable: false },
    ]);
  });

  it("reads available shells from /api/config/shell", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ path: "/bin/bash", name: "bash", acceptable: true }]),
    );
    const result = await listConfigShells(server);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ path: "/bin/bash", name: "bash", acceptable: true }]);
    expect(lastCall().url).toBe("http://x.local/api/config/shell");
  });
});

describe("session terminal (read-only)", () => {
  it("extracts the screen and passes null through", () => {
    expect(extractTerminalScreen(null)).toBeNull();
    expect(
      extractTerminalScreen({
        ptyID: "p1",
        title: "Terminal",
        screen: { text: "hallo", cols: 80, rows: 24, cursor: { x: 5, y: 0 } },
      }),
    ).toEqual({ title: "Terminal", columns: 80, rows: 24, cursorX: 5, cursorY: 0, text: "hallo" });
    expect(extractTerminalScreen({})).toBeNull();
  });

  it("reads the screen from /api/experimental/session/{id}/terminal/read", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ screen: { text: "hallo", cols: 80, rows: 24, cursor: { x: 0, y: 0 } } }),
    );
    const result = await readSessionTerminal(server, "ses-1", 200);
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ text: "hallo", columns: 80, rows: 24 });
    expect(lastCall().url).toBe("http://x.local/api/experimental/session/ses-1/terminal/read?lines=200");
  });

  it("reports a missing session terminal as empty, not as an error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));
    const result = await readSessionTerminal(server, "ses-1");
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(lastCall().url).toBe("http://x.local/api/experimental/session/ses-1/terminal/read");
  });
});
