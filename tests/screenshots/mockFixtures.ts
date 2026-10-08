// Mock fixtures for the ui-review screenshot set.
//
// Every payload here mirrors the REAL V2 shapes of the pinned
// `@opencode/client` (verified against
// node_modules/@opencode/client/dist/promise/generated/types.d.ts) so the
// captures exercise the same code paths a live server would:
//   - `message.list` → `{ data: SessionMessageInfo[], cursor }`, flat `type`
//     union with assistant `content[]` parts (text / reasoning / tool).
//   - tool parts → `{ type: "tool", id, name, state: { status, input, … } }`.
//   - `session.diff` rows → `{ file, patch, additions, deletions, status }`.
//   - `session.active` → `{ [sessionID]: SessionActive }`.
// This file is test-only: it is never imported by app code.

/** Fixed timestamps keep the humanized chat times stable across captures. */
const T0 = Date.UTC(2026, 9, 8, 12, 0, 0);
const minutes = (n: number) => T0 + n * 60_000;

export const CHAT_MESSAGES = [
  {
    type: "user",
    id: "m-user-1",
    time: { created: minutes(-12) },
    agent: "build",
    model: { providerID: "anthropic", id: "claude-sonnet-4" },
    text: "Baue die Diff-Ansicht für die Session bitte mit Zeilennummern.",
  },
  {
    type: "user",
    id: "m-user-2",
    time: { created: minutes(-11) },
    text: "Am besten direkt gerendert statt als Roh-Patch.",
    files: [
      { path: "src/pages/SessionDetail.tsx" },
      { path: "src/lib/diffView.ts" },
      { path: "package.json" },
    ],
  },
  {
    type: "assistant",
    id: "m-assistant-1",
    time: { created: minutes(-10), completed: minutes(-7) },
    agent: "build",
    model: { providerID: "anthropic", id: "claude-sonnet-4" },
    content: [
      {
        type: "reasoning",
        text: "Zuerst sehe ich mir die aktuelle Ausgabe an, dann baue ich den Parser für die Hunks.",
      },
      {
        type: "tool",
        id: "t-read-1",
        name: "read",
        state: {
          status: "completed",
          input: { filePath: "src/pages/SessionDetail.tsx", offset: 1100, limit: 120 },
          content: [{ type: "text", text: "1143\t\t\t\t<pre>{row.patch}</pre>" }],
          metadata: {},
        },
      },
      {
        type: "tool",
        id: "t-grep-1",
        name: "grep",
        state: {
          status: "completed",
          input: { pattern: "session-diff", include: "*.tsx" },
          content: [{ type: "text", text: "src/pages/SessionDetail.tsx:1171" }],
          metadata: {},
        },
      },
      {
        type: "tool",
        id: "t-glob-1",
        name: "glob",
        state: {
          status: "completed",
          input: { pattern: "src/**/*.ts" },
          content: [{ type: "text", text: "42 Dateien" }],
          metadata: {},
        },
      },
      {
        type: "tool",
        id: "t-bash-1",
        name: "bash",
        state: {
          status: "completed",
          input: { command: "git diff --stat HEAD~1" },
          content: [
            {
              type: "text",
              text: " 3 files changed, 42 insertions(+), 8 deletions(-)",
            },
          ],
          metadata: {},
        },
      },
      {
        type: "text",
        text: [
          "## Ergebnis",
          "",
          "Die Diff-Ansicht rendert jetzt richtig:",
          "",
          "- Zeilennummern auf beiden Seiten",
          "- `+`/`-`-Spalte mit Farben",
          "- Umschalter Vereint/Geteilt",
          "",
          "```ts",
          "const rows = parseDiff(patch);",
          "for (const hunk of rows) render(hunk.lines);",
          "```",
          "",
          "| Datei | + | - |",
          "| --- | --- | --- |",
          "| SessionDetail.tsx | 12 | 3 |",
          "| diffView.ts | 30 | 5 |",
        ].join("\n"),
      },
    ],
  },
  {
    type: "agent-switched",
    id: "n-agent-1",
    time: { created: minutes(-7) },
    agent: "plan",
  },
  {
    type: "assistant",
    id: "m-assistant-2",
    time: { created: minutes(-6), completed: minutes(-4) },
    agent: "plan",
    model: { providerID: "anthropic", id: "claude-sonnet-4" },
    content: [
      {
        type: "tool",
        id: "t-edit-1",
        name: "edit",
        state: {
          status: "error",
          input: { filePath: "src/lib/diffView.ts", oldString: "parse(", newString: "parseDiff(" },
          content: [],
          metadata: {},
          error: "Patch passt nicht auf die Datei (Kontext verschoben)",
        },
      },
      { type: "text", text: "Der Edit ist gescheitert — ich probiere einen kleineren Hunk." },
    ],
  },
  {
    type: "model-switched",
    id: "n-model-1",
    time: { created: minutes(-4) },
    model: { providerID: "anthropic", id: "claude-sonnet-4" },
  },
  {
    type: "compaction",
    id: "n-compaction-1",
    time: { created: minutes(-3) },
    status: "completed",
    summary: "Kontext kompaktiert: 48 Nachrichten zusammengefasst.",
  },
  {
    type: "system",
    id: "n-system-1",
    time: { created: minutes(-2) },
    text: "Ausführung abgebrochen — der alte Patch wurde verworfen.",
  },
];

