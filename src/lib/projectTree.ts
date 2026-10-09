import type { ProjectInfo, SessionRow } from "./opencode.ts";

/**
 * Project path tree — the evaluated answer to "können Projektnamen, wenn sie
 * Pfade sind, in einem Baum angezeigt werden?".
 *
 * Projects carry their working directory in `Project.canonical`. When several
 * projects live under a shared prefix (`/home/user/work/app` and
 * `/home/user/work/app/services/api`), a flat list repeats the shared prefix
 * on every row; a prefix tree shows it once. This module builds that tree
 * purely (no React, no fetch) and decides when the tree degenerates and the
 * flat list is the better rendering.
 *
 * Two refinements keep a real tree short (owner ask, driven by a live payload
 * that showed it): folders with no project of their own and exactly one child
 * are compressed into a single row (`.cache/octest/live`), and a directory the
 * server lists twice collapses to one entry.
 *
 * A third refinement is the "leere Projekte" filter: `filterProjectTree` /
 * `filterProjectsBySessions` hide the projects that have no session at all,
 * because a server lists every directory it ever saw (the owner: 10 of 23
 * projects without a single session). The signal is the session list the page
 * already loaded — see {@link sessionProjectKeys}.
 */

/** One directory of the project tree: holds projects and/or sub-directories. */
export interface ProjectTreeNode {
  /** Absolute directory path of this node (no trailing slash). */
  path: string;
  /** Last path segment — the fallback display label. */
  label: string;
  /**
   * Labels of the compressed chain this row stands for, top-down and ending in
   * {@link label}. Longer than one entry when project-less single-child folders
   * were folded into this row: `/home/dev/.cache/octest/live` renders as one
   * row labelled `.cache/octest/live` instead of three.
   */
  chain: string[];
  /** Projects whose canonical path is exactly this node. */
  projects: ProjectInfo[];
  /** Sub-directories that hold at least one project. */
  children: ProjectTreeNode[];
}

/**
 * `tree` when grouping by path prefix shows something a flat list cannot
 * (several roots, or a project that is also the parent of another project);
 * `flat` whenever the tree collapses to a single common root — then the flat
 * list is the honest rendering.
 */
export type ProjectTreeMode = "tree" | "flat";

export interface ProjectTree {
  mode: ProjectTreeMode;
  /** Top-level nodes (meaningful only in `tree` mode). */
  roots: ProjectTreeNode[];
  /** Projects with a path-like `canonical` that went into the tree. */
  pathed: ProjectInfo[];
  /** Projects without a usable path — never part of the tree. */
  unpathed: ProjectInfo[];
}

const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;

/**
 * True when a value reads like a filesystem path: absolute POSIX (`/srv/app`),
 * a home shortcut (`~/work`) or a Windows drive (`C:\work`), or any value with
 * a separator. A plain label ("Mein Projekt") is not path-like.
 */
export function isPathLike(value: string | undefined): boolean {
  if (value === undefined) return false;
  const trimmed = value.trim();
  if (trimmed === "") return false;
  if (trimmed.startsWith("/") || trimmed.startsWith("~")) return true;
  if (WINDOWS_DRIVE.test(trimmed)) return true;
  return trimmed.includes("/") || trimmed.includes("\\");
}

/** Path segments of an absolute path, separators normalized, empty parts dropped. */
export function pathSegments(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment !== "");
}

/** Last segment of a path — the natural display label of a directory. */
export function pathBasename(path: string): string {
  const segments = pathSegments(path);
  return segments[segments.length - 1] ?? path;
}

/**
 * Display name of a project: a custom (renamed) name wins everywhere, a
 * still-path-like name collapses to the last path segment. That is what makes
 * a project usable in lists, trees and headings at the same time.
 */
