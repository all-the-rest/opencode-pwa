/**
 * Data-driven tool registry: tool name → icon + German label + subtitle.
 *
 * Mirrors `getToolInfo` of the original web UI
 * (`packages/session-ui/src/components/message-part.tsx`): the card shows an
 * icon, a label and one verbatim subtitle (file path, pattern, command,
 * description …). Labels stay *keys* here — the component maps them to Lingui
 * messages, so no UI string lives in this module.
 *
 * Everything is derived from `state.input` (arguments) and
 * `state.metadata`; unknown tools keep rendering through the default entry
 * (their name as label, a best-effort subtitle, no invented chips).
 */

import type { AppIconName } from "../components/Icon.tsx";

export type ToolLabelKey =
  | "read"
  | "list"
  | "glob"
  | "grep"
  | "webfetch"
  | "websearch"
  | "task"
  | "shell"
  | "edit"
  | "write"
  | "patch"
  | "todos"
  | "todosRead"
  | "question"
  | "skill";

export interface ToolInfo {
  icon: AppIconName;
  /** Label key; `null` means "show the raw tool name" (unknown tool). */
  labelKey: ToolLabelKey | null;
  /** Verbatim server detail (file path, pattern, command …) or null. */
  subtitle: string | null;
  /** Search provider from `state.metadata` (`websearch` only). */
  provider: string | null;
  /** `key=value` argument chips, already truncated by `maxArgChars`. */
  args: string[];
  /** Line changes of edit-type tools (drives the +/- badges). */
  changes: { additions: number; deletions: number } | null;
  /** Number of files a patch-style call touched, when the payload says so. */
  fileCount: number | null;
}

export interface ToolDefinition {
  icon: AppIconName;
  labelKey: ToolLabelKey;
  /** First non-empty string among these input keys becomes the subtitle. */
  subtitleKeys: readonly string[];
  /** Input keys rendered as `key=value` chips (original: read/grep/glob). */
  argKeys: readonly string[];
  /** Where the +/- change badges come from. */
  changes?: "edit" | "write";
  /** Array input key holding touched files (patch-style tools). */
  fileListKey?: string;
}

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  read: {
    icon: "glasses",
    labelKey: "read",
    subtitleKeys: ["filePath", "path", "file", "filename"],
    argKeys: ["offset", "limit"],
  },
  list: {
    icon: "list",
    labelKey: "list",
    subtitleKeys: ["path", "directory", "filePath"],
    argKeys: [],
  },
  glob: {
    icon: "find-file",
    labelKey: "glob",
    subtitleKeys: ["pattern", "path"],
    argKeys: ["pattern", "include"],
  },
  grep: {
    icon: "find-file",
    labelKey: "grep",
    subtitleKeys: ["pattern", "path"],
    argKeys: ["pattern", "include"],
  },
  webfetch: {
    icon: "web",
    labelKey: "webfetch",
    subtitleKeys: ["url"],
    argKeys: [],
  },
  websearch: {
    icon: "web",
    labelKey: "websearch",
    subtitleKeys: ["query", "q"],
    argKeys: [],
  },
  task: {
    icon: "task",
    labelKey: "task",
    subtitleKeys: ["description", "prompt"],
    argKeys: [],
  },
  bash: {
    icon: "shell",
    labelKey: "shell",
    subtitleKeys: ["command", "cmd"],
    argKeys: [],
  },
  shell: {
    icon: "shell",
    labelKey: "shell",
    subtitleKeys: ["command", "cmd"],
    argKeys: [],
  },
  edit: {
    icon: "edit",
    labelKey: "edit",
    subtitleKeys: ["filePath", "path", "file"],
    argKeys: [],
    changes: "edit",
  },
  write: {
    icon: "write",
    labelKey: "write",
    subtitleKeys: ["filePath", "path", "file"],
    argKeys: [],
    changes: "write",
  },
  patch: {
    icon: "patch",
    labelKey: "patch",
    subtitleKeys: ["filePath", "path"],
    argKeys: [],
    fileListKey: "files",
  },
  apply_patch: {
    icon: "patch",
    labelKey: "patch",
    subtitleKeys: ["filePath", "path"],
    argKeys: [],
    fileListKey: "files",
  },
  todowrite: {
    icon: "todos",
    labelKey: "todos",
    subtitleKeys: [],
    argKeys: [],
  },
  todoread: {
    icon: "todos",
    labelKey: "todosRead",
    subtitleKeys: [],
    argKeys: [],
  },
  question: {
    icon: "question",
    labelKey: "question",
    subtitleKeys: [],
    argKeys: [],
  },
  skill: {
    icon: "skill",
    labelKey: "skill",
    subtitleKeys: ["name", "skill"],
    argKeys: [],
  },
};

/** `apply_patch` is the server-side spelling of `patch` (original parity). */
export const TOOL_ALIASES: Record<string, string> = { apply_patch: "patch" };

/** Consecutive read/glob/grep/list calls collapse into one summary row. */
export const CONTEXT_GROUP_TOOLS: ReadonlySet<string> = new Set([
  "read",
  "list",
  "glob",
  "grep",
  "todoread",
]);

