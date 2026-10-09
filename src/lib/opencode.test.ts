import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  basicAuthHeader,
  compactSession,
  createSession,
  decodeFileContent,
  extractAgentDetail,
  extractAgents,
  extractFileEntries,
  extractFileListing,
  extractListRows,
  extractMcpServers,
  extractModelCapabilities,
  extractModels,
  extractPermissionRequests,
  extractProjects,
  extractProviders,
  extractPtyTicket,
  extractSessionDiff,
  extractSessionInfo,
  extractSessionPage,
  extractSessionRename,
  extractSessionRows,
  extractSessionStats,
  extractPtyRows,
  extractProjectUpdated,
  extractShellRows,
  extractShellOutput,
  extractTokenUsage,
  extractVcsStatus,
  extractWorktrees,
  filterSessionRows,
  forkSession,
  getAgentDetail,
  getSessionDiff,
  getSessionInfo,
  getSessionStats,
  groupSessionsByProject,
  initVcs,
  isRunningShellStatus,
  listAgents,
  listProviders,
  MAX_FILE_PREVIEW_CHARS,
  modelLabelLookup,
  modelOptionValue,
  parseModelOptionValue,
  renameSession,
  sessionAgentKey,
  sessionProjectKey,
  sessionTitle,
  toPromptFileUri,
  UNASSIGNED_PROJECT_KEY,
  updateProject,
  type ServerConfig,
  type ServerCredentials,
} from "./opencode.ts";

const agentListMock = vi.hoisted(() => vi.fn());
// The generated client unwraps `.data` off the parsed body for `session.get` /
// `session.active`, so a server that answers WITHOUT the envelope resolves
// `undefined`. The mocks reproduce that behaviour for the fallback tests.
const sessionGetMock = vi.hoisted(() => vi.fn());
const sessionActiveMock = vi.hoisted(() => vi.fn());
vi.mock("@opencode/client", () => ({
  OpenCode: {
    make: () => ({
      agent: { list: agentListMock },
      session: { get: sessionGetMock, active: sessionActiveMock },
    }),
  },
}));

// The fallback tests must not touch IndexedDB/WebCrypto: the credential is
// stubbed, so the direct-fetch path runs with empty auth headers.
vi.mock("./credentialVault.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./credentialVault.ts")>();
  return { ...actual, readCredential: () => Promise.resolve("") };
});

const fetchMock = vi.fn();

// A server never carries its password any more — it is sealed in the vault.
const server: ServerCredentials = { username: "user", password: "secret" };

describe("basicAuthHeader", () => {
  it("encodes user:pass as Basic header", () => {
    expect(basicAuthHeader(server)).toBe(`Basic ${btoa("user:secret")}`);
  });

  it("handles empty credentials", () => {
    expect(basicAuthHeader({ username: "", password: "" })).toBe(`Basic ${btoa(":")}`);
  });
});

describe("extractProjects", () => {
  it("extracts id and name from a plain array", () => {
    expect(
      extractProjects([
        { id: "p1", name: "Alpha", canonical: "/repo/a" },
        { id: "p2", canonical: "/repo/b" },
      ]),
    ).toEqual([
      { id: "p1", name: "Alpha", canonical: "/repo/a" },
      { id: "p2", name: "/repo/b", canonical: "/repo/b" },
    ]);
  });

  it("carries the vcs marker in both the string and the object shape", () => {
    expect(
      extractProjects([
        { id: "p1", canonical: "/repo/a", vcs: "git" },
        { id: "p2", canonical: "/repo/b", vcs: "none" },
        { id: "p3", canonical: "/repo/c", vcs: { type: "git", store: "/repo/c" } },
        { id: "p4", canonical: "/repo/d", vcs: 42 },
      ]),
    ).toEqual([
      { id: "p1", name: "/repo/a", canonical: "/repo/a", vcs: "git" },
      { id: "p2", name: "/repo/b", canonical: "/repo/b", vcs: "none" },
      { id: "p3", name: "/repo/c", canonical: "/repo/c", vcs: { type: "git" } },
      { id: "p4", name: "/repo/d", canonical: "/repo/d" },
    ]);
  });

  it("supports a { data } envelope", () => {
    expect(extractProjects({ data: [{ id: "p1" }] })).toEqual([
      { id: "p1", name: "p1" },
    ]);
  });

  it("tolerates missing fields and non-objects", () => {
    expect(extractProjects(null)).toEqual([]);
    expect(extractProjects({ data: null })).toEqual([]);
    expect(extractProjects([null, "x", {}])).toEqual([
      { id: "projekt-0", name: "null" },
      { id: "projekt-1", name: "x" },
      { id: "projekt-2", name: "projekt-2" },
    ]);
  });
});

describe("sessionProjectKey", () => {
  it("prefers projectID over projectId and directory", () => {
    expect(sessionProjectKey({ projectID: "a", projectId: "b", directory: "c" })).toBe("a");
    expect(sessionProjectKey({ projectId: "b", directory: "c" })).toBe("b");
    expect(sessionProjectKey({ directory: "/repo" })).toBe("/repo");
  });

  it("returns null when no key field exists", () => {
    expect(sessionProjectKey(null)).toBeNull();
    expect(sessionProjectKey({ id: "s1" })).toBeNull();
    expect(sessionProjectKey({ projectID: "" })).toBeNull();
  });
});

