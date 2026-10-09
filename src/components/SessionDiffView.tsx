import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMemo, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon.tsx";
import {
  hunkRows,
  hunkSplitRows,
  parseFileDiff,
  resolveDiffEmptyKind,
  summarizeDiff,
  type DiffLine,
  type DiffSourceRow,
  type HunkExpansion,
  type ParsedFileDiff,
  type SplitRow,
} from "../lib/diffView.ts";
import type { ProjectInfo, SessionDiffRow } from "../lib/opencode.ts";

/**
 * Rendered "Änderungen" surface (wave 4, parity with the original's
 * `review-panel-v2`).
 *
 * The server hands over one patch per file; this component parses it into line
 * rows with line numbers and a +/- gutter, keeps a per-file header with the
 * directory/file-name split and the counts, and offers the reference's
 * unified/split segmented control plus context expansion. The empty states are
 * cards ("keine Änderungen" / "kein Git-Repository"), never an alert box.
 *
 * Degenerate patches (rename, mode change, binary, missing newline, empty or
 * malformed) degrade into readable rows via `src/lib/diffView.ts` — the raw
 * patch never reaches a `<pre>`.
 */

/** Diff rendering style of the segmented control (reference: `SessionReviewDiffStyle`). */
export type SessionDiffStyle = "unified" | "split";

interface SessionDiffViewProps {
  rows: readonly SessionDiffRow[];
  /** Projects of the server, so an empty surface can explain a missing repo. */
  projects?: readonly ProjectInfo[];
  /** Project key of the session (session list `projectID` / `directory`). */
  projectKey?: string | null;
  /** Create the missing git repository (empty state action). */
  onInitGit?: (directory: string | null) => void;
  initGitBusy?: boolean;
}

/** Directory the "no git" card initializes, when it is known. */
function noGitDirectory(
  projects: readonly ProjectInfo[],
  projectKey: string | null,
): string | null {
  const byKey = projectKey === null ? undefined : projects.find((entry) => entry.id === projectKey);
  const target = byKey ?? (projects.length === 1 ? projects[0] : undefined);
  return target?.canonical ?? null;
}

function statusBadge(status: DiffSourceRow["status"]) {
  if (status === "added") {
    return (
      <span className="text-success" title={t`Neu`}>
        A
      </span>
    );
  }
  if (status === "deleted") {
    return (
      <span className="text-error" title={t`Gelöscht`}>
        D
      </span>
    );
  }
  return (
    <span className="opacity-60" title={t`Geändert`}>
      M
    </span>
  );
}

function NoteLabel({ note }: { note: ParsedFileDiff["notes"][number] }) {
  if (note.kind === "binary") {
    return (
      <span className="flex items-center gap-1">
        <Icon name="binary" className="size-3.5" />
        <Trans>Binärdatei – der Inhalt wird nicht angezeigt.</Trans>
      </span>
    );
  }
  if (note.kind === "rename") {
    return (
      <span>
        <Trans>Umbenannt:</Trans> {note.detail}
      </span>
    );
  }
  if (note.kind === "copy") {
    return (
      <span>
        <Trans>Kopiert:</Trans> {note.detail}
      </span>
    );
  }
  if (note.kind === "mode") {
    return (
      <span>
        <Trans>Modus:</Trans> {note.detail}
      </span>
    );
  }
  return (
    <span>
      <Trans>Nicht lesbare Zeile:</Trans> {note.detail}
    </span>
  );
}

const ROW_GRID = "grid grid-cols-[2.25rem_2.25rem_1rem_minmax(0,1fr)]";
const SIDE_GRID = "grid grid-cols-[2.25rem_1rem_minmax(0,1fr)]";

function signOf(kind: DiffLine["kind"]): string {
  if (kind === "add") return "+";
  if (kind === "delete") return "−";
  return " ";
}

/** One line of the unified view: old number, new number, gutter, content. */
function UnifiedLine({ line }: { line: DiffLine }) {
  const tone =
    line.kind === "add" ? "bg-success/15" : line.kind === "delete" ? "bg-error/15" : undefined;
  const signTone =
    line.kind === "add" ? "text-success" : line.kind === "delete" ? "text-error" : "opacity-30";
  return (
    <div className={`${ROW_GRID} ${tone ?? ""}`} data-line-kind={line.kind}>
      <span className="text-right pr-1 opacity-45 select-none oc-tabular">{line.oldNumber ?? ""}</span>
      <span className="text-right pr-1 opacity-45 select-none oc-tabular">{line.newNumber ?? ""}</span>
      <span className={`text-center select-none ${signTone}`}>{signOf(line.kind)}</span>
      <span className="whitespace-pre pr-2">
        {line.text}
        {line.noNewline && (
          <span className="opacity-50" title={t`Kein Zeilenumbruch am Dateiende`}>
            {" "}
            ↵
          </span>
        )}
      </span>
    </div>
  );
}

