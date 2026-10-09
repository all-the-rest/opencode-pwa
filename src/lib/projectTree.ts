import type { ProjectInfo } from "./opencode.ts";

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
 */

/** One directory of the project tree: holds projects and/or sub-directories. */
export interface ProjectTreeNode {
  /** Absolute directory path of this node (no trailing slash). */
  path: string;
  /** Last path segment — the fallback display label. */
  label: string;
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

/** Label of a tree node: a project renamed away from its path wins. */
export function projectTreeNodeLabel(node: ProjectTreeNode): string {
  const custom = node.projects.find((p) => p.name !== "" && !isPathLike(p.name));
  return custom === undefined ? node.label : custom.name;
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
      projects: draft.projects,
      children: finalize(draft.children),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** A project that is also the parent of another project — real nesting. */
function nodeHasNestedProject(node: ProjectTreeNode): boolean {
  if (node.projects.length > 0 && node.children.length > 0) return true;
  return node.children.some(nodeHasNestedProject);
}

/**
 * Group projects by the prefixes of their canonical paths. Projects without a
 * path-like `canonical` are reported as `unpathed` and always render flat.
 */
export function buildProjectTree(projects: ProjectInfo[]): ProjectTree {
  const pathed: ProjectInfo[] = [];
  const unpathed: ProjectInfo[] = [];
  const drafts = new Map<string, DraftNode>();
  for (const project of projects) {
    const canonical = project.canonical;
    const segments = canonical === undefined ? [] : pathSegments(canonical);
    if (canonical === undefined || !isPathLike(canonical) || segments.length === 0) {
      unpathed.push(project);
      continue;
    }
    pathed.push(project);
    insertProject(drafts, project, segments, canonical.startsWith("/"));
  }
  const roots = finalize(drafts);
  const nested = roots.some((node) => nodeHasNestedProject(node));
  return {
    mode: pathed.length > 0 && (roots.length > 1 || nested) ? "tree" : "flat",
    roots,
    pathed,
    unpathed,
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
