import { describe, expect, it } from "vitest";
import {
  basicAuthHeader,
  extractProjects,
  extractPtyTicket,
  extractSessionPage,
  extractSessionRows,
  extractShellOutput,
  filterSessionRows,
  groupSessionsByProject,
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
