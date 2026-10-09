import { describe, expect, it } from "vitest";
import type { ProjectInfo } from "./opencode.ts";
import {
  applyProjectUpdate,
  buildProjectTree,
  isPathLike,
  pathBasename,
  pathSegments,
  patchedProject,
  projectIconColor,
  projectTreeLabel,
  projectTreeNodeLabel,
  projectUpdatePayload,
} from "./projectTree.ts";

function project(
  id: string,
  canonical?: string,
  name?: string,
): ProjectInfo {
  return {
    id,
    name: name ?? canonical ?? id,
    ...(canonical === undefined ? {} : { canonical }),
  };
}

describe("isPathLike", () => {
  it("accepts absolute, home and windows paths", () => {
    expect(isPathLike("/srv/app")).toBe(true);
    expect(isPathLike("~/work/app")).toBe(true);
    expect(isPathLike("C:\\work\\app")).toBe(true);
    expect(isPathLike("relative/dir")).toBe(true);
  });

  it("rejects plain labels", () => {
    expect(isPathLike("Mein Projekt")).toBe(false);
    expect(isPathLike("")).toBe(false);
    expect(isPathLike(undefined)).toBe(false);
  });
});

describe("pathSegments / pathBasename", () => {
  it("normalizes separators and drops empty parts", () => {
    expect(pathSegments("/home/user/work/")).toEqual(["home", "user", "work"]);
    expect(pathSegments("C:\\work\\app")).toEqual(["C:", "work", "app"]);
  });

  it("takes the last segment as label", () => {
    expect(pathBasename("/home/user/work/app")).toBe("app");
    expect(pathBasename("/")).toBe("/");
  });
});

describe("buildProjectTree", () => {
  it("stays flat without any path", () => {
    const tree = buildProjectTree([project("p1", undefined, "Alpha"), project("p2", undefined, "Beta")]);
    expect(tree.mode).toBe("flat");
    expect(tree.pathed).toEqual([]);
    expect(tree.unpathed).toHaveLength(2);
    expect(tree.roots).toEqual([]);
  });

  it("stays flat for siblings under one common root", () => {
    const tree = buildProjectTree([
      project("p1", "/projects/opencode-pwa"),
      project("p2", "/projects/agents-skills"),
    ]);
    expect(tree.mode).toBe("flat");
    expect(tree.pathed).toHaveLength(2);
    expect(tree.roots).toHaveLength(1);
  });

  it("stays flat for a single project", () => {
    const tree = buildProjectTree([project("p1", "/srv/app")]);
    expect(tree.mode).toBe("flat");
  });

  it("builds a tree for several roots", () => {
    const tree = buildProjectTree([project("p1", "/srv/api"), project("p2", "/home/dev/web")]);
    expect(tree.mode).toBe("tree");
    expect(tree.roots.map((node) => node.label)).toEqual(["home", "srv"]);
    expect(tree.roots[0]?.path).toBe("/home");
    expect(tree.roots[1]?.children[0]?.path).toBe("/srv/api");
  });

  it("builds a tree when a project is the parent of another project", () => {
    const tree = buildProjectTree([
      project("p1", "/srv/app"),
      project("p2", "/srv/app/services/api"),
    ]);
    expect(tree.mode).toBe("tree");
    const app = tree.roots[0]?.children[0];
    expect(app?.path).toBe("/srv/app");
    expect(app?.projects.map((p) => p.id)).toEqual(["p1"]);
    const services = app?.children[0];
    expect(services?.path).toBe("/srv/app/services");
    expect(services?.projects).toEqual([]);
    expect(services?.children[0]?.path).toBe("/srv/app/services/api");
    expect(services?.children[0]?.projects.map((p) => p.id)).toEqual(["p2"]);
  });

  it("groups two projects on the same directory on one node", () => {
    const tree = buildProjectTree([
      project("p1", "/srv/app"),
      project("p2", "/srv/app"),
      project("p3", "/other/app"),
    ]);
    expect(tree.mode).toBe("tree");
    const app = tree.roots[1]?.children[0];
    expect(app?.projects).toHaveLength(2);
  });

  it("reports projects without a path as unpathed", () => {
    const tree = buildProjectTree([project("p1", "/srv/app"), project("p2", undefined, "Ohne Pfad")]);
    expect(tree.mode).toBe("flat");
    expect(tree.unpathed.map((p) => p.id)).toEqual(["p2"]);
  });

  it("sorts children by label", () => {
    const tree = buildProjectTree([
      project("p1", "/srv/zeta"),
      project("p2", "/srv/alpha"),
      project("p3", "/srv/mid"),
    ]);
    expect(tree.roots[0]?.children.map((node) => node.label)).toEqual(["alpha", "mid", "zeta"]);
  });
});

