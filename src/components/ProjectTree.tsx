import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon.tsx";
import ProjectRenameForm from "./ProjectRenameForm.tsx";
import {
  projectIconColor,
  projectTreeLabel,
  projectTreeNodeLabel,
  type ProjectTree,
  type ProjectTreeNode,
} from "../lib/projectTree.ts";
import type { ProjectInfo } from "../lib/opencode.ts";

/** Indent per tree level; kept small so nothing overflows at 360px. */
const INDENT_STEP_PX = 14;

export interface ProjectTreeProps {
  serverID: string;
  tree: ProjectTree;
  /** Project whose row currently shows the rename form. */
  renamingID: string | null;
  onStartRename: (project: ProjectInfo) => void;
  onCancelRename: () => void;
  /** Persists the rename (optimistic update lives in the caller). */
  onRename: (project: ProjectInfo, patch: { name: string; color?: string | null }) => void;
  /** True while the caller's PATCH is in flight. */
  renameBusy?: boolean;
  /** Prefix for the generated testids; defaults to `project`. */
  testId?: string;
}

interface RowProps {
  project: ProjectInfo;
  serverID: string;
  depth: number;
  renamingID: string | null;
  onStartRename: (project: ProjectInfo) => void;
  onCancelRename: () => void;
  onRename: ProjectTreeProps["onRename"];
  renameBusy: boolean;
  testId: string;
}

function ProjectRow({
  project,
  serverID,
  depth,
  renamingID,
  onStartRename,
  onCancelRename,
  onRename,
  renameBusy,
  testId,
}: RowProps) {
  if (renamingID === project.id) {
    return (
      <li>
        <div style={{ paddingLeft: INDENT_STEP_PX * depth }}>
          <ProjectRenameForm
            key={project.id}
            initialName={project.name}
            initialColor={projectIconColor(project)}
            busy={renameBusy}
            testId={`${testId}-rename-${project.id}`}
            onSubmit={(patch) => onRename(project, patch)}
            onCancel={onCancelRename}
          />
        </div>
      </li>
    );
  }
  const label = projectTreeLabel(project);
  return (
    <li data-testid={`${testId}-row-${project.id}`}>
      <div
        className="flex items-center gap-1 rounded hover:bg-base-300/40"
        style={{ paddingLeft: INDENT_STEP_PX * depth }}
      >
        <ProjectDot color={projectIconColor(project)} testId={`${testId}-dot-${project.id}`} />
        <Link
          className="min-w-0 flex-1 truncate"
          to={`/servers/${serverID}/projects/${project.id}`}
          title={project.canonical ?? project.id}
        >
          {label}
        </Link>
        <button
          type="button"
          className="btn btn-xs btn-ghost shrink-0"
          aria-label={t`Projekt ${label} umbenennen`}
          title={t`Umbenennen`}
          data-testid={`${testId}-rename-${project.id}`}
          onClick={() => onStartRename(project)}
        >
          <Icon name="edit" />
        </button>
      </div>
    </li>
  );
}

/** Folder color dot (`Project.icon.color`), invisible when the server sent none. */
export function ProjectDot({ color, testId }: { color?: string; testId?: string }) {
  if (color === undefined) return null;
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden="true"
      data-testid={testId}
    />
  );
}

interface NodeProps {
  node: ProjectTreeNode;
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggle: (path: string) => void;
  shared: Omit<ProjectTreeProps, "tree"> & { testId: string };
}

