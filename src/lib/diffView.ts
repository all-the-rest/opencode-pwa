/**
 * Unified-diff model for the session "Änderungen" surface (wave 4).
 *
 * The server reports one `{ file, patch, additions, deletions, status }` row
 * per changed file (`GET /api/session/{id}/diff`, see `extractSessionDiff` in
 * `opencode.ts`). Rendering that patch in a `<pre>` shows the raw git text, so
 * this module turns it into line rows (line numbers + +/- gutter) the way the
 * original web UI does.
 *
 * Everything here is pure and dependency-free (the parser is hand-rolled, no
 * `diff`/`@pierre/diffs` runtime dependency) so every degenerate patch — a
 * rename, a mode change, a binary file, a missing trailing newline, an empty
 * hunk list or pure garbage — degrades into a readable row instead of a crash
 * or a JSON dump.
 */

/** One renderable line of a hunk. */
export type DiffLineKind = "context" | "add" | "delete";

export interface DiffLine {
  kind: DiffLineKind;
  /** Line content without the leading marker (`+`, `-`, ` `). */
  text: string;
  /** Line number in the old file, null for additions. */
  oldNumber: number | null;
  /** Line number in the new file, null for deletions. */
  newNumber: number | null;
  /** The file ends without a newline on this line (`\ No newline at end of file`). */
  noNewline: boolean;
}

export interface DiffHunk {
  /** Raw `@@ -a,b +c,d @@ trailing` header of the hunk. */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/** Structured facts a patch header can carry that are not line rows. */
export type DiffNoteKind = "rename" | "copy" | "mode" | "binary" | "unreadable";

export interface DiffNote {
  kind: DiffNoteKind;
  /** Raw detail the component renders verbatim (path pair or header text). */
  detail: string;
}

/** Row shape the diff endpoint reports (structurally `SessionDiffRow`). */
export interface DiffSourceRow {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status: "added" | "deleted" | "modified";
}

export interface ParsedFileDiff {
  /** Path as reported by the server (the patch header never overrides it). */
  file: string;
  /** Directory part of the path, including the trailing slash ("" at root). */
  directory: string;
  /** File name part of the path. */
  filename: string;
  additions: number;
  deletions: number;
  status: "added" | "deleted" | "modified";
  hunks: DiffHunk[];
  notes: DiffNote[];
  /** No renderable row at all (binary file, header-only patch, unreadable). */
  empty: boolean;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/** Decode a git-quoted path (`"a/tab\there"`, octal escapes included). */
function unquoteGitPath(input: string): string {
  if (!input.startsWith('"') || !input.endsWith('"') || input.length < 2) return input;
  const body = input.slice(1, -1);
  const bytes: number[] = [];
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === undefined) continue;
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0));
      continue;
    }
    const next = body[index + 1];
    if (next === undefined) {
      bytes.push(0x5c);
      continue;
    }
    if (next >= "0" && next <= "7") {
      const match = /^[0-7]{1,3}/.exec(body.slice(index + 1, index + 4));
      if (match !== null) {
        bytes.push(parseInt(match[0], 8));
        index += match[0].length;
        continue;
      }
    }
    const escaped =
      next === "n"
        ? "\n"
        : next === "r"
          ? "\r"
          : next === "t"
            ? "\t"
            : next === "b"
              ? "\b"
              : next === "f"
                ? "\f"
                : next === "v"
                  ? "\v"
                  : next === '"' || next === "\\"
                    ? next
                    : undefined;
    if (escaped !== undefined) {
      for (const byte of escaped) bytes.push(byte.charCodeAt(0));
    } else {
      bytes.push(next.charCodeAt(0));
    }
    index++;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** A leading `"quoted token"` of a `diff --git` header. */
function readQuotedToken(value: string): { raw: string; end: number } | null {
  if (!value.startsWith('"')) return null;
  for (let index = 1; index < value.length; index++) {
    const char = value[index];
    if (char === "\\") {
      index++;
      continue;
    }
    if (char === '"') return { raw: value.slice(0, index + 1), end: index + 1 };
  }
  return null;
}

/** Path of a `---`/`+++` token, or null for `/dev/null` and empty tokens. */
function stripDiffPrefix(token: string): string | null {
  const value = unquoteGitPath(token.split("\t")[0] ?? "");
  if (value === "" || value === "/dev/null") return null;
  if (value.startsWith("a/") || value.startsWith("b/")) return value.slice(2);
  return value;
}