describe("groupSessionsByProject", () => {
  it("groups by project key with project names and an unassigned fallback", () => {
    const rows = extractSessionRows({
      data: [
        { id: "s1", title: "One", projectID: "p1" },
        { id: "s2", title: "Two" },
        { id: "s3", title: "Three", directory: "/elsewhere" },
      ],
    });
    const groups = groupSessionsByProject(rows, [{ id: "p1", name: "Alpha" }]);
    expect(groups.map((g) => g.label)).toEqual(["Alpha", "/elsewhere", UNASSIGNED_PROJECT_KEY]);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(groups[2]?.sessions.map((s) => s.id)).toEqual(["s2"]);
  });

  it("returns an empty list for missing shapes", () => {
    expect(groupSessionsByProject(extractSessionRows(null), [])).toEqual([]);
    expect(groupSessionsByProject(extractSessionRows({ data: "nope" }), [])).toEqual([]);
  });
});

describe("sessionAgentKey", () => {
  it("reads agent, agentID and agentId", () => {
    expect(sessionAgentKey({ agent: "coder" })).toBe("coder");
    expect(sessionAgentKey({ agentID: "planner" })).toBe("planner");
    expect(sessionAgentKey({ agentId: "oracle" })).toBe("oracle");
  });

  it("returns null when absent", () => {
    expect(sessionAgentKey(null)).toBeNull();
    expect(sessionAgentKey({ id: "s1" })).toBeNull();
    expect(sessionAgentKey({ agent: "" })).toBeNull();
  });
});

