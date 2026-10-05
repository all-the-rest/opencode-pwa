import { describe, expect, it } from "vitest";
import {
  basicAuthHeader,
  extractProjects,
  extractSessionRows,
  groupSessionsByProject,
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