/** A turn in flight: one tool still running plus partially streamed text. */
export const CHAT_RUNNING_MESSAGES = [
  {
    type: "user",
    id: "m-run-user",
    time: { created: minutes(-2) },
    agent: "build",
    model: { providerID: "anthropic", id: "claude-sonnet-4" },
    text: "Renne die Tests und zeige mir das Ergebnis.",
  },
  {
    type: "assistant",
    id: "m-run-assistant",
    time: { created: minutes(-1) },
    agent: "build",
    model: { providerID: "anthropic", id: "claude-sonnet-4" },
    content: [
      {
        type: "tool",
        id: "t-run-1",
        name: "bash",
        state: { status: "running", input: { command: "pnpm vitest run --reporter=dot" }, content: [] },
      },
      { type: "text", text: "Ich starte die Testsuite und warte auf das Ergebnis …" },
    ],
  },
];

/** `session.diff` rows: added, modified, renamed and binary in one payload. */
export const SESSION_DIFF_ROWS = [
  {
    file: "src/lib/diffView.ts",
    status: "modified",
    additions: 30,
    deletions: 5,
    patch: [
      "@@ -1,7 +1,9 @@",
      "+export interface DiffRow {",
      "+  oldNumber: number | null;",
      "+  newNumber: number | null;",
      " export function parseDiff(patch: string) {",
      "-  return patch.split(\"\\n\");",
      "+  const rows: DiffRow[] = [];",
      "+  for (const line of patch.split(\"\\n\")) rows.push(toRow(line));",
      "+  return rows;",
      " }",
      "",
      " function toRow(line: string) {",
      "@@ -120,4 +122,6 @@ function summarize(rows: DiffRow[]) {",
      "   let additions = 0;",
      "+  let deletions = 0;",
      "   for (const row of rows) {",
      "     if (row.kind === \"add\") additions += 1;",
      "+    if (row.kind === \"del\") deletions += 1;",
      "   }",
      "   return { additions, deletions };",
      " }",
    ].join("\n"),
  },
  {
    file: "src/components/SessionDiffView.tsx",
    status: "modified",
    additions: 12,
    deletions: 3,
    patch: [
      "@@ -10,6 +10,9 @@ export function SessionDiffView() {",
      "   const [split, setSplit] = useState(false);",
      "+  const [position, setPosition] = useState(0);",
      "   return (",
      "     <section className=\"card bg-base-200 shadow\">",
      "-      <pre>{row.patch}</pre>",
      "+      <DiffRows rows={rows} split={split} />",
      "+      <DiffToolbar onSplit={setSplit} position={position} />",
      "     </section>",
      "   );",
      " }",
    ].join("\n"),
  },
  {
    file: "docs/diff-notes.md",
    status: "added",
    additions: 6,
    deletions: 0,
    patch: [
      "@@ -0,0 +1,6 @@",
      "+# Diff-Notizen",
      "+",
      "+Die Ansicht rendert Hunks spaltenweise.",
      "+Binärdateien bekommen eine Notiz statt Zeilen.",
      "+",
      "+## Nächste Schritte",
    ].join("\n"),
  },
  {
    file: "src/lib/legacy-diff.ts",
    status: "modified",
    additions: 0,
    deletions: 9,
    patch: [
      "@@ -1,9 +0,0 @@",
      "-export function legacyParse(input: string) {",
      "-  return input",
      "-    .split(\"\\n\")",
      "-    .map((line) => line.trim());",
      "-}",
      "-",
      "-export const LEGACY = true;",
      "-",
      "-export default legacyParse;",
    ].join("\n"),
  },
  {
    file: "assets/logo.png",
    status: "modified",
    additions: 0,
    deletions: 0,
    patch: "",
  },
];