export function projectTreeLabel(project: ProjectInfo): string {
  const canonical = project.canonical;
  if (canonical !== undefined && isPathLike(canonical)) {
    const base = pathBasename(canonical);
    if (project.name !== "" && project.name !== canonical && !isPathLike(project.name)) {
      return project.name;
    }
    return base;
  }
  return project.name === "" ? project.id : project.name;
}

/** Icon color override of a project, when the server reported one. */
export function projectIconColor(project: ProjectInfo): string | undefined {
  return project.icon?.color;
}

/**
 * When one project path was listed twice, the newer entry survives. Read from
 * `Project.time` (`types.d.ts:508`): the newest of `active`/`updated`
 * (falling back to `created`), so a payload without timestamps loses to the
 * entry that has one.
 */
export function projectRecency(project: ProjectInfo): number {
  const time = project.time;
  if (time === undefined) return 0;
  const stamps = [time.active, time.updated, time.created].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return stamps.length === 0 ? 0 : Math.max(...stamps);
}

/** Normalized key of a canonical path (`/a/b` and `/a/b/` are one directory). */
function canonicalKey(canonical: string): string {
  return canonical.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Collapse duplicate canonical paths into one entry.
 *
 * A live server really can answer `project.list()` with the same directory
 * twice (the owner's `/projects/LuminaRust` comes back twice). Two rows for one
 * folder read like a bug, so the newer entry (`time.active`/`time.updated`)
 * wins and the stale one disappears. Projects without a path-like canonical
 * have no directory to duplicate — they always survive.
 */
export function dedupeProjectPaths(projects: ProjectInfo[]): ProjectInfo[] {
  const kept: ProjectInfo[] = [];
  const byPath = new Map<string, ProjectInfo>();
  for (const project of projects) {
    const canonical = project.canonical;
    if (canonical === undefined || !isPathLike(canonical)) {
      kept.push(project);
      continue;
    }
    const key = canonicalKey(canonical);
    const known = byPath.get(key);
    if (known === undefined) {
      byPath.set(key, project);
      kept.push(project);
      continue;
    }
    if (projectRecency(project) > projectRecency(known)) {
      kept[kept.indexOf(known)] = project;
      byPath.set(key, project);
    }
  }
  return kept;
}

/** Label of a tree node: a project renamed away from its path wins. */
export function projectTreeNodeLabel(node: ProjectTreeNode): string {
  const custom = node.projects.find((p) => p.name !== "" && !isPathLike(p.name));
  return custom === undefined ? projectChainLabel(node) : custom.name;
}

/**
 * Displayed label of a node: the compressed chain joined with "/", the way a
 * file manager shows a path with no branching in it. A single-element chain is
 * just the node's own label.
 */
export function projectChainLabel(node: ProjectTreeNode): string {
  return node.chain.length === 0 ? node.label : node.chain.join("/");
}

interface DraftNode {
  path: string;
  label: string;
  projects: ProjectInfo[];
  children: Map<string, DraftNode>;
}

function insertProject(level: Map<string, DraftNode>, project: ProjectInfo, segments: string[], absolute: boolean): void {
  let current = level;
  let node: DraftNode | null = null;
  for (const segment of segments) {
    const existing = current.get(segment);
    if (existing !== undefined) {
      node = existing;
    } else {
      const prefix = node === null ? (absolute ? "/" : "") : `${node.path}/`;
      const created: DraftNode = {
        path: `${prefix}${segment}`,
        label: segment,
        projects: [],
        children: new Map(),
      };
      current.set(segment, created);
      node = created;
    }
    current = node.children;
  }
  if (node !== null) node.projects.push(project);
}

function finalize(level: Map<string, DraftNode>): ProjectTreeNode[] {
  return [...level.values()]
    .map((draft) => ({
      path: draft.path,
      label: draft.label,
      chain: [draft.label],
      projects: draft.projects,
      children: finalize(draft.children),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Fold project-less single-child folders into their one child.
 *
 * A folder that holds no project of its own and has exactly one child carries
 * no information: `/home/dev/.cache/octest/live` is three rows for one
 * project. Such a node is absorbed by its child and the two labels join into
 * one row (`.cache/octest/live`). The walk stops where the folder means
 * something — a project of its own, or a real branch (2+ children) — so those
 * stay collapsible tree nodes.
 */
function compressChain(node: ProjectTreeNode): ProjectTreeNode {
  let current: ProjectTreeNode = {
    ...node,
    children: node.children.map(compressChain),
  };
  const absorbed: string[] = [];
  // A leaf directory always holds a project (the tree is built from project
  // paths), so the loop can only end on a project node or a branch.
  while (current.projects.length === 0 && current.children.length === 1) {
    const child = current.children[0];
    if (child === undefined) break;
    absorbed.push(current.label);
    current = child;
  }
  return { ...current, chain: [...absorbed, ...current.chain] };
}

/** A project that is also the parent of another project — real nesting. */
function nodeHasNestedProject(node: ProjectTreeNode): boolean {
  if (node.projects.length > 0 && node.children.length > 0) return true;
  return node.children.some(nodeHasNestedProject);
}

/**
 * Group projects by the prefixes of their canonical paths. Projects without a
 * path-like `canonical` are reported as `unpathed` and always render flat;
 * duplicate canonical paths collapse into one entry (newest wins).
 */
export function buildProjectTree(projects: ProjectInfo[]): ProjectTree {
  const pathed: ProjectInfo[] = [];
  const unpathed: ProjectInfo[] = [];
  const drafts = new Map<string, DraftNode>();
  for (const project of dedupeProjectPaths(projects)) {
    const canonical = project.canonical;
    const segments = canonical === undefined ? [] : pathSegments(canonical);
    if (canonical === undefined || !isPathLike(canonical) || segments.length === 0) {
      unpathed.push(project);
      continue;
    }
    pathed.push(project);
    insertProject(drafts, project, segments, canonical.startsWith("/"));
  }
  const roots = finalize(drafts).map(compressChain);
  const nested = roots.some((node) => nodeHasNestedProject(node));
  return {
    mode: pathed.length > 0 && (roots.length > 1 || nested) ? "tree" : "flat",
    roots,
    pathed,
    unpathed,
  };
}

/**
 * Ids of the projects the loaded session rows point at.
 *
 * `SessionRow.projectKey` is what the server reported for a session
 * (`projectID`); a row without a key contributes nothing (those sessions are
 * grouped under "Ohne Projekt" in the list). Reading this costs no request —
 * the server page already holds the rows of its sessions card.
 */
export function sessionProjectKeys(rows: readonly SessionRow[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.projectKey !== null && row.projectKey !== "") keys.add(row.projectKey);
  }
  return keys;
}

/**
 * Projects with zero sessions — the owner's "Bastarde". A server lists every
 * directory it ever saw as a project, so a real payload carries plenty of
 * folders that never hosted a session (10 of the owner's 23 projects).
 */
export function projectsWithoutSessions(
  projects: readonly ProjectInfo[],
  sessionProjectIDs: ReadonlySet<string>,
): ProjectInfo[] {
  return projects.filter((project) => !sessionProjectIDs.has(project.id));
}

/**
 * Which projects the "leere Projekte" filter keeps.
 *
 * `sessionProjectIDs` comes from the rows the page already loaded (see
 * {@link sessionProjectKeys}) — deliberately not from a second request.
 */
export interface ProjectSessionFilter {
  /** Ids of the projects that have at least one session. */
  sessionProjectIDs: ReadonlySet<string>;
  /** True while zero-session projects stay hidden (the default). */
  hideEmptyProjects: boolean;
}

/**
 * The visible slice of a project list: everything while the filter is off,
 * only the projects with a session while it is on.
 */
export function filterProjectsBySessions(
  projects: readonly ProjectInfo[],
  filter: ProjectSessionFilter,
): ProjectInfo[] {
  if (!filter.hideEmptyProjects) return [...projects];
  return projects.filter((project) => filter.sessionProjectIDs.has(project.id));
}

/**
 * Drop a subtree that shows nothing: no project of its own and no project in
 * any child either. An empty leaf like `/de` disappears completely, while a
 * folder whose child has sessions survives (see {@link filterProjectTree}).
 */
function pruneNodes(
  nodes: readonly ProjectTreeNode[],
  sessionProjectIDs: ReadonlySet<string>,
): ProjectTreeNode[] {
  const kept: ProjectTreeNode[] = [];
  for (const node of nodes) {
    const projects = node.projects.filter((project) => sessionProjectIDs.has(project.id));
    const children = pruneNodes(node.children, sessionProjectIDs);
    if (projects.length === 0 && children.length === 0) continue;
    kept.push({ ...node, projects, children });
  }
  return kept;
}

/**
 * Hide zero-session projects in a built tree (the owner's ask). Two rules keep
 * the tree readable while the filter is on:
 *
 *  - a project without a session loses its row (no link, no rename button),
 *    but the FOLDER it sits in survives as a structural node as long as a
 *    project below it has sessions. The owner's `/projects` ("Root") is empty
 *    while `/projects/LuminaRust` is not — dropping the whole branch would
 *    hide the project that matters;
 *  - a node with no project of its own and none in its subtree is pruned
 *    (`/de`, `/tmp/opencode/instr-check`): it carries nothing to show.
 *
 * The `mode` is deliberately NOT recomputed: the shape the user sees must not
 * flip between tree and flat list when a toggle is flipped.
 */
export function filterProjectTree(tree: ProjectTree, filter: ProjectSessionFilter): ProjectTree {
  if (!filter.hideEmptyProjects) return tree;
  return {
    mode: tree.mode,
    roots: pruneNodes(tree.roots, filter.sessionProjectIDs),
    pathed: filterProjectsBySessions(tree.pathed, filter),
    unpathed: filterProjectsBySessions(tree.unpathed, filter),
  };
}

/** Patch one renamed (or re-coloured) project into a list, immutably. */
export function applyProjectUpdate(projects: ProjectInfo[], updated: ProjectInfo): ProjectInfo[] {
  const index = projects.findIndex((p) => p.id === updated.id);
  if (index === -1) return [...projects, updated];
  const next = [...projects];
  next[index] = updated;
  return next;
}

/** What a rename dialog collects: a new name and an optional color choice. */
export interface ProjectRenamePatch {
  name?: string;
  /** A color from the palette, or null to clear a server color. */
  color?: string | null;
}

/** Body of `PATCH /api/project/{projectID}` (`ProjectUpdateInput`, verified). */
export interface ProjectUpdatePayload {
  projectID: string;
  name?: string;
  icon?: { color?: string };
}

/**
 * Map a rename patch onto the verified `ProjectUpdateInput`: the name only
 * when it changed, `icon` only when a color was chosen (`{}` clears it).
 * Keys that stay out of the payload are never sent — the server keeps them.
 */
export function projectUpdatePayload(projectID: string, patch: ProjectRenamePatch): ProjectUpdatePayload {
  const payload: ProjectUpdatePayload = { projectID };
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.color !== undefined) {
    payload.icon = patch.color === null ? {} : { color: patch.color };
  }
  return payload;
}

/** Apply a rename patch to one project (optimistic rendering + rollback). */
export function patchedProject(project: ProjectInfo, patch: ProjectRenamePatch): ProjectInfo {
  const name = patch.name === undefined ? project.name : patch.name;
  let icon = project.icon;
  if (patch.color !== undefined) {
    const base = { ...project.icon };
    if (patch.color === null) delete base.color;
    else base.color = patch.color;
    icon = base;
  }
  return { ...project, name, ...(icon === undefined ? {} : { icon }) };
}