/** `a/old`/`b/new` paths of a `diff --git` header. */
function pathsFromGitHeader(rest: string): { from: string | null; to: string | null } {
  const quoted = readQuotedToken(rest);
  if (quoted !== null) {
    const remainder = rest.slice(quoted.end).trimStart();
    const second = readQuotedToken(remainder);
    const to = second === null ? remainder : second.raw;
    return { from: stripDiffPrefix(`a/${unquoteGitPath(quoted.raw)}`), to: stripDiffPrefix(`b/${to}`) };
  }
  const separator = rest.lastIndexOf(" b/");
  if (separator === -1) return { from: null, to: null };
  return { from: stripDiffPrefix(rest.slice(0, separator)), to: stripDiffPrefix(rest.slice(separator + 1)) };
}

/** Split a path into its directory (with trailing slash) and file name. */
export function splitDiffPath(path: string): { directory: string; filename: string } {
  const index = path.lastIndexOf("/");
  if (index < 0) return { directory: "", filename: path };
  return { directory: path.slice(0, index + 1), filename: path.slice(index + 1) };
}

/** Parsed additions/deletions of a hunk list (used when the row carries no counts). */
export function countPatchChanges(hunks: readonly DiffHunk[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "add") additions++;
      if (line.kind === "delete") deletions++;
    }
  }
  return { additions, deletions };
}

/**
 * Parse one diff row into hunks + header notes. Never throws: unknown lines
 * become `unreadable` notes, a missing hunk body yields `empty`.
 */