function TreeNode({ node, depth, collapsed, onToggle, shared }: NodeProps) {
  const expanded = !collapsed.has(node.path);
  const hasChildren = node.children.length > 0;
  const label = projectTreeNodeLabel(node);
  // The first project sitting exactly on this node owns the row link.
  const own = node.projects[0];
  const renaming = own !== undefined && shared.renamingID === own.id;
  return (
    <li>
      <div
        className="flex items-center gap-1 rounded hover:bg-base-300/40"
        style={{ paddingLeft: INDENT_STEP_PX * depth }}
        data-testid={`${shared.testId}-node-${node.path}`}
      >
        {hasChildren ? (
          <button
            type="button"
            className="btn btn-xs btn-ghost shrink-0 px-1"
            aria-expanded={expanded}
            aria-label={expanded ? t`${label} einklappen` : t`${label} aufklappen`}
            data-testid={`${shared.testId}-toggle-${node.path}`}
            onClick={() => onToggle(node.path)}
          >
            <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          </button>
        ) : (
          <span className="inline-block w-4 shrink-0" aria-hidden="true" />
        )}
        <Icon name="project" />
        {own !== undefined && (
          <ProjectDot color={projectIconColor(own)} testId={`${shared.testId}-dot-${own.id}`} />
        )}
        <span className="min-w-0 flex-1 truncate" title={node.path}>
          {renaming && own !== undefined ? (
            <ProjectRenameForm
              key={own.id}
              initialName={own.name}
              initialColor={projectIconColor(own)}
              busy={shared.renameBusy ?? false}
              testId={`${shared.testId}-rename-${own.id}`}
              onSubmit={(patch) => shared.onRename(own, patch)}
              onCancel={shared.onCancelRename}
            />
          ) : own === undefined ? (
            <span className="opacity-80">{label}</span>
          ) : (
            <Link
              className="truncate"
              to={`/servers/${shared.serverID}/projects/${own.id}`}
              title={own.canonical ?? own.id}
              data-testid={`${shared.testId}-row-${own.id}`}
            >
              {label}
            </Link>
          )}
        </span>
        {!renaming && own !== undefined && (
          <button
            type="button"
            className="btn btn-xs btn-ghost shrink-0"
            aria-label={t`Projekt ${label} umbenennen`}
            title={t`Umbenennen`}
            data-testid={`${shared.testId}-rename-${own.id}`}
            onClick={() => shared.onStartRename(own)}
          >
            <Icon name="edit" />
          </button>
        )}
      </div>
      {expanded && (hasChildren || node.projects.length > 1) && (
        <ul className="grid">
          {node.projects.slice(1).map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              serverID={shared.serverID}
              depth={depth + 1}
              renamingID={shared.renamingID}
              onStartRename={shared.onStartRename}
              onCancelRename={shared.onCancelRename}
              onRename={shared.onRename}
              renameBusy={shared.renameBusy ?? false}
              testId={shared.testId}
            />
          ))}
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              shared={shared}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Expandable project tree for path-like project names (the evaluated answer
 * to "können Projektnamen, wenn sie Pfade sind, in einem Baum angezeigt
 * werden?"). Shared prefixes render once, branches nest, every project keeps
 * the `project-row-<id>` testid of the flat list so existing tests and
 * muscle memory stay valid.
 *
 * Projects without a path-like `canonical` always render as plain rows —
 * a tree cannot invent a directory for them. Usable at 360px: rows truncate,
 * never scroll sideways.
 */
export default function ProjectTree(props: ProjectTreeProps) {
  const { tree } = props;
  const testId = props.testId ?? "project";
  const shared = { ...props, testId };
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>());

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-1" data-testid={`${testId}-tree`}>
      <ul className="grid">
          {tree.unpathed.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              serverID={props.serverID}
              depth={0}
              renamingID={props.renamingID}
              onStartRename={props.onStartRename}
              onCancelRename={props.onCancelRename}
              onRename={props.onRename}
              renameBusy={props.renameBusy ?? false}
              testId={testId}
            />
          ))}
        </ul>
      <ul className="grid">
        {tree.roots.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            collapsed={collapsed}
            onToggle={toggle}
            shared={shared}
          />
        ))}
      </ul>
    </div>
  );
}

/** Explanation line for tree mode (used by the server page). */
export function ProjectTreeHint() {
  return (
    <p className="text-xs opacity-70">
      <Trans>Pfade als Baum gruppiert – gemeinsame Ordner nur einmal.</Trans>
    </p>
  );
}
