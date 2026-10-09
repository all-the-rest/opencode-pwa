import { describe, expect, it } from "vitest";
import type { ProjectInfo, ProjectTimeInfo } from "./opencode.ts";
import {
  applyProjectUpdate,
  buildProjectTree,
  dedupeProjectPaths,
  isPathLike,
  pathBasename,
  pathSegments,
  patchedProject,
  projectChainLabel,
  projectIconColor,
  projectRecency,
  projectTreeLabel,
  projectTreeNodeLabel,
  projectUpdatePayload,
  type ProjectTreeNode,
} from "./projectTree.ts";

/** One day of the owner's server, anchored so the recency tie-break is clear. */
const HOUR = 3_600_000;
const T_NOW = Date.UTC(2026, 9, 9, 9, 0, 0);
const at = (hoursAgo: number) => T_NOW - hoursAgo * HOUR;

/**
 * The owner's live `project.list` payload, verbatim: 23 rows on their server,
 * here every path the owner named (including `/projects/LuminaRust` twice,
 * which is what their server really returns). The long project-less chains
 * (`/home/dev/.cache/octest/live`) are the case the compression exists for.
 */
export const LIVE_PROJECTS: ProjectInfo[] = [
  { id: "p-users", name: "/Users/florianreisinger", canonical: "/Users/florianreisinger",
    time: { created: at(720), updated: at(720), active: at(700) } },
  { id: "p-de", name: "/de", canonical: "/de",
    time: { created: at(700), updated: at(500), active: at(500) } },
  { id: "p-home-dev", name: "/home/dev", canonical: "/home/dev",
    time: { created: at(900), updated: at(2), active: at(1) } },
  { id: "p-octest-live", name: "/home/dev/.cache/octest/live", canonical: "/home/dev/.cache/octest/live",
    time: { created: at(90), updated: at(90), active: at(90) } },
  { id: "p-octest-lab", name: "/home/dev/octest-lab/work", canonical: "/home/dev/octest-lab/work",
    time: { created: at(120), updated: at(120), active: at(30) } },
  { id: "p-root", name: "Root", canonical: "/projects",
    time: { created: at(1000), updated: at(1000), active: at(900) } },
  // The duplicate row: same directory, an older `time.active` than the twin
  // below — the stale one must lose.
  { id: "p-luminarust-old", name: "/projects/LuminaRust", canonical: "/projects/LuminaRust",
    time: { created: at(300), updated: at(300), active: at(300) } },
  { id: "p-luminarust-new", name: "/projects/LuminaRust", canonical: "/projects/LuminaRust",
    time: { created: at(300), updated: at(5), active: at(5) } },
  { id: "p-ebcont", name: "/projects/ebcont-seo-test", canonical: "/projects/ebcont-seo-test",
    time: { created: at(400), updated: at(50), active: at(50) } },
  { id: "p-ebcont-images", name: "/projects/ebcont-seo-test/images/dl", canonical: "/projects/ebcont-seo-test/images/dl",
    time: { created: at(20), updated: at(20), active: at(20) } },
  { id: "p-tmp", name: "/tmp/opencode", canonical: "/tmp/opencode",
    time: { created: at(600), updated: at(60), active: at(60) } },
  { id: "p-instr", name: "/tmp/opencode/instr-check", canonical: "/tmp/opencode/instr-check",
    time: { created: at(80), updated: at(80), active: at(80) } },
  { id: "p-event", name: "Event Test", canonical: "/tmp/opencode/proj-smoke",
    time: { created: at(70), updated: at(70), active: at(3) } },
];

function project(
  id: string,
  canonical?: string,
  name?: string,
  time?: ProjectTimeInfo,
): ProjectInfo {
  return {
    id,
    name: name ?? canonical ?? id,
    ...(canonical === undefined ? {} : { canonical }),
    ...(time === undefined ? {} : { time }),
  };
}

/** Every label of one (compressed) tree level, top-down. */
function labels(nodes: readonly ProjectTreeNode[]): string[] {
  return nodes.map((node) => projectChainLabel(node));
}