/** `GET /api/session/active` payload — two running agents. */
export const ACTIVE_SESSIONS = {
  "ses-active-1": {
    sessionID: "ses-active-1",
    agent: "build",
    projectID: "p1",
    title: "Diff-Ansicht rendern",
    time: { created: minutes(-24), updated: minutes(-1) },
  },
  "ses-active-2": {
    sessionID: "ses-active-2",
    agent: "plan",
    projectID: "p2",
    title: "Migration planen",
    time: { created: minutes(-51), updated: minutes(-3) },
  },
};

/** Shells and PTYs the app lists per server (shape of `shell.list`/`pty.list`). */
export const RUNNING_SHELLS = [
  { id: "sh-1", command: "sleep 60", status: "running", time: { created: minutes(-3) } },
  { id: "sh-2", command: "pnpm test:e2e", status: "running", time: { created: minutes(-12) } },
];

export const PROJECTS = [
  {
    id: "p1",
    name: "opencode-pwa",
    canonical: "/projects/opencode-pwa",
    vcs: "git",
    icon: { override: "code", color: "oklch(0.72 0.19 264)" },
    time: { created: minutes(-900), updated: minutes(-30), active: minutes(-1) },
    sandboxes: [],
  },
  {
    id: "p2",
    name: "agents-skills",
    canonical: "/projects/agents-skills",
    vcs: "git",
    icon: { override: "book", color: "oklch(0.72 0.19 150)" },
    time: { created: minutes(-800), updated: minutes(-120), active: minutes(-10) },
    sandboxes: [],
  },
];

export const SESSION_ROWS = [
  {
    id: "ses-1",
    title: "Diff-Ansicht rendern",
    agent: "build",
    projectID: "p1",
    time: { created: minutes(-12), updated: minutes(-1) },
  },
  {
    id: "ses-2",
    title: "Migration planen",
    agent: "plan",
    projectID: "p2",
    time: { created: minutes(-60), updated: minutes(-40) },
  },
  {
    id: "ses-3",
    title: "Chat-Polish abstimmen",
    agent: "build",
    projectID: "p1",
    time: { created: minutes(-400), updated: minutes(-300) },
  },
];

/** File browser rows (`file.list` → `FileSystemEntry[]`). */
export const FILE_ENTRIES = [
  { path: "src", type: "directory" },
  { path: "docs", type: "directory" },
  { path: "tests", type: "directory" },
  { path: "package.json", type: "file" },
  { path: "README.md", type: "file" },
];

export const MCP_SERVERS = [
  { name: "websearch", status: "connected", tools: ["search", "fetch"] },
  { name: "filesystem", status: "connected", tools: ["read_file", "write_file"] },
  { name: "postgres", status: "error", tools: [] },
];

export const PERMISSIONS = [
  {
    id: "perm-1",
    permission: "bash",
    patterns: ["pnpm *"],
    message: "pnpm lint ausführen",
    time: { created: minutes(-2) },
  },
  {
    id: "perm-2",
    permission: "edit",
    patterns: ["src/lib/*.ts"],
    message: "src/lib/diffView.ts bearbeiten",
    time: { created: minutes(-1) },
  },
];