describe("extractSessionPage", () => {
  it("splits rows and cursor", () => {
    const page = extractSessionPage({
      data: [
        { id: "s1", title: "One", agent: "coder", projectID: "p1" },
        { id: "s2", title: "Two" },
      ],
      cursor: { next: "abc", previous: null },
    });
    expect(page.rows.map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(page.rows[0]).toMatchObject({ agent: "coder", projectKey: "p1" });
    expect(page.cursor).toEqual({ next: "abc", previous: null });
  });

  it("tolerates missing cursor", () => {
    expect(extractSessionPage({ data: [] })).toEqual({
      rows: [],
      cursor: { next: null, previous: null },
    });
    expect(extractSessionPage(null).cursor).toEqual({ next: null, previous: null });
  });
});

describe("filterSessionRows", () => {
  const rows = extractSessionRows({
    data: [
      { id: "s1", title: "Alpha build", agent: "coder", projectID: "p1" },
      { id: "s2", title: "Beta review", agent: "oracle", projectID: "p2" },
      { id: "s3", title: "Gamma build", projectID: "p1" },
    ],
  });

  it("filters by agent", () => {
    expect(filterSessionRows(rows, { agent: "coder" }).map((r) => r.id)).toEqual(["s1"]);
  });

  it("filters by project key", () => {
    expect(filterSessionRows(rows, { projectKey: "p1" }).map((r) => r.id)).toEqual([
      "s1",
      "s3",
    ]);
  });

  it("searches title and id case-insensitively", () => {
    expect(filterSessionRows(rows, { search: "BUILD" }).map((r) => r.id)).toEqual([
      "s1",
      "s3",
    ]);
    expect(filterSessionRows(rows, { search: "s2" }).map((r) => r.id)).toEqual(["s2"]);
  });

  it("combines filters and passes empty filters through", () => {
    expect(filterSessionRows(rows, {}).map((r) => r.id)).toEqual(["s1", "s2", "s3"]);
    expect(
      filterSessionRows(rows, { agent: "coder", projectKey: "p2" }),
    ).toEqual([]);
    expect(
      filterSessionRows(rows, { projectKey: "p1", search: "gamma" }).map((r) => r.id),
    ).toEqual(["s3"]);
  });
});

describe("extractShellOutput", () => {
  it("normalizes the output payload", () => {
    expect(
      extractShellOutput({ data: { output: "hi\n", cursor: 3, size: 3, truncated: false } }),
    ).toEqual({ output: "hi\n", cursor: 3, truncated: false });
  });

  it("returns null for unexpected shapes", () => {
    expect(extractShellOutput(null)).toBeNull();
    expect(extractShellOutput({ data: { cursor: 0 } })).toBeNull();
  });
});

describe("extractPtyTicket", () => {
  it("reads ticket and token fields", () => {
    expect(extractPtyTicket({ data: { ticket: "t-1", expires_in: 60 } })).toBe("t-1");
    expect(extractPtyTicket({ data: { token: "t-2" } })).toBe("t-2");
    expect(extractPtyTicket({ data: "raw-token" })).toBe("raw-token");
  });

  it("returns null when absent", () => {
    expect(extractPtyTicket(null)).toBeNull();
    expect(extractPtyTicket({ data: {} })).toBeNull();
  });
});

describe("extractAgents", () => {
  it("extracts id, name and mode from a { location, data } envelope", () => {
    expect(
      extractAgents({
        location: { directory: "/repo" },
        data: [
          { id: "coder", name: "Coder", mode: "primary" },
          { id: "oracle", mode: "all" },
        ],
      }),
    ).toEqual([
      { id: "coder", name: "Coder", mode: "primary" },
      { id: "oracle", name: "oracle", mode: "all" },
    ]);
  });

  it("supports a plain array and tolerates missing fields", () => {
    expect(extractAgents([{ id: "a" }, null, "rohr"])).toEqual([
      { id: "a", name: "a", mode: "all" },
      { id: "agent-1", name: "null", mode: "all" },
      { id: "agent-2", name: "rohr", mode: "all" },
    ]);
    expect(extractAgents(null)).toEqual([]);
    expect(extractAgents({ data: "nope" })).toEqual([]);
  });

  it("drops hidden agents, which must not be offered for picking", () => {
    expect(
      extractAgents([
        { id: "build", name: "Build", hidden: false },
        { id: "intern", name: "Intern", hidden: true },
        { id: "plan", name: "Plan" },
      ]),
    ).toEqual([
      { id: "build", name: "Build", mode: "all" },
      { id: "plan", name: "Plan", mode: "all" },
    ]);
  });
});

describe("extractModels", () => {
  it("prefers modelID over id and keeps providerID", () => {
    expect(
      extractModels({
        location: {},
        data: [
          { id: "anthropic/claude", modelID: "claude-sonnet-4", providerID: "anthropic", name: "Claude Sonnet 4" },
          { modelID: "gpt-5", providerID: "openai" },
        ],
      }),
    ).toEqual([
      { id: "claude-sonnet-4", providerID: "anthropic", name: "Claude Sonnet 4" },
      { id: "gpt-5", providerID: "openai", name: "gpt-5" },
    ]);
  });

  it("keeps an optional variant and tolerates missing shapes", () => {
    expect(extractModels([{ modelID: "m1", providerID: "p", variant: "reasoning" }])).toEqual([
      { id: "m1", providerID: "p", name: "m1", variant: "reasoning" },
    ]);
    expect(extractModels([{ providerID: "p" }])).toEqual([
      { id: "modell-0", providerID: "p", name: "modell-0" },
    ]);
    expect(extractModels(null)).toEqual([]);
  });

  it("expands a model with variants into one option per variant", () => {
    expect(
      extractModels([
        {
          modelID: "claude-sonnet-4",
          providerID: "anthropic",
          name: "Claude Sonnet 4",
          variants: [{ id: "high" }, { id: "low" }],
        },
      ]),
    ).toEqual([
      { id: "claude-sonnet-4", providerID: "anthropic", name: "Claude Sonnet 4 (high)", variant: "high" },
      { id: "claude-sonnet-4", providerID: "anthropic", name: "Claude Sonnet 4 (low)", variant: "low" },
    ]);
  });

  it("keeps the plain option when variants exist but none carry an id", () => {
    expect(extractModels([{ modelID: "m", providerID: "p", variants: [{}, null] }])).toEqual([
      { id: "m", providerID: "p", name: "m" },
    ]);
  });
});

describe("modelOptionValue", () => {
  it("round-trips through parseModelOptionValue", () => {
    const plain = { id: "m1", providerID: "p", name: "M1" };
    expect(modelOptionValue(plain)).toBe("p/m1");
    expect(parseModelOptionValue("p/m1")).toEqual({ id: "m1", providerID: "p" });

    const withVariant = { id: "m1", providerID: "p", name: "M1 (high)", variant: "high" };
    expect(modelOptionValue(withVariant)).toBe("p/m1#high");
    expect(parseModelOptionValue("p/m1#high")).toEqual({
      id: "m1",
      providerID: "p",
      variant: "high",
    });
  });

  it("produces distinct values for the variants of one model", () => {
    const options = extractModels([
      { modelID: "m", providerID: "p", name: "M", variants: [{ id: "a" }, { id: "b" }] },
    ]);
    const values = options.map(modelOptionValue);
    expect(new Set(values).size).toBe(options.length);
  });

  it("rejects values this app never produced", () => {
    expect(parseModelOptionValue("")).toBeNull();
    expect(parseModelOptionValue("kein-slash")).toBeNull();
    expect(parseModelOptionValue("/m1")).toBeNull();
    expect(parseModelOptionValue("p/")).toBeNull();
  });
});

describe("extractSessionInfo", () => {
  it("reads agent and model from an unwrapped SessionInfo", () => {
    expect(
      extractSessionInfo({
        id: "ses-1",
        agent: "coder",
        model: { id: "claude-sonnet-4", providerID: "anthropic" },
      }),
    ).toEqual({
      id: "ses-1",
      agent: "coder",
      model: { id: "claude-sonnet-4", providerID: "anthropic" },
      tokens: null,
      cost: null,
    });
  });

  it("unwraps a { data } envelope and tolerates missing agent/model", () => {
    expect(
      extractSessionInfo({ data: { id: "ses-2", model: { id: "gpt-5", providerID: "openai", variant: "x" } } }),
    ).toEqual({
      id: "ses-2",
      agent: null,
      model: { id: "gpt-5", providerID: "openai", variant: "x" },
      tokens: null,
      cost: null,
    });
    expect(extractSessionInfo({ id: "ses-3" })).toEqual({
      id: "ses-3",
      agent: null,
      model: null,
      tokens: null,
      cost: null,
    });
  });

  it("reads per-session token usage and cost", () => {
    expect(
      extractSessionInfo({
        id: "ses-4",
        tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } },
        cost: 0.012,
      }),
    ).toEqual({
      id: "ses-4",
      agent: null,
      model: null,
      tokens: { input: 10, output: 5, reasoning: 2, cacheRead: 3, cacheWrite: 1 },
      cost: 0.012,
    });
    expect(extractSessionInfo({ id: "ses-5", tokens: null, cost: "teuer" })).toEqual({
      id: "ses-5",
      agent: null,
      model: null,
      tokens: null,
      cost: null,
    });
  });

  it("returns null when no id exists", () => {
    expect(extractSessionInfo(null)).toBeNull();
    expect(extractSessionInfo({ agent: "coder" })).toBeNull();
    expect(extractSessionInfo({ data: { agent: "coder" } })).toBeNull();
  });
});