/** One side of the split view (empty placeholder for the other side's rows). */
function SplitSide({ line }: { line: DiffLine | null }) {
  if (line === null) {
    return (
      <div className={`${SIDE_GRID} bg-base-300/20`} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    );
  }
  const tone =
    line.kind === "add" ? "bg-success/15" : line.kind === "delete" ? "bg-error/15" : undefined;
  const signTone =
    line.kind === "add" ? "text-success" : line.kind === "delete" ? "text-error" : "opacity-30";
  return (
    <div className={`${SIDE_GRID} ${tone ?? ""}`} data-line-kind={line.kind}>
      <span className="text-right pr-1 opacity-45 select-none oc-tabular">
        {line.kind === "add" ? line.newNumber ?? "" : line.oldNumber ?? ""}
      </span>
      <span className={`text-center select-none ${signTone}`}>{signOf(line.kind)}</span>
      <span className="whitespace-pre pr-2">
        {line.text}
        {line.noNewline && (
          <span className="opacity-50" title={t`Kein Zeilenumbruch am Dateiende`}>
            {" "}
            ↵
          </span>
        )}
      </span>
    </div>
  );
}

function SplitPair({ left, right }: { left: DiffLine | null; right: DiffLine | null }) {
  return (
    <div className="grid grid-cols-[minmax(13rem,1fr)_minmax(13rem,1fr)]" data-line-kind="pair">
      <SplitSide line={left} />
      <SplitSide line={right} />
    </div>
  );
}

function ExpandRow({
  direction,
  count,
  expanded,
  onToggle,
  testId,
}: {
  direction: "before" | "after";
  count: number;
  expanded: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] text-info hover:bg-base-300/40 oc-dense"
      onClick={onToggle}
      data-testid={testId}
      aria-expanded={expanded}
    >
      <Icon name="chevron" className={`size-3 shrink-0${direction === "before" ? " rotate-180" : ""}`} />
      {expanded ? (
        <Trans>Kontext ausblenden</Trans>
      ) : count === 1 ? (
        <Trans>1 Kontextzeile anzeigen</Trans>
      ) : (
        <Trans>{count} Kontextzeilen anzeigen</Trans>
      )}
    </button>
  );
}

function HunkBlock({
  file,
  index,
  hunk,
  style,
  expansion,
  onToggleExpansion,
}: {
  file: string;
  index: number;
  hunk: ParsedFileDiff["hunks"][number];
  style: SessionDiffStyle;
  expansion: HunkExpansion;
  onToggleExpansion: (direction: "before" | "after") => void;
}) {
  const testId = `session-diff-hunk-${file}-${index}`;
  if (style === "split") {
    const rows: SplitRow[] = hunkSplitRows(hunk, expansion);
    return (
      <div data-testid={testId} data-style="split">
        <div className="px-2 py-0.5 text-[11px] font-mono bg-base-300/40 text-base-content/60">
          {hunk.header}
        </div>
        <div className="oc-dense font-mono text-[11px] leading-5 w-max min-w-full">
          {rows.map((row, rowIndex) =>
            row.kind === "expand" ? (
              <ExpandRow
                key={rowIndex}
                direction={row.direction}
                count={row.count}
                expanded={expansion[row.direction]}
                onToggle={() => onToggleExpansion(row.direction)}
                testId={`${testId}-expand-${row.direction}`}
              />
            ) : (
              <SplitPair key={rowIndex} left={row.left} right={row.right} />
            ),
          )}
        </div>
      </div>
    );
  }
  const rows = hunkRows(hunk, expansion);
  return (
    <div data-testid={testId} data-style="unified">
      <div className="px-2 py-0.5 text-[11px] font-mono bg-base-300/40 text-base-content/60">
        {hunk.header}
      </div>
      <div className="oc-dense font-mono text-[11px] leading-5 w-max min-w-full">
        {rows.map((row, rowIndex) =>
          row.kind === "expand" ? (
            <ExpandRow
              key={rowIndex}
              direction={row.direction}
              count={row.count}
              expanded={expansion[row.direction]}
              onToggle={() => onToggleExpansion(row.direction)}
              testId={`${testId}-expand-${row.direction}`}
            />
          ) : (
            <UnifiedLine key={rowIndex} line={row.line} />
          ),
        )}
      </div>
    </div>
  );
}