describe("projectTreeLabel", () => {
  it("collapses a still-path-like name to the basename", () => {
    expect(projectTreeLabel(project("p1", "/projects/opencode-pwa"))).toBe("opencode-pwa");
  });

  it("keeps a custom display name everywhere", () => {
    expect(projectTreeLabel(project("p1", "/projects/opencode-pwa", "Mein PWA"))).toBe("Mein PWA");
  });

  it("falls back to the name and then the id", () => {
    expect(projectTreeLabel(project("p1", undefined, "Alpha"))).toBe("Alpha");
    expect(projectTreeLabel({ id: "p1", name: "" })).toBe("p1");
  });
});

describe("projectTreeNodeLabel", () => {
  it("prefers a renamed project on the node", () => {
    const tree = buildProjectTree([
      project("p1", "/srv/app", "Mein App"),
      project("p2", "/srv/app/services/api"),
    ]);
    const app = tree.roots[0]?.children[0];
    if (app === undefined) throw new Error("node /srv/app missing");
    expect(projectTreeNodeLabel(app)).toBe("Mein App");
  });
});

describe("projectUpdatePayload", () => {
  it("sends only the project id when nothing changed", () => {
    expect(projectUpdatePayload("p1", {})).toEqual({ projectID: "p1" });
  });

  it("carries a new name", () => {
    expect(projectUpdatePayload("p1", { name: "Neu" })).toEqual({ projectID: "p1", name: "Neu" });
  });

  it("carries a color as icon override", () => {
    expect(projectUpdatePayload("p1", { color: "oklch(0.7 0.2 264)" })).toEqual({
      projectID: "p1",
      icon: { color: "oklch(0.7 0.2 264)" },
    });
  });

  it("clears the color with an empty icon", () => {
    expect(projectUpdatePayload("p1", { color: null })).toEqual({ projectID: "p1", icon: {} });
  });

  it("sends name and color together", () => {
    expect(projectUpdatePayload("p1", { name: "Neu", color: "#abc" })).toEqual({
      projectID: "p1",
      name: "Neu",
      icon: { color: "#abc" },
    });
  });
});

describe("patchedProject", () => {
  const base = project("p1", "/srv/app", "App");

  it("renames", () => {
    expect(patchedProject(base, { name: "Neu" })).toEqual({ ...base, name: "Neu" });
  });

  it("sets a color", () => {
    expect(projectIconColor(patchedProject(base, { color: "#abc" }))).toBe("#abc");
  });

  it("clears a color", () => {
    const colored = patchedProject(base, { color: "#abc" });
    expect(projectIconColor(patchedProject(colored, { color: null }))).toBeUndefined();
  });

  it("keeps name and icon when only the color is patched", () => {
    const patched = patchedProject(base, { color: "#abc" });
    expect(patched.name).toBe("App");
    expect(patched.canonical).toBe("/srv/app");
  });
});

describe("applyProjectUpdate", () => {
  it("replaces the entry with the same id", () => {
    const next = applyProjectUpdate([project("p1"), project("p2")], { id: "p2", name: "Neu" });
    expect(next.map((p) => p.name)).toEqual(["p1", "Neu"]);
  });

  it("appends an unknown id and never mutates the input", () => {
    const input = [project("p1")];
    const next = applyProjectUpdate(input, { id: "p9", name: "Neu" });
    expect(next).toHaveLength(2);
    expect(input).toHaveLength(1);
  });
});