describe("extractListRows", () => {
  it("accepts a { data } envelope and a plain array", () => {
    expect(extractListRows({ location: {}, data: [1, 2] })).toEqual([1, 2]);
    expect(extractListRows([1, 2])).toEqual([1, 2]);
  });

  it("returns nothing for shapes that carry no rows", () => {
    expect(extractListRows(null)).toEqual([]);
    expect(extractListRows({ data: "nope" })).toEqual([]);
    expect(extractListRows("text")).toEqual([]);
  });
});

describe("extractFileEntries", () => {
  it("reads path and directory type", () => {
    expect(
      extractFileEntries({
        location: { directory: "/repo" },
        data: [
          { path: "src", type: "directory" },
          { path: "README.md", type: "file" },
          { path: "ohne-typ" },
        ],
      }),
    ).toEqual([
      { path: "src", type: "directory" },
      { path: "README.md", type: "file" },
      { path: "ohne-typ", type: "file" },
    ]);
  });

  it("tolerates non-objects and missing paths", () => {
    expect(extractFileEntries([null, "README.md"])).toEqual([
      { path: "null", type: "file" },
      { path: "README.md", type: "file" },
    ]);
    expect(extractFileEntries([{}])).toEqual([{ path: "eintrag-0", type: "file" }]);
  });
});

describe("decodeFileContent", () => {
  it("decodes UTF-8 bytes", () => {
    const bytes = new TextEncoder().encode("Zeile eins\nZeile zwei\n");
    expect(decodeFileContent(bytes)).toEqual({
      text: "Zeile eins\nZeile zwei\n",
      truncated: false,
    });
  });

  it("caps very large files and flags the cut", () => {
    const bytes = new TextEncoder().encode("x".repeat(MAX_FILE_PREVIEW_CHARS + 500));
    const decoded = decodeFileContent(bytes);
    expect(decoded.truncated).toBe(true);
    expect(decoded.text).toHaveLength(MAX_FILE_PREVIEW_CHARS);
  });

  it("handles an empty file", () => {
    expect(decodeFileContent(new Uint8Array(0))).toEqual({ text: "", truncated: false });
  });
});

describe("extractVcsStatus", () => {
  it("normalizes changed files with their line counts", () => {
    expect(
      extractVcsStatus({
        location: {},
        data: [
          { file: "src/a.ts", additions: 3, deletions: 1, status: "modified" },
          { file: "src/b.ts", additions: 9, deletions: 0, status: "added" },
          { file: "src/c.ts", additions: 0, deletions: 7, status: "deleted" },
        ],
      }),
    ).toEqual([
      { file: "src/a.ts", status: "modified", additions: 3, deletions: 1 },
      { file: "src/b.ts", status: "added", additions: 9, deletions: 0 },
      { file: "src/c.ts", status: "deleted", additions: 0, deletions: 7 },
    ]);
  });

  it("falls back to a safe row for unusable entries", () => {
    expect(extractVcsStatus([{ file: "x", status: "quatsch" }, null])).toEqual([
      { file: "x", status: "modified", additions: 0, deletions: 0 },
      { file: "null", status: "modified", additions: 0, deletions: 0 },
    ]);
  });
});

describe("extractWorktrees", () => {
  it("reads directory and strategy from a { data } envelope", () => {
    expect(
      extractWorktrees({
        location: {},
        data: [
          { directory: "/repo", strategy: "copy" },
          { directory: "/repo-wt" },
        ],
      }),
    ).toEqual([
      { directory: "/repo", strategy: "copy" },
      { directory: "/repo-wt", strategy: null },
    ]);
  });

  it("returns an empty list for missing shapes", () => {
    expect(extractWorktrees(null)).toEqual([]);
    expect(extractWorktrees({ data: {} })).toEqual([]);
  });
});

describe("extractMcpServers", () => {
  it("reads the nested status object and its error", () => {
    expect(
      extractMcpServers({
        location: {},
        data: [
          { name: "filesystem", status: { status: "connected" } },
          { name: "github", status: { status: "failed", error: "401 unauthorized" } },
          { name: "linear", status: { status: "needs_auth", error: "token fehlt" } },
          { name: "atlassian", status: { status: "disabled" } },
          { name: "vercel", status: { status: "pending" } },
        ],
      }),
    ).toEqual([
      { name: "filesystem", status: "connected", error: null },
      { name: "github", status: "failed", error: "401 unauthorized" },
      { name: "linear", status: "needs_auth", error: "token fehlt" },
      { name: "atlassian", status: "disabled", error: null },
      { name: "vercel", status: "pending", error: null },
    ]);
  });

  it("falls back to pending for unknown states", () => {
    expect(extractMcpServers([{ name: "x", status: { status: "unbekannt" } }])).toEqual([
      { name: "x", status: "pending", error: null },
    ]);
    expect(extractMcpServers(null)).toEqual([]);
  });
});