export function parseFileDiff(row: DiffSourceRow): ParsedFileDiff {
  const patch = typeof row.patch === "string" ? row.patch.replace(/\r\n/g, "\n") : "";
  const hunks: DiffHunk[] = [];
  const notes: DiffNote[] = [];
  let current: { hunk: DiffHunk; old: number; new: number } | null = null;
  let patchFile: string | null = null;
  let oldMode: string | null = null;
  let newMode: string | null = null;
  let modeMark: string | null = null;
  let renameFrom: string | null = null;
  let renameTo: string | null = null;
  let copyFrom: string | null = null;
  let copyTo: string | null = null;
  let binary = false;
  const unknownLines: string[] = [];

  const closeHunk = (): void => {
    if (current !== null) {
      hunks.push(current.hunk);
      current = null;
    }
  };

  const lines = patch.split("\n");
  for (const line of lines) {
    if (current !== null) {
      if (line.startsWith("\\")) {
        const last = current.hunk.lines[current.hunk.lines.length - 1];
        if (last !== undefined) last.noNewline = true;
        continue;
      }
      if (line.startsWith("+")) {
        current.hunk.lines.push({
          kind: "add",
          text: line.slice(1),
          oldNumber: null,
          newNumber: current.new,
          noNewline: false,
        });
        current.new++;
        continue;
      }
      if (line.startsWith("-")) {
        current.hunk.lines.push({
          kind: "delete",
          text: line.slice(1),
          oldNumber: current.old,
          newNumber: null,
          noNewline: false,
        });
        current.old++;
        continue;
      }
      // Git emits a lone empty line for an empty context line.
      if (line === "" || line.startsWith(" ")) {
        current.hunk.lines.push({
          kind: "context",
          text: line === "" ? "" : line.slice(1),
          oldNumber: current.old,
          newNumber: current.new,
          noNewline: false,
        });
        current.old++;
        current.new++;
        continue;
      }
      // Not a hunk line any more: close it, then read the line as a header.
      closeHunk();
    }

    if (line.startsWith("diff --git ")) {
      const paths = pathsFromGitHeader(line.slice("diff --git ".length));
      if (patchFile === null) patchFile = paths.to ?? paths.from;
      continue;
    }
    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch !== null) {
      const oldStart = Number(hunkMatch[1] ?? "1");
      const oldLines = Number(hunkMatch[2] ?? "1");
      const newStart = Number(hunkMatch[3] ?? "1");
      const newLines = Number(hunkMatch[4] ?? "1");
      current = {
        hunk: { header: line, oldStart, oldLines, newStart, newLines, lines: [] },
        old: oldStart,
        new: newStart,
      };
      continue;
    }
    if (line.startsWith("--- ")) {
      const path = stripDiffPrefix(line.slice(4));
      if (patchFile === null && path !== null) patchFile = path;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = stripDiffPrefix(line.slice(4));
      if (path !== null) patchFile = path;
      continue;
    }
    if (line.startsWith("Index: ")) {
      const path = stripDiffPrefix(line.slice("Index: ".length));
      if (patchFile === null && path !== null) patchFile = path;
      continue;
    }
    if (line.startsWith("rename from ")) {
      renameFrom = line.slice("rename from ".length);
      continue;
    }
    if (line.startsWith("rename to ")) {
      renameTo = line.slice("rename to ".length);
      continue;
    }
    if (line.startsWith("copy from ")) {
      copyFrom = line.slice("copy from ".length);
      continue;
    }
    if (line.startsWith("copy to ")) {
      copyTo = line.slice("copy to ".length);
      continue;
    }
    if (line.startsWith("new file mode ")) {
      modeMark = `neue Datei · ${line.slice("new file mode ".length)}`;
      continue;
    }
    if (line.startsWith("deleted file mode ")) {
      modeMark = `gelöschte Datei · ${line.slice("deleted file mode ".length)}`;
      continue;
    }
    if (line.startsWith("old mode ")) {
      oldMode = line.slice("old mode ".length).trim();
      continue;
    }
    if (line.startsWith("new mode ")) {
      newMode = line.slice("new mode ".length).trim();
      continue;
    }
    // index/similarity/dissimilarity lines and the jsdiff separator carry no
    // information for the reader; anything else is a malformed patch line.
    if (line.startsWith("Binary files ")) {
      binary = true;
      continue;
    }
    if (
      line.startsWith("index ") ||
      line.startsWith("similarity index ") ||
      line.startsWith("dissimilarity index ") ||
      /^=+$/.test(line.trim())
    ) {
      continue;
    }
    if (line.trim() !== "") unknownLines.push(line);
  }
  closeHunk();

  const file = row.file.trim() === "" ? (patchFile ?? "datei") : row.file;
  if (renameFrom !== null || renameTo !== null) {
    notes.push({ kind: "rename", detail: `${renameFrom ?? "?"} → ${renameTo ?? "?"}` });
  }
  if (copyFrom !== null || copyTo !== null) {
    notes.push({ kind: "copy", detail: `${copyFrom ?? "?"} → ${copyTo ?? "?"}` });
  }
  if (modeMark !== null) {
    notes.push({ kind: "mode", detail: modeMark });
  } else if (oldMode !== null || newMode !== null) {
    notes.push({ kind: "mode", detail: `${oldMode ?? "?"} → ${newMode ?? "?"}` });
  }
  if (binary) {
    notes.push({ kind: "binary", detail: file });
  }
  if (unknownLines.length > 0) {
    notes.push({ kind: "unreadable", detail: unknownLines.slice(0, 3).join(" · ") });
  }

  const counted = countPatchChanges(hunks);
  const additions = row.additions !== 0 ? row.additions : counted.additions;
  const deletions = row.deletions !== 0 ? row.deletions : counted.deletions;
  const { directory, filename } = splitDiffPath(file);
  return {
    file,
    directory,
    filename,
    additions,
    deletions,
    status: row.status,
    hunks,
    notes,
    empty: hunks.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Context expansion (collapsed hunks show a few context lines plus an expander)
// ---------------------------------------------------------------------------

/** Context lines kept on each side of a collapsed hunk. */
export const DIFF_CONTEXT_LINES = 3;

/** Which collapsed context block of one hunk is currently expanded. */
export interface HunkExpansion {
  before: boolean;
  after: boolean;
}

export type DiffRow =
  | { kind: "line"; line: DiffLine }
  | { kind: "expand"; direction: "before" | "after"; count: number };

function leadingContextRun(lines: readonly DiffLine[]): number {
  let run = 0;
  while (run < lines.length && lines[run]?.kind === "context") run++;
  return run;
}

function trailingContextRun(lines: readonly DiffLine[]): number {
  let run = 0;
  while (run < lines.length && lines[lines.length - 1 - run]?.kind === "context") run++;
  return run;
}

/**
 * Rows of one hunk: the line rows plus an expander row per collapsed context
 * block. An expanded block keeps its (now collapsing) expander row, so the
 * affordance never disappears. Expanding never hides a changed line.
 */
export function hunkRows(
  hunk: DiffHunk,
  expansion: HunkExpansion,
  contextLines: number = DIFF_CONTEXT_LINES,
): DiffRow[] {
  const leading = leadingContextRun(hunk.lines);
  const hiddenBefore = Math.max(0, leading - contextLines);
  const rest = hunk.lines.slice(hiddenBefore);
  const hiddenAfter = Math.max(0, trailingContextRun(rest) - contextLines);
  const from = expansion.before ? 0 : hiddenBefore;
  const to = expansion.after ? hunk.lines.length : hunk.lines.length - hiddenAfter;
  const visible = hunk.lines.slice(from, to);
  // A degenerate hunk (e.g. context lines only with no display budget) must
  // never collapse into two expanders and zero rows.
  if (visible.length === 0) {
    return hunk.lines.map((line) => ({ kind: "line", line }) as DiffRow);
  }
  const rows: DiffRow[] = [];
  if (hiddenBefore > 0) rows.push({ kind: "expand", direction: "before", count: hiddenBefore });
  for (const line of visible) rows.push({ kind: "line", line });
  if (hiddenAfter > 0) rows.push({ kind: "expand", direction: "after", count: hiddenAfter });
  return rows;
}

// ---------------------------------------------------------------------------
// Split view (old side left, new side right)
// ---------------------------------------------------------------------------

export type SplitRow =
  | { kind: "pair"; left: DiffLine | null; right: DiffLine | null }
  | { kind: "expand"; direction: "before" | "after"; count: number };

/**
 * Rows of one hunk for the split view: deletions and additions of the same
 * block share a row, expanders span both sides.
 */
export function hunkSplitRows(
  hunk: DiffHunk,
  expansion: HunkExpansion,
  contextLines: number = DIFF_CONTEXT_LINES,
): SplitRow[] {
  const rows = hunkRows(hunk, expansion, contextLines);
  const out: SplitRow[] = [];
  let block: DiffLine[] = [];
  const flush = (): void => {
    if (block.length === 0) return;
    const deletes = block.filter((line) => line.kind === "delete");
    const adds = block.filter((line) => line.kind === "add");
    const height = Math.max(deletes.length, adds.length);
    for (let index = 0; index < height; index++) {
      out.push({ kind: "pair", left: deletes[index] ?? null, right: adds[index] ?? null });
    }
    block = [];
  };
  for (const row of rows) {
    if (row.kind === "expand") {
      flush();
      out.push(row);
      continue;
    }
    if (row.line.kind === "context") {
      flush();
      out.push({ kind: "pair", left: row.line, right: row.line });
      continue;
    }
    block.push(row.line);
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Session-level summary + empty states
// ---------------------------------------------------------------------------

export interface DiffSummary {
  files: number;
  additions: number;
  deletions: number;
}

function safeCount(value: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Totals of the change set (the header of the "Änderungen" tab). */
export function summarizeDiff(rows: readonly DiffSourceRow[]): DiffSummary {
  let additions = 0;
  let deletions = 0;
  for (const row of rows) {
    additions += safeCount(row.additions);
    deletions += safeCount(row.deletions);
  }
  return { files: rows.length, additions, deletions };
}

/** Git marker of a project payload (`Project.vcs`). */
export type ProjectGitState = "git" | "none" | "unknown";

export function projectGitState(vcs: unknown): ProjectGitState {
  if (typeof vcs === "string") {
    if (vcs === "git") return "git";
    if (vcs === "none") return "none";
    return "unknown";
  }
  if (vcs !== null && typeof vcs === "object") {
    const type = (vcs as { type?: unknown }).type;
    return type === "git" ? "git" : "unknown";
  }
  return "unknown";
}

/** Which empty card the diff surface shows when it has no rows. */
export type DiffEmptyKind = "changes" | "no-git";

/**
 * `no-git` when the session's project is known to have no git repository (a
 * project explicitly reporting `vcs: "none"`); with an unknown session key
 * only a server whose every project is repo-less counts. Unknown markers stay
 * the plain "no changes" card — the app never claims more than it knows.
 */
export function resolveDiffEmptyKind(input: {
  projects: readonly { id: string; vcs?: unknown }[];
  projectKey: string | null;
}): DiffEmptyKind {
  const states = input.projects.map((project) => projectGitState(project.vcs));
  if (input.projectKey !== null) {
    const index = input.projects.findIndex((project) => project.id === input.projectKey);
    if (index >= 0) return states[index] === "none" ? "no-git" : "changes";
  }
  return states.length > 0 && states.every((state) => state === "none") ? "no-git" : "changes";
}