function DiffEmptyCard({
  testId,
  icon,
  title,
  description,
  children,
}: {
  testId: string;
  icon: "circle-check" | "branch";
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="card bg-base-200 shadow" data-testid={testId}>
      <div className="card-body items-center text-center gap-1 py-6">
        <Icon name={icon} className="text-3xl opacity-50" />
        <h3 className="card-title text-base">{title}</h3>
        <p className="text-sm opacity-70 max-w-prose">{description}</p>
        {children}
      </div>
    </div>
  );
}

export default function SessionDiffView({
  rows,
  projects = [],
  projectKey = null,
  onInitGit,
  initGitBusy = false,
}: SessionDiffViewProps) {
  const [style, setStyle] = useState<SessionDiffStyle>("unified");
  const [expandedKeys, setExpandedKeys] = useState<readonly string[]>([]);
  const [active, setActive] = useState(0);
  const detailsRefs = useRef(new Map<string, HTMLDetailsElement | null>());

  const parsed = useMemo(() => rows.map(parseFileDiff), [rows]);
  const summary = useMemo(() => summarizeDiff(rows), [rows]);
  const activeIndex = Math.min(active, Math.max(0, parsed.length - 1));
  const fileCount = summary.files;
  const fileCountLabel = fileCount === 1 ? t`1 Datei` : t`${fileCount} Dateien`;
  const addedLines = summary.additions;
  const removedLines = summary.deletions;

  function isExpanded(key: string, direction: "before" | "after"): boolean {
    return expandedKeys.includes(`${key}::${direction}`);
  }

  function toggleExpansion(key: string, direction: "before" | "after") {
    const full = `${key}::${direction}`;
    setExpandedKeys((keys) => (keys.includes(full) ? keys.filter((k) => k !== full) : [...keys, full]));
  }

  function showFile(index: number) {
    const target = parsed[index];
    if (target === undefined) return;
    setActive(index);
    const element = detailsRefs.current.get(target.file);
    if (element !== undefined && element !== null) element.open = true;
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  if (parsed.length === 0) {
    const kind = resolveDiffEmptyKind({ projects, projectKey });
    if (kind === "no-git") {
      const directory = noGitDirectory(projects, projectKey);
      return (
        <DiffEmptyCard
          testId="session-diff-empty-no-git"
          icon="branch"
          title={t`Kein Git-Repository`}
          description={t`Der Server kann für dieses Projekt keine Änderungen verfolgen, solange es kein Git-Repository gibt. Lege eins an, um die Änderungen dieser Session zu sehen.`}
        >
          {onInitGit !== undefined && (
            <div className="card-actions mt-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="session-diff-init-git"
                disabled={initGitBusy}
                onClick={() => onInitGit(directory)}
              >
                <Icon name="branch" className="size-4" />
                {initGitBusy ? <Trans>Wird erstellt …</Trans> : <Trans>Git-Repository erstellen</Trans>}
              </button>
            </div>
          )}
        </DiffEmptyCard>
      );
    }
    return (
      <DiffEmptyCard
        testId="session-diff-empty-changes"
        icon="circle-check"
        title={t`Keine Änderungen`}
        description={t`In dieser Session wurden noch keine Dateien geändert. Sobald der Agent Dateien schreibt oder bearbeitet, erscheinen sie hier.`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="session-diff-view">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-testid="session-diff-summary">
          <span className="oc-dense-strong text-sm">{fileCountLabel}</span>
          <span
            className="flex items-center gap-1 text-xs oc-tabular"
            title={t`${addedLines} Zeilen hinzugefügt, ${removedLines} entfernt`}
          >
            <span className="text-success" data-testid="session-diff-summary-additions">
              +{summary.additions}
            </span>
            <span className="text-error" data-testid="session-diff-summary-deletions">
              −{summary.deletions}
            </span>
          </span>
          <span className="text-xs opacity-60">
            <Trans>Zeilen</Trans>
          </span>
        </div>
        <span className="flex-1" />
        <div className="join">
          <button
            type="button"
            className="btn btn-sm join-item"
            data-testid="session-diff-prev"
            aria-label={t`Vorherige Datei`}
            disabled={parsed.length < 2}
            onClick={() => showFile((activeIndex - 1 + parsed.length) % parsed.length)}
          >
            <Icon name="chevron" className="size-4 rotate-180" />
          </button>
          <span
            className="join-item flex items-center px-2 text-xs oc-tabular opacity-70"
            data-testid="session-diff-position"
          >
            {activeIndex + 1}/{parsed.length}
          </span>
          <button
            type="button"
            className="btn btn-sm join-item"
            data-testid="session-diff-next"
            aria-label={t`Nächste Datei`}
            disabled={parsed.length < 2}
            onClick={() => showFile((activeIndex + 1) % parsed.length)}
          >
            <Icon name="chevron" className="size-4" />
          </button>
        </div>
        <div className="join" role="group" aria-label={t`Diff-Ansicht`}>
          <button
            type="button"
            className={`btn btn-sm join-item${style === "unified" ? " btn-active" : ""}`}
            aria-pressed={style === "unified"}
            data-testid="session-diff-style-unified"
            onClick={() => setStyle("unified")}
          >
            <Trans>Vereint</Trans>
          </button>
          <button
            type="button"
            className={`btn btn-sm join-item${style === "split" ? " btn-active" : ""}`}
            aria-pressed={style === "split"}
            data-testid="session-diff-style-split"
            onClick={() => setStyle("split")}
          >
            <Trans>Geteilt</Trans>
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-2" data-testid="session-diff">
        {parsed.map((item, index) => (
            <li key={item.file} data-testid={`session-diff-${item.file}`}>
              <details
                className="card bg-base-300/40 rounded"
                // The first file starts expanded — the reference shows its diff
                // inline instead of hiding every patch behind a click. Later
                // files stay collapsed until prev/next opens them (`showFile`),
                // and a manual toggle is never overridden: React only re-applies
                // the attribute when its value changes between renders.
                open={index === 0}
                data-file={item.file}
                data-status={item.status}
                ref={(element) => {
                  detailsRefs.current.set(item.file, element);
                }}
              >
                <summary className="flex cursor-pointer items-center gap-2 p-2 oc-dense">
                  <span className="w-3 shrink-0 text-center font-mono text-xs oc-dense-strong">
                    {statusBadge(item.status)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono" title={item.file}>
                    <span className="opacity-60">{item.directory}</span>
                    <span className="oc-dense-strong">{item.filename}</span>
                  </span>
                  <span className="shrink-0 text-xs oc-tabular">
                    <span className="text-success">+{item.additions}</span>{" "}
                    <span className="text-error">−{item.deletions}</span>
                  </span>
                  <Icon name="chevron" className="tool-chevron size-4 shrink-0 opacity-60" />
                </summary>
                <div className="border-t border-base-content/10">
                  <div className="overflow-x-auto">
                    {item.notes.length > 0 && (
                      <div
                        className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 py-1 text-[11px] opacity-70"
                        data-testid={`session-diff-notes-${item.file}`}
                      >
                        {item.notes.map((note, noteIndex) => (
                          <NoteLabel key={noteIndex} note={note} />
                        ))}
                      </div>
                    )}
                    {item.empty ? (
                      // Only for a header-only patch: a note (binary, rename,
                      // malformed) already explains why there are no rows.
                      item.notes.length === 0 && (
                        <p className="px-2 py-2 text-xs opacity-60">
                          <Trans>Keine zeilenweisen Änderungen in dieser Datei.</Trans>
                        </p>
                      )
                    ) : (
                      item.hunks.map((hunk, hunkIndex) => (
                        <HunkBlock
                          key={hunkIndex}
                          file={item.file}
                          index={hunkIndex}
                          hunk={hunk}
                          style={style}
                          expansion={{
                            before: isExpanded(`${item.file}::${hunkIndex}`, "before"),
                            after: isExpanded(`${item.file}::${hunkIndex}`, "after"),
                          }}
                          onToggleExpansion={(direction) =>
                            toggleExpansion(`${item.file}::${hunkIndex}`, direction)
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              </details>
            </li>
        ))}
      </ul>
    </div>
  );
}