describe("extractPermissionRequests", () => {
  it("normalizes pending requests", () => {
    expect(
      extractPermissionRequests({
        location: {},
        data: [
          {
            id: "per-1",
            sessionID: "ses-1",
            action: "bash",
            resources: ["rm -rf /tmp/x"],
            message: "Shell-Befehl erlauben?",
          },
          { id: "per-2", action: "edit", resources: [] },
        ],
      }),
    ).toEqual([
      {
        id: "per-1",
        sessionID: "ses-1",
        action: "bash",
        resources: ["rm -rf /tmp/x"],
        message: "Shell-Befehl erlauben?",
      },
      { id: "per-2", sessionID: "", action: "edit", resources: [], message: null },
    ]);
  });

  it("keeps only string resources and tolerates junk", () => {
    expect(extractPermissionRequests([{ resources: ["a", 1, "", null] }])).toEqual([
      { id: "anfrage-0", sessionID: "", action: "unbekannt", resources: ["a"], message: null },
    ]);
  });
});

describe("listAgents direct-fetch fallback", () => {
  const agentServer: ServerConfig = {
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

  beforeEach(() => {
    agentListMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the direct fetch path when the client method throws", async () => {
    agentListMock.mockRejectedValue(new Error("Client kaputt"));
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ id: "coder", name: "Coder", mode: "primary" }] }),
    );
    const result = await listAgents(agentServer);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "coder", name: "Coder", mode: "primary" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/agent",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
  });

  it("surfaces the fetch status when the fallback also fails", async () => {
    agentListMock.mockRejectedValue(new Error("Client kaputt"));
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const result = await listAgents(agentServer);
    expect(result.data).toBeNull();
    expect(result.error).toContain("500");
  });

  it("prefers the client result and never fetches when it succeeds", async () => {
    agentListMock.mockResolvedValue({ data: [{ id: "coder" }] });
    const result = await listAgents(agentServer);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "coder", name: "coder", mode: "all" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extractTokenUsage", () => {
  it("normalizes TokenUsageInfo with its cache counters", () => {
    expect(
      extractTokenUsage({ input: 7, output: 3, reasoning: 1, cache: { read: 2, write: 0 } }),
    ).toEqual({ input: 7, output: 3, reasoning: 1, cacheRead: 2, cacheWrite: 0 });
  });

  it("defaults missing counters to zero and rejects junk", () => {
    expect(extractTokenUsage({ input: 7, output: 3 })).toEqual({
      input: 7,
      output: 3,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(extractTokenUsage(null)).toBeNull();
    expect(extractTokenUsage({ output: 3 })).toBeNull();
    expect(extractTokenUsage({ input: "viel", output: 3 })).toBeNull();
  });
});

describe("extractSessionStats", () => {
  it("normalizes the global aggregate with tool totals", () => {
    expect(
      extractSessionStats({
        data: {
          sessions: 4,
          prompts: 20,
          steps: 55,
          tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 10, write: 5 } },
          cost: 1.23,
          tools: { mode: "summary", totals: { calls: 9, succeeded: 8, failed: 1, unfinished: 0 } },
        },
      }),
    ).toEqual({
      sessions: 4,
      prompts: 20,
      steps: 55,
      tokens: { input: 100, output: 50, reasoning: 0, cacheRead: 10, cacheWrite: 5 },
      cost: 1.23,
      toolCalls: 9,
    });
  });

  it("tolerates missing tool totals and rejects junk", () => {
    expect(extractSessionStats({ sessions: 1, prompts: 2, steps: 3 })).toMatchObject({
      sessions: 1,
      toolCalls: null,
      cost: 0,
    });
    expect(extractSessionStats(null)).toBeNull();
    expect(extractSessionStats({})).toBeNull();
  });
});

describe("extractSessionDiff", () => {
  it("normalizes FileDiffInfo rows", () => {
    expect(
      extractSessionDiff({
        data: [
          { file: "src/a.ts", patch: "@@ -1 +1 @@", additions: 2, deletions: 1, status: "modified" },
          { file: "src/neu.ts", patch: "...", additions: 5, deletions: 0, status: "added" },
        ],
      }),
    ).toEqual([
      { file: "src/a.ts", patch: "@@ -1 +1 @@", additions: 2, deletions: 1, status: "modified" },
      { file: "src/neu.ts", patch: "...", additions: 5, deletions: 0, status: "added" },
    ]);
  });

  it("falls back to modified for unknown states", () => {
    expect(extractSessionDiff([{ file: "x", status: "quatsch" }, null])).toEqual([
      { file: "x", patch: "", additions: 0, deletions: 0, status: "modified" },
      { file: "null", patch: "", additions: 0, deletions: 0, status: "modified" },
    ]);
    expect(extractSessionDiff(null)).toEqual([]);
  });
});

describe("extractAgentDetail", () => {
  it("reads an enveloped AgentInfo with its model ref", () => {
    expect(
      extractAgentDetail({
        location: {},
        data: {
          id: "coder",
          name: "Coder",
          description: "Schreibt Code",
          mode: "primary",
          model: { id: "claude-sonnet-4", providerID: "anthropic" },
        },
      }),
    ).toEqual({
      id: "coder",
      name: "Coder",
      description: "Schreibt Code",
      mode: "primary",
      model: { id: "claude-sonnet-4", providerID: "anthropic" },
    });
  });

  it("tolerates missing detail fields", () => {
    expect(extractAgentDetail({ id: "a" })).toEqual({
      id: "a",
      name: "a",
      description: null,
      mode: "all",
      model: null,
    });
    expect(extractAgentDetail(null)).toBeNull();
    expect(extractAgentDetail({ name: "ohne-id" })).toBeNull();
  });
});