/** Unwrap a possibly-missing value so the assertions below stay one-liners. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("tree value missing");
  return value;
}

/** Look a node up by its (terminal) path — the tree stays sorted, not numbered. */
function atPath(nodes: readonly ProjectTreeNode[], path: string): ProjectTreeNode {
  const found = nodes.find((node) => node.path === path);
  if (found === undefined) throw new Error(`tree node ${path} missing`);
  return found;
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
    // `/home/dev` holds no project of its own, so the whole chain is one row.
    expect(labels(tree.roots)).toEqual(["home/dev/web", "srv/api"]);
    expect(tree.roots[0]?.path).toBe("/home/dev/web");
    expect(tree.roots[1]?.path).toBe("/srv/api");
    expect(tree.roots[1]?.projects.map((p) => p.id)).toEqual(["p1"]);
  });

  it("builds a tree when a project is the parent of another project", () => {
    const tree = buildProjectTree([
      project("p1", "/srv/app"),
      project("p2", "/srv/app/services/api"),
    ]);
    expect(tree.mode).toBe("tree");
    // `/srv` is project-less and has one child → compressed into the app row.
    const app = must(tree.roots[0]);
    expect(app.path).toBe("/srv/app");
    expect(projectChainLabel(app)).toBe("srv/app");
    expect(app.projects.map((p) => p.id)).toEqual(["p1"]);
    // `services` is project-less with one child → compressed into the api row.
    const api = must(app.children[0]);
    expect(api.path).toBe("/srv/app/services/api");
    expect(projectChainLabel(api)).toBe("services/api");
    expect(api.projects.map((p) => p.id)).toEqual(["p2"]);
    expect(api.children).toEqual([]);
  });

  it("keeps a directory that carries its own project as its own row", () => {
    const tree = buildProjectTree([project("p1", "/srv/app"), project("p2", "/srv/app/sub")]);
    expect(tree.mode).toBe("tree");
    const app = must(tree.roots[0]);
    // A project of its own: no compression, the label stays the plain folder.
    expect(projectChainLabel(app)).toBe("srv/app");
    expect(app.children.map((child) => child.path)).toEqual(["/srv/app/sub"]);
  });

  it("stops compressing at a real branch (2+ children)", () => {
    const tree = buildProjectTree([project("p1", "/a/b/c"), project("p2", "/a/b/d")]);
    const branch = must(tree.roots[0]);
    // `a` → `b` absorbs the project-less prefix; `b` branches, so it stays.
    expect(branch.path).toBe("/a/b");
    expect(projectChainLabel(branch)).toBe("a/b");
    expect(labels(branch.children)).toEqual(["c", "d"]);
  });

  it("collapses a duplicate canonical path to the newest entry", () => {
    const older = project("p-old", "/srv/app", "App", { created: 10, updated: 10, active: 10 });
    const newer = project("p-new", "/srv/app", "App", { created: 10, updated: 99, active: 5 });
    expect(dedupeProjectPaths([older, newer]).map((p) => p.id)).toEqual(["p-new"]);
    const tree = buildProjectTree([older, newer, project("p-other", "/srv/other")]);
    expect(must(tree.roots[0]?.children[0]).projects.map((p) => p.id)).toEqual(["p-new"]);
    expect(tree.pathed).toHaveLength(2);
  });

  it("normalizes a trailing slash before comparing directories", () => {
    const first = project("p1", "/srv/app/", "App", { created: 1, updated: 5, active: 5 });
    const second = project("p2", "/srv/app", "App", { created: 9, updated: 9, active: 9 });
    expect(dedupeProjectPaths([first, second]).map((p) => p.id)).toEqual(["p2"]);
  });

  it("keeps projects without a path through the dedupe", () => {
    const rows = [project("p1", undefined, "Alpha"), project("p2", undefined, "Beta")];
    expect(dedupeProjectPaths(rows)).toEqual(rows);
  });

  describe("the owner's live payload", () => {
    const tree = buildProjectTree(LIVE_PROJECTS);

    it("collapses to five roots and drops the duplicate LuminaRust row", () => {
      expect(tree.mode).toBe("tree");
      expect(labels(tree.roots)).toEqual([
        "de",
        "home/dev",
        "projects",
        "tmp/opencode",
        "Users/florianreisinger",
      ]);
      // 13 entries, one duplicate → 12 rows.
      expect(tree.pathed).toHaveLength(12);
      expect(tree.unpathed).toEqual([]);
      const projectsRoot = atPath(tree.roots, "/projects");
      expect(labels(projectsRoot.children)).toEqual(["ebcont-seo-test", "LuminaRust"]);
      // The fresher twin wins; the stale duplicate disappears.
      expect(must(atPath(projectsRoot.children, "/projects/LuminaRust")).projects.map((p) => p.id)).toEqual([
        "p-luminarust-new",
      ]);
    });

    it("compresses the project-less chain under /home/dev", () => {
      const home = atPath(tree.roots, "/home/dev");
      expect(home.path).toBe("/home/dev");
      // `.cache/octest` and `octest-lab` are project-less single children.
      expect(labels(home.children)).toEqual([".cache/octest/live", "octest-lab/work"]);
      const cache = must(home.children[0]);
      expect(cache.path).toBe("/home/dev/.cache/octest/live");
      expect(cache.chain).toEqual([".cache", "octest", "live"]);
      expect(cache.projects.map((p) => p.id)).toEqual(["p-octest-live"]);
      // Three folders, one row: no child left to nest, no chevron to give.
      expect(cache.children).toEqual([]);
    });

    it("compresses inside a branch and keeps the branch collapsible", () => {
      const seo = atPath(atPath(tree.roots, "/projects").children, "/projects/ebcont-seo-test");
      // `ebcont-seo-test` has a project of its own → one row; `images` compresses.
      expect(labels(seo.children)).toEqual(["images/dl"]);
      expect(must(seo.children[0]).path).toBe("/projects/ebcont-seo-test/images/dl");
      // A branch point (2+ children) keeps its chevron …
      const tmp = atPath(tree.roots, "/tmp/opencode");
      expect(labels(tmp.children)).toEqual(["instr-check", "proj-smoke"]);
      expect(must(tmp.children[0]).children).toEqual([]);
      expect(must(tmp.children[1]).children).toEqual([]);
    });

    it("keeps a renamed project as the row label", () => {
      // `/tmp/opencode/proj-smoke` is named "Event Test" — the custom name wins.
      const smth = atPath(
        atPath(tree.roots, "/tmp/opencode").children,
        "/tmp/opencode/proj-smoke",
      );
      expect(projectTreeLabel(must(smth.projects[0]))).toBe("Event Test");
      // The chain still spells the real folder the project lives in.
      expect(projectChainLabel(smth)).toBe("proj-smoke");
    });
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
    const app = tree.roots[0];
    if (app === undefined) throw new Error("node /srv/app missing");
    expect(projectTreeNodeLabel(app)).toBe("Mein App");
  });

  it("falls back to the compressed chain when nothing was renamed", () => {
    const tree = buildProjectTree([project("p1", "/home/dev/.cache/octest/live")]);
    const live = tree.roots[0];
    if (live === undefined) throw new Error("node /home/dev/.cache/octest/live missing");
    // Project-less folders with one child all fold into the project's row.
    expect(projectTreeNodeLabel(live)).toBe("home/dev/.cache/octest/live");
    expect(live.projects.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("projectRecency", () => {
  it("takes the newest of active/updated/created", () => {
    expect(
      projectRecency(project("p1", "/a", undefined, { created: 1, updated: 2, active: 3 })),
    ).toBe(3);
    expect(projectRecency(project("p1", "/a", undefined, { created: 1, updated: 99, active: 5 }))).toBe(99);
    expect(projectRecency(project("p1", "/a", undefined, { created: 1 }))).toBe(1);
  });

  it("reports zero for a project without timestamps", () => {
    expect(projectRecency(project("p1", "/a"))).toBe(0);
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
