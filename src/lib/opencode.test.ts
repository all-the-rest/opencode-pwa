import { describe, expect, it } from "vitest";
import {
  basicAuthHeader,
  extractAgents,
  extractModels,
  extractProjects,
  extractPtyTicket,
  extractSessionInfo,
  extractSessionPage,
  extractSessionRows,
  extractShellOutput,
  filterSessionRows,
  groupSessionsByProject,
  modelOptionValue,
  parseModelOptionValue,
  sessionAgentKey,
  sessionProjectKey,
  UNASSIGNED_PROJECT_KEY,
  type ServerConfig,
} from "./opencode.ts";

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://localhost:4096",
  username: "user",
  password: "secret",
};

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
      { id: "p1", name: "Alpha" },
      { id: "p2", name: "/repo/b" },
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
    });
  });

  it("unwraps a { data } envelope and tolerates missing agent/model", () => {
    expect(
      extractSessionInfo({ data: { id: "ses-2", model: { id: "gpt-5", providerID: "openai", variant: "x" } } }),
    ).toEqual({
      id: "ses-2",
      agent: null,
      model: { id: "gpt-5", providerID: "openai", variant: "x" },
    });
    expect(extractSessionInfo({ id: "ses-3" })).toEqual({ id: "ses-3", agent: null, model: null });
  });

  it("returns null when no id exists", () => {
    expect(extractSessionInfo(null)).toBeNull();
    expect(extractSessionInfo({ agent: "coder" })).toBeNull();
    expect(extractSessionInfo({ data: { agent: "coder" } })).toBeNull();
  });
});