describe("extractProviders", () => {
  it("reads id, name and activation from an envelope", () => {
    expect(
      extractProviders({
        location: {},
        data: [
          { id: "anthropic", name: "Anthropic", activation: "enabled" },
          { id: "openai" },
        ],
      }),
    ).toEqual([
      { id: "anthropic", name: "Anthropic", activation: "enabled" },
      { id: "openai", name: "openai", activation: "auto" },
    ]);
  });

  it("tolerates junk rows", () => {
    expect(extractProviders([null])).toEqual([
      { id: "anbieter-0", name: "null", activation: "auto" },
    ]);
    expect(extractProviders(null)).toEqual([]);
  });
});

describe("extractModelCapabilities", () => {
  it("reads tools and I/O formats", () => {
    expect(
      extractModelCapabilities({ tools: true, input: ["text", "image"], output: ["text"] }),
    ).toEqual({ tools: true, input: ["text", "image"], output: ["text"] });
  });

  it("rejects payloads without a tools flag", () => {
    expect(extractModelCapabilities(null)).toBeNull();
    expect(extractModelCapabilities({ input: ["text"] })).toBeNull();
  });

  it("keeps capabilities on model options for overviews", () => {
    const options = extractModels([
      { modelID: "m1", providerID: "p", capabilities: { tools: false, input: ["text"], output: ["text"] } },
    ]);
    expect(options[0]?.capabilities).toEqual({ tools: false, input: ["text"], output: ["text"] });
  });
});

describe("toPromptFileUri", () => {
  it("turns workspace paths into file URIs", () => {
    expect(toPromptFileUri("src/app.ts")).toBe("file:///src/app.ts");
    expect(toPromptFileUri("/repo/src/app.ts")).toBe("file:///repo/src/app.ts");
  });

  it("passes real URIs through", () => {
    expect(toPromptFileUri("file:///repo/a.ts")).toBe("file:///repo/a.ts");
  });
});

describe("modelLabelLookup", () => {
  it("maps provider/model to the model's display name", () => {
    expect(
      modelLabelLookup([
        { id: "sonnet", providerID: "anthropic", name: "Claude Sonnet 4" },
        { id: "gpt", providerID: "openai", name: "GPT" },
      ]),
    ).toEqual({
      "anthropic/sonnet": "Claude Sonnet 4",
      "openai/gpt": "GPT",
    });
  });

  it("prefers the bare entry over an expanded variant spelling", () => {
    expect(
      modelLabelLookup([
        { id: "sonnet", providerID: "anthropic", name: "Claude Sonnet 4 (high)", variant: "high" },
        { id: "sonnet", providerID: "anthropic", name: "Claude Sonnet 4" },
      ]),
    ).toEqual({ "anthropic/sonnet": "Claude Sonnet 4" });
  });

  it("skips entries without a provider", () => {
    expect(modelLabelLookup([{ id: "m1", providerID: "", name: "Nameless" }])).toEqual({});
  });
});

describe("parity batch 2 direct-fetch fallbacks", () => {
  const parityServer: ServerConfig = {
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

  beforeEach(() => {
    agentListMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches global stats from /api/experimental/session/stats when the client throws", async () => {
    // The mocked client only implements `agent.list` — every other namespace
    // is undefined, so the client call throws and the fetch path runs.
    fetchMock.mockResolvedValue(jsonResponse({ data: { sessions: 2, prompts: 5, steps: 9 } }));
    const result = await getSessionStats(parityServer);
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ sessions: 2, prompts: 5, steps: 9, toolCalls: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/experimental/session/stats",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
  });

  it("fetches the session diff from /api/session/{id}/diff", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ file: "a.ts", patch: "p", additions: 1, deletions: 0, status: "added" }] }),
    );
    const result = await getSessionDiff(parityServer, "ses-1");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { file: "a.ts", patch: "p", additions: 1, deletions: 0, status: "added" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/session/ses-1/diff",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
  });

  it("initializes a git repository via POST /api/vcs/init", async () => {
    // 204 / empty body: the client path cancels the response, the fallback
    // only checks the status.
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as unknown as Response);
    const result = await initVcs(parityServer, "/repo/a");
    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/vcs/init?location[directory]=%2Frepo%2Fa",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("initializes the server default location without a query", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as unknown as Response);
    const result = await initVcs(parityServer);
    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/vcs/init",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forks via POST /api/session/{id}/fork and returns the new session", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "ses-2" } }));
    const result = await forkSession(parityServer, "ses-1");
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: "ses-2" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/session/ses-1/fork",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("compacts via POST /api/session/{id}/compact", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await compactSession(parityServer, "ses-1");
    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/session/ses-1/compact",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reads one agent from /api/agent/{id}", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "coder", name: "Coder", mode: "primary" } }));
    const result = await getAgentDetail(parityServer, "coder");
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: "coder", name: "Coder", mode: "primary" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/agent/coder",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
  });

  it("lists providers from /api/provider", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ id: "anthropic", name: "Anthropic", activation: "enabled" }] }),
    );
    const result = await listProviders(parityServer);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "anthropic", name: "Anthropic", activation: "enabled" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/provider",
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" }),
      }),
    );
  });
});