/** Rendered nowhere in the stream (the original hides its todo writer). */
export const HIDDEN_TOOLS: ReadonlySet<string> = new Set(["todowrite"]);

/** Longest value kept per argument chip; longer values are cut. */
export const MAX_ARG_CHARS = 32;

const SUBTITLE_FALLBACK_KEYS: readonly string[] = [
  "filePath",
  "path",
  "pattern",
  "command",
  "description",
  "query",
  "url",
];

/** Keys whose values are ids/pointers, not human context. */
const NOISY_KEYS: ReadonlySet<string> = new Set([
  "sessionID",
  "sessionId",
  "messageID",
  "messageId",
  "callID",
  "callId",
  "id",
]);

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
/** Resolve the canonical tool name (`apply_patch` → `patch`). */
export function canonicalToolName(name: string): string {
  return TOOL_ALIASES[name] ?? name;
}

/** True for tools that fold into the collapsed context summary row. */
export function isContextGroupTool(name: string): boolean {
  return CONTEXT_GROUP_TOOLS.has(canonicalToolName(name));
}

/** True for tools that never render in the stream. */
export function isHiddenTool(name: string): boolean {
  return HIDDEN_TOOLS.has(canonicalToolName(name));
}

/** True for edit-type tools that carry +/- change badges. */
export function isEditTool(name: string): boolean {
  const definition = TOOL_DEFINITIONS[canonicalToolName(name)];
  return definition?.changes !== undefined;
}

function countLines(value: string): number {
  if (value === "") return 0;
  const lines = value.split("\n").length;
  return lines;
}

function changesFromInput(definition: ToolDefinition, input: Record<string, unknown>) {
  if (definition.changes === "edit") {
    const oldText = readString(input["oldString"]) ?? "";
    const newText = readString(input["newString"]) ?? "";
    if (oldText === "" && newText === "") return null;
    return { additions: countLines(newText), deletions: countLines(oldText) };
  }
  if (definition.changes === "write") {
    const content =
      readString(input["content"]) ?? readString(input["fileText"]) ?? "";
    if (content === "") return null;
    return { additions: countLines(content), deletions: 0 };
  }
  return null;
}

function fileCountFromInput(definition: ToolDefinition, input: Record<string, unknown>): number | null {
  const key = definition.fileListKey;
  if (key === undefined) return null;
  const value: unknown = input[key];
  return Array.isArray(value) ? value.length : null;
}

function truncate(value: string, limit: number = MAX_ARG_CHARS): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/** Primitive input value formatted for a chip (`key=value`). */
function chipValue(value: unknown): string | null {
  if (typeof value === "string") return value === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function argChipsFromKeys(keys: readonly string[], input: Record<string, unknown>): string[] {
  const chips: string[] = [];
  for (const key of keys) {
    const value = chipValue(input[key]);
    if (value === null) continue;
    chips.push(`${key}=${truncate(value)}`);
  }
  return chips;
}

/**
 * Chips for tools without a registry entry: every own input key becomes a
 * `key=value` chip (max three), so unknown tools stay inspectable without
 * inventing labels. Ids/pointers are skipped as noise.
 */
function argChipsFromInput(input: Record<string, unknown>): string[] {
  const chips: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (NOISY_KEYS.has(key)) continue;
    const formatted = chipValue(value);
    if (formatted === null) continue;
    chips.push(`${key}=${truncate(formatted)}`);
    if (chips.length === 3) break;
  }
  return chips;
}

function subtitleFromKeys(keys: readonly string[], input: Record<string, unknown>): string | null {
  for (const key of keys) {
    const value = readString(input[key]);
    if (value !== null) return value;
  }
  return null;
}

function providerFromMetadata(metadata: Record<string, unknown> | null): string | null {
  if (metadata === null) return null;
  return readString(metadata["provider"]);
}

/**
 * Icon, label key, subtitle, argument chips and change badges of one tool
 * call. `metadata` is optional — streaming states send none.
 */
export function getToolInfo(
  name: string,
  input: Record<string, unknown> = {},
  metadata: Record<string, unknown> | null = null,
): ToolInfo {
  const canonical = canonicalToolName(name);
  const definition = TOOL_DEFINITIONS[canonical];
  const args = argChipsFromKeys(definition?.argKeys ?? [], input);
  if (definition === undefined) {
    return {
      icon: "tool",
      labelKey: null,
      subtitle: subtitleFromKeys(SUBTITLE_FALLBACK_KEYS, input),
      provider: providerFromMetadata(metadata),
      args: argChipsFromInput(input),
      changes: null,
      fileCount: null,
    };
  }
  return {
    icon: definition.icon,
    labelKey: definition.labelKey,
    subtitle: subtitleFromKeys(definition.subtitleKeys, input),
    provider: canonical === "websearch" ? providerFromMetadata(metadata) : null,
    args,
    changes: changesFromInput(definition, input),
    fileCount: fileCountFromInput(definition, input),
  };
}