describe("sessionTitle", () => {
  it("keeps real titles and falls back to the id when empty", () => {
    expect(sessionTitle("Alpha bauen", "ses-1")).toBe("Alpha bauen");
    expect(sessionTitle(null, "ses-1")).toBe("ses-1");
    expect(sessionTitle("   ", "ses-1")).toBe("ses-1");
  });

  it("strips generated placeholders", () => {
    expect(sessionTitle("New session - 2026-10-08T12:00:00.000Z", "ses-1")).toBe("ses-1");
    expect(sessionTitle("New session", "ses-1")).toBe("ses-1");
    expect(sessionTitle("Child session - abc123", "ses-1")).toBe("ses-1");
    expect(sessionTitle("Newest session notes", "ses-1")).toBe("Newest session notes");
  });
});

describe("extractSessionRows title hygiene", () => {
  it("labels default titles with the session id", () => {
    const rows = extractSessionRows({
      data: [
        { id: "s1", title: "New session - 2026-10-08T12:00:00.000Z" },
        { id: "s2", title: "Echter Titel" },
        { id: "s3" },
      ],
    });
    expect(rows.map((row) => row.label)).toEqual(["s1", "Echter Titel", "s3"]);
  });
});

describe("extractSessionRename", () => {
  it("reads session.renamed events", () => {
    expect(
      extractSessionRename({
        type: "session.renamed",
        data: { sessionID: "ses-1", title: "Neuer Titel" },
      }),
    ).toEqual({ sessionID: "ses-1", title: "Neuer Titel" });
  });

  it("rejects other types and malformed payloads", () => {
    expect(extractSessionRename({ type: "session.idle", data: {} })).toBeNull();
    expect(extractSessionRename({ type: "session.renamed", data: { sessionID: "" } })).toBeNull();
    expect(extractSessionRename({ type: "session.renamed" })).toBeNull();
    expect(extractSessionRename(null)).toBeNull();
  });
});

describe("renameSession", () => {
  const renameServer: ServerConfig = {
    id: "s1",
    name: "Lokal",
    baseUrl: "http://x.local/",
    username: "",
  };

  function renameResponse(status = 204): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => ({}) } as unknown as Response;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renames via PATCH /api/session/{id} when the client is unavailable", async () => {
    // The mocked client only implements `agent.list` — `session.update` is
    // undefined, so the client call throws and the fetch path runs.
    fetchMock.mockResolvedValue(renameResponse());
    const result = await renameSession(renameServer, "ses-1", "Neuer Titel");
    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/session/ses-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Neuer Titel" }),
      }),
    );
  });

  it("surfaces the fetch status when renaming fails", async () => {
    fetchMock.mockResolvedValue(renameResponse(500));
    const result = await renameSession(renameServer, "ses-1", "Neuer Titel");
    expect(result.error).toContain("500");
  });
});

describe("extractShellRows", () => {
  it("reads the { location, data } shape the pinned client returns", () => {
    expect(
      extractShellRows({
        location: {},
        data: [{ id: "sh-1", command: "sleep 60", status: "running", time: { created: 1000 } }],
      }),
    ).toEqual([{ id: "sh-1", command: "sleep 60", status: "running", createdAt: 1000 }]);
  });

  it("reads a plain array and a { data } envelope", () => {
    const row = { id: "sh-2", command: "pnpm test", status: "completed", time: { created: 5 } };
    expect(extractShellRows([row])).toEqual([
      { id: "sh-2", command: "pnpm test", status: "completed", createdAt: 5 },
    ]);
    expect(extractShellRows({ data: [row] })).toHaveLength(1);
  });

  it("falls back to the id as command and tolerates junk", () => {
    expect(extractShellRows([{ id: "sh-3" }])).toEqual([
      { id: "sh-3", command: "sh-3", status: "", createdAt: null },
    ]);
    expect(extractShellRows(null)).toEqual([]);
    expect(extractShellRows({ data: [null, 5] })).toEqual([]);
  });
});

describe("isRunningShellStatus", () => {
  it("treats a missing status as running and settled states as done", () => {
    expect(isRunningShellStatus("")).toBe(true);
    expect(isRunningShellStatus("running")).toBe(true);
    expect(isRunningShellStatus("Running")).toBe(true);
    for (const status of ["completed", "exited", "error", "failed", "killed", "done"]) {
      expect(isRunningShellStatus(status)).toBe(false);
    }
  });
});

describe("extractPtyRows", () => {
  it("reads ids, titles and start times", () => {
    expect(
      extractPtyRows({ data: [{ id: "pty-1", title: "Terminal", time: { created: 42 } }] }),
    ).toEqual([{ id: "pty-1", title: "Terminal", createdAt: 42 }]);
  });

  it("tolerates missing titles, id variants and junk", () => {
    expect(extractPtyRows([{ ptyID: "pty-2" }])).toEqual([
      { id: "pty-2", title: null, createdAt: null },
    ]);
    expect(extractPtyRows("nope")).toEqual([]);
  });
});

describe("getSessionInfo (client unwrap fallback)", () => {
  const infoServer: ServerConfig = {
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

  beforeEach(() => {
    sessionGetMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the client result when the server sends the { data } envelope", async () => {
    // The generated client already unwrapped `.data` for us.
    sessionGetMock.mockResolvedValue({ id: "ses-1", agent: "build" });
    const result = await getSessionInfo(infoServer, "ses-1");
    expect(result.error).toBeNull();
    expect(result.data?.agent).toBe("build");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the direct fetch when the client resolves undefined", async () => {
    // A server that answers WITHOUT the envelope makes `session.get()` resolve
    // undefined (regression: the picker used to stick on "Keiner").
    sessionGetMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(jsonResponse({ id: "ses-1", agent: "plan" }));
    const result = await getSessionInfo(infoServer, "ses-1");
    expect(result.error).toBeNull();
    expect(result.data?.agent).toBe("plan");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the direct fetch when the client throws", async () => {
    sessionGetMock.mockRejectedValue(new Error("offline"));
    fetchMock.mockResolvedValue(jsonResponse({ id: "ses-1", agent: "coder" }));
    const result = await getSessionInfo(infoServer, "ses-1");
    expect(result.data?.agent).toBe("coder");
  });
});

describe("extractProjectUpdated", () => {
  it("reads the full project out of the verified event shape", () => {
    expect(
      extractProjectUpdated({
        type: "project.updated",
        data: { id: "p1", name: "Neu", canonical: "/srv/app", vcs: "git" },
      }),
    ).toEqual({ id: "p1", name: "Neu", canonical: "/srv/app", vcs: "git" });
  });

  it("carries the icon color", () => {
    expect(
      extractProjectUpdated({
        type: "project.updated",
        data: { id: "p1", canonical: "/srv/app", icon: { color: "oklch(0.7 0.2 264)", override: "code" } },
      }),
    ).toEqual({
      id: "p1",
      name: "/srv/app",
      canonical: "/srv/app",
      icon: { color: "oklch(0.7 0.2 264)", override: "code" },
    });
  });

  it("rejects other types and malformed payloads", () => {
    expect(extractProjectUpdated({ type: "session.updated", data: { id: "p1" } })).toBeNull();
    expect(extractProjectUpdated({ type: "project.updated", data: { name: "x" } })).toBeNull();
    expect(extractProjectUpdated({ type: "project.updated" })).toBeNull();
    expect(extractProjectUpdated(null)).toBeNull();
  });
});

describe("extractFileListing", () => {
  it("splits the { location, data } shape of file.list", () => {
    expect(
      extractFileListing({ location: { directory: "/srv" }, data: [{ path: "src", type: "directory" }] }),
    ).toEqual({ location: "/srv", entries: [{ path: "src", type: "directory" }] });
  });

  it("tolerates a missing location and a plain array", () => {
    expect(extractFileListing([{ path: "a", type: "file" }])).toEqual({
      location: null,
      entries: [{ path: "a", type: "file" }],
    });
    expect(extractFileListing(null)).toEqual({ location: null, entries: [] });
  });
});

describe("updateProject", () => {
  const patchServer: ServerConfig = {
    id: "s1",
    name: "Lokal",
    baseUrl: "http://x.local/",
    username: "",
  };

  function patchResponse(body: string, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as unknown as Response;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renames via PATCH /api/project/{id} when the client is unavailable", async () => {
    // The mocked client has no `project.update` — the client call throws and
    // the direct-fetch path runs with the same method/path/body.
    fetchMock.mockResolvedValue(patchResponse(JSON.stringify({ id: "p1", name: "Neu" })));
    const result = await updateProject(patchServer, "p1", { name: "Neu" });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: "p1", name: "Neu" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/project/p1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ projectID: "p1", name: "Neu" }),
      }),
    );
  });

  it("sends the color as an icon override", async () => {
    fetchMock.mockResolvedValue(patchResponse(""));
    await updateProject(patchServer, "p1", { name: "Neu", color: "oklch(0.7 0.2 264)" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/project/p1",
      expect.objectContaining({
        body: JSON.stringify({
          projectID: "p1",
          name: "Neu",
          icon: { color: "oklch(0.7 0.2 264)" },
        }),
      }),
    );
  });

  it("survives a 204 without a body", async () => {
    fetchMock.mockResolvedValue(patchResponse("", 204));
    const result = await updateProject(patchServer, "p1", { name: "Neu" });
    expect(result.error).toBeNull();
    expect(result.data?.name).toBe("Neu");
  });

  it("surfaces the fetch status when the update fails", async () => {
    fetchMock.mockResolvedValue(patchResponse("", 500));
    const result = await updateProject(patchServer, "p1", { name: "Neu" });
    expect(result.error).toContain("500");
  });
});

describe("createSession", () => {
  const createServer: ServerConfig = {
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

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the chosen directory as the session location", async () => {
    // The mocked client has no `session.create` — the client call throws and
    // the direct-fetch path posts to /api/session.
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "ses-new", agent: "coder" } }));
    const result = await createSession(createServer, { directory: "/srv/new-app" });
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe("ses-new");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ location: { directory: "/srv/new-app" } }),
      }),
    );
  });

  it("posts no location when no directory was chosen", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "ses-plain" }));
    const result = await createSession(createServer, {});
    expect(result.data?.id).toBe("ses-plain");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://x.local/api/session",
      expect.objectContaining({ body: JSON.stringify({}) }),
    );
  });

  it("surfaces the fetch status when creation fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const result = await createSession(createServer, { directory: "/srv/app" });
    expect(result.error).toContain("500");
  });
});
