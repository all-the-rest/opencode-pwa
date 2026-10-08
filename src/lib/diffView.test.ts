import { describe, expect, it } from "vitest";
import {
  countPatchChanges,
  hunkRows,
  hunkSplitRows,
  parseFileDiff,
  projectGitState,
  resolveDiffEmptyKind,
  splitDiffPath,
  summarizeDiff,
  type DiffSourceRow,
} from "./diffView.ts";

function row(patch: string, extra: Partial<DiffSourceRow> = {}): DiffSourceRow {
  return {
    file: "src/app.ts",
    patch,
    additions: 0,
    deletions: 0,
    status: "modified",
    ...extra,
  };
}

const GIT_PATCH = [
  "diff --git a/src/app.ts b/src/app.ts",
  "index 1234567..89abcde 100644",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -1,4 +1,5 @@",
  " context",
  "-alt",
  "+neu",
  "+nochmehr",
  " rest",
  "@@ -20,3 +21,3 @@ zweite Stelle",
  " unverändert",
  "-weg",
  "+da",
].join("\n");

describe("parseFileDiff", () => {
  it("parses a full git patch into hunks with line numbers and a gutter", () => {
    const parsed = parseFileDiff(row(GIT_PATCH, { additions: 3, deletions: 2 }));
    expect(parsed.file).toBe("src/app.ts");
    expect(parsed.directory).toBe("src/");
    expect(parsed.filename).toBe("app.ts");
    expect(parsed.additions).toBe(3);
    expect(parsed.deletions).toBe(2);
    expect(parsed.empty).toBe(false);
    expect(parsed.hunks).toHaveLength(2);

    const [first, second] = parsed.hunks;
    expect(first?.header).toBe("@@ -1,4 +1,5 @@");
    expect(first?.lines.map((line) => line.kind)).toEqual([
      "context",
      "delete",
      "add",
      "add",
      "context",
    ]);
    expect(first?.lines.map((line) => line.oldNumber)).toEqual([1, 2, null, null, 3]);
    expect(first?.lines.map((line) => line.newNumber)).toEqual([1, null, 2, 3, 4]);
    expect(first?.lines.map((line) => line.text)).toEqual([
      "context",
      "alt",
      "neu",
      "nochmehr",
      "rest",
    ]);
    expect(second?.header).toBe("@@ -20,3 +21,3 @@ zweite Stelle");
    expect(countPatchChanges(parsed.hunks)).toEqual({ additions: 3, deletions: 2 });
  });

  it("keeps the reported counts and falls back to the counted ones", () => {
    expect(parseFileDiff(row("@@ -1 +1 @@\n-a\n+b", { additions: 7, deletions: 5 }))).toMatchObject({
      additions: 7,
      deletions: 5,
    });
    expect(parseFileDiff(row("@@ -1 +1 @@\n-a\n+b"))).toMatchObject({
      additions: 1,
      deletions: 1,
    });
  });

  it("accepts jsdiff-style patches without file headers", () => {
    const parsed = parseFileDiff(row("@@ -1,2 +1,3 @@\n+neu"));
    expect(parsed.file).toBe("src/app.ts");
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0]?.lines).toEqual([
      { kind: "add", text: "neu", oldNumber: null, newNumber: 1, noNewline: false },
    ]);
    expect(parsed.additions).toBe(1);
  });

  it("reads hunk headers without line counts", () => {
    const parsed = parseFileDiff(row("@@ -1 +1 @@\n-a\n+b"));
    expect(parsed.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 });
  });

  it("records a rename as a note and keeps the row's path and status", () => {
    const parsed = parseFileDiff(
      row(
        [
          "diff --git a/src/alt.ts b/src/neu.ts",
          "similarity index 92%",
          "rename from src/alt.ts",
          "rename to src/neu.ts",
          "--- a/src/alt.ts",
          "+++ b/src/neu.ts",
          "@@ -1,2 +1,2 @@",
          " kontext",
          "-alt",
          "+neu",
        ].join("\n"),
        { file: "src/neu.ts", status: "added" },
      ),
    );
    expect(parsed.file).toBe("src/neu.ts");
    expect(parsed.status).toBe("added");
    expect(parsed.notes).toEqual([
      { kind: "rename", detail: "src/alt.ts → src/neu.ts" },
    ]);
    expect(parsed.hunks).toHaveLength(1);
  });

  it("records mode changes and copy pairs", () => {
    const mode = parseFileDiff(
      row(["diff --git a/run.sh b/run.sh", "old mode 100644", "new mode 100755"].join("\n")),
    );
    expect(mode.notes).toEqual([{ kind: "mode", detail: "100644 → 100755" }]);

    const copy = parseFileDiff(row(["copy from a.ts", "copy to b.ts"].join("\n")));
    expect(copy.notes).toEqual([{ kind: "copy", detail: "a.ts → b.ts" }]);
  });

  it("marks binary files as a note without hunks", () => {
    const parsed = parseFileDiff(
      row(
        [
          "diff --git a/logo.png b/logo.png",
          "index 1234567..89abcde 100644",
          "Binary files a/logo.png and b/logo.png differ",
        ].join("\n"),
      ),
    );
    expect(parsed.notes).toEqual([{ kind: "binary", detail: "src/app.ts" }]);
    expect(parsed.hunks).toHaveLength(0);
    expect(parsed.empty).toBe(true);
  });

  it("flags a missing trailing newline on the last line", () => {
    const parsed = parseFileDiff(
      row(["@@ -1 +1 @@", "+neu", "\\ No newline at end of file"].join("\n")),
    );
    expect(parsed.hunks[0]?.lines[0]).toMatchObject({ kind: "add", text: "neu", noNewline: true });
  });

  it("treats a lone empty line inside a hunk as an empty context line", () => {
    const parsed = parseFileDiff(row(["@@ -1,2 +1,2 @@", " oben", "", " unten"].join("\n")));
    expect(parsed.hunks[0]?.lines.map((line) => [line.kind, line.text, line.oldNumber])).toEqual([
      ["context", "oben", 1],
      ["context", "", 2],
      ["context", "unten", 3],
    ]);
  });

  it("renders an empty jsdiff patch as an empty file, not an error", () => {
    const parsed = parseFileDiff(row(["Index: src/app.ts", "===", "--- src/app.ts", "+++ src/app.ts"].join("\n")));
    expect(parsed.hunks).toHaveLength(0);
    expect(parsed.notes).toHaveLength(0);
    expect(parsed.empty).toBe(true);
  });

  it("degrades a malformed patch into a readable note", () => {
    const parsed = parseFileDiff(row("+++ neu"));
    expect(parsed.empty).toBe(true);
    expect(parsed.notes).toHaveLength(0);

    const garbage = parseFileDiff(row("das ist kein patch\nwirres Zeug"));
    expect(garbage.hunks).toHaveLength(0);
    expect(garbage.empty).toBe(true);
    expect(garbage.notes).toEqual([
      { kind: "unreadable", detail: "das ist kein patch · wirres Zeug" },
    ]);
  });

  it("survives an empty, missing or non-string patch", () => {
    expect(parseFileDiff(row("")).empty).toBe(true);
    const broken = parseFileDiff({
      file: "a.ts",
      // Malformed server payloads must not crash the surface.
      patch: undefined as unknown as string,
      additions: 1,
      deletions: 0,
      status: "modified",
    });
    expect(broken.empty).toBe(true);
    expect(broken.file).toBe("a.ts");
  });

  it("decodes quoted paths with tabs and octal escapes", () => {
    const parsed = parseFileDiff(
      row(['diff --git "a/src/tab\tdatei.txt" "b/src/tab\tdatei.txt"', "@@ -1 +1 @@", "-a", "+b"].join("\n")),
    );
    expect(parsed.file).toBe("src/app.ts");
    expect(parsed.hunks).toHaveLength(1);
  });

  it("splits a path into directory and file name", () => {
    expect(splitDiffPath("src/lib/app.ts")).toEqual({ directory: "src/lib/", filename: "app.ts" });
    expect(splitDiffPath("README.md")).toEqual({ directory: "", filename: "README.md" });
  });
});

describe("hunkRows (context expansion)", () => {
  const hunk = parseFileDiff(
    row(
      [
        "@@ -1,12 +1,12 @@",
        " a",
        " b",
        " c",
        " d",
        "-alt",
        "+neu",
        " e",
        " f",
        " g",
        " h",
        " i",
        " j",
      ].join("\n"),
    ),
  ).hunks[0];

  it("collapses long context runs into expander rows", () => {
    if (hunk === undefined) throw new Error("hunk missing");
    const rows = hunkRows(hunk, { before: false, after: false });
    const kinds = rows.map((entry) => (entry.kind === "expand" ? `expand:${entry.direction}` : entry.line.kind));
    // Four leading and six trailing context lines, three stay visible each.
    expect(kinds).toEqual([
      "expand:before",
      "context",
      "context",
      "context",
      "delete",
      "add",
      "context",
      "context",
      "context",
      "expand:after",
    ]);
    const before = rows[0];
    expect(before?.kind === "expand" && before.count).toBe(1);
    const after = rows[rows.length - 1];
    expect(after?.kind === "expand" && after.count).toBe(3);
  });

  it("shows every line when expanded", () => {
    if (hunk === undefined) throw new Error("hunk missing");
    const rows = hunkRows(hunk, { before: true, after: true });
    expect(rows.filter((entry) => entry.kind === "line")).toHaveLength(hunk.lines.length);
    // The expanders stay, so the block can be collapsed again.
    expect(rows.filter((entry) => entry.kind === "expand")).toHaveLength(2);
  });

  it("expands one side at a time", () => {
    if (hunk === undefined) throw new Error("hunk missing");
    const beforeOnly = hunkRows(hunk, { before: true, after: false });
    expect(beforeOnly.filter((entry) => entry.kind === "expand").map((entry) => entry.direction)).toEqual([
      "before",
      "after",
    ]);
    expect(beforeOnly.filter((entry) => entry.kind === "line")).toHaveLength(9);

    const afterOnly = hunkRows(hunk, { before: false, after: true });
    expect(afterOnly.filter((entry) => entry.kind === "expand").map((entry) => entry.direction)).toEqual([
      "before",
      "after",
    ]);
    expect(afterOnly.filter((entry) => entry.kind === "line")).toHaveLength(11);
  });

  it("never collapses a short hunk", () => {
    const short = parseFileDiff(row("@@ -1,2 +1,2 @@\n-alt\n+neu")).hunks[0];
    if (short === undefined) throw new Error("hunk missing");
    expect(hunkRows(short, { before: false, after: false })).toHaveLength(2);
  });

  it("keeps rows for a context-only hunk", () => {
    const contextOnly = parseFileDiff(
      row(["@@ -1,8 +1,8 @@", " a", " b", " c", " d", " e", " f", " g", " h"].join("\n")),
    ).hunks[0];
    if (contextOnly === undefined) throw new Error("hunk missing");
    const rows = hunkRows(contextOnly, { before: false, after: false });
    expect(rows.filter((entry) => entry.kind === "line").length).toBeGreaterThan(0);
  });
});

describe("hunkSplitRows (split view)", () => {
  const hunk = parseFileDiff(
    row(
      [
        "@@ -1,6 +1,6 @@",
        " kontext",
        "-alt1",
        "-alt2",
        "+neu1",
        " ende",
        "-letzte",
      ].join("\n"),
    ),
  ).hunks[0];

  it("pairs deletions and additions of one block", () => {
    if (hunk === undefined) throw new Error("hunk missing");
    const rows = hunkSplitRows(hunk, { before: true, after: true });
    // context | (2 deletes ↔ 1 add = 2 rows) | context | delete
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ kind: "pair", left: hunk.lines[0], right: hunk.lines[0] });
    expect(rows[1]).toMatchObject({ left: { text: "alt1" }, right: { text: "neu1" } });
    expect(rows[2]).toMatchObject({ left: { text: "alt2" }, right: null });
    expect(rows[3]).toMatchObject({ left: { text: "ende" }, right: { text: "ende" } });
    expect(rows[4]).toMatchObject({ left: { text: "letzte" }, right: null });
  });

  it("keeps expander rows spanning both sides", () => {
    if (hunk === undefined) throw new Error("hunk missing");
    const parsed = parseFileDiff(
      row(
        [
          "@@ -1,12 +1,12 @@",
          " a",
          " b",
          " c",
          " d",
          "-alt",
          "+neu",
          " e",
          " f",
          " g",
          " h",
          " i",
          " j",
        ].join("\n"),
      ),
    );
    const rows = hunkSplitRows(parsed.hunks[0] ?? hunk, { before: false, after: false });
    expect(rows.filter((entry) => entry.kind === "expand")).toHaveLength(2);
  });
});

describe("summarizeDiff", () => {
  it("sums rows into the session summary", () => {
    expect(
      summarizeDiff([
        row("", { additions: 12, deletions: 3 }),
        row("", { additions: 1, deletions: 0 }),
      ]),
    ).toEqual({ files: 2, additions: 13, deletions: 3 });
  });

  it("returns zeros for an empty change set", () => {
    expect(summarizeDiff([])).toEqual({ files: 0, additions: 0, deletions: 0 });
  });

  it("ignores negative, fractional and non-numeric counts", () => {
    const rows = [
      row("", { additions: -5, deletions: Number.NaN }),
      row("", { additions: 2.7, deletions: Number.POSITIVE_INFINITY }),
      row("", { additions: undefined as unknown as number, deletions: "3" as unknown as number }),
    ];
    expect(summarizeDiff(rows)).toEqual({ files: 3, additions: 2, deletions: 0 });
  });
});

describe("resolveDiffEmptyKind", () => {
  const projects = [
    { id: "p1", vcs: "git" },
    { id: "p2", vcs: "none" },
  ];

  it("reports no git for the session's own repo-less project", () => {
    expect(resolveDiffEmptyKind({ projects, projectKey: "p2" })).toBe("no-git");
  });

  it("reports plain changes for a project with git", () => {
    expect(resolveDiffEmptyKind({ projects, projectKey: "p1" })).toBe("changes");
  });

  it("stays on plain changes for an unknown git marker", () => {
    expect(resolveDiffEmptyKind({ projects: [{ id: "p1", vcs: undefined }], projectKey: "p1" })).toBe(
      "changes",
    );
    expect(resolveDiffEmptyKind({ projects: [{ id: "p1", vcs: { type: "git" } }], projectKey: "p1" })).toBe(
      "changes",
    );
  });

  it("falls back to the whole server when the session key is unknown", () => {
    expect(resolveDiffEmptyKind({ projects: [{ id: "p1", vcs: "none" }], projectKey: null })).toBe("no-git");
    expect(resolveDiffEmptyKind({ projects, projectKey: null })).toBe("changes");
    expect(resolveDiffEmptyKind({ projects: [], projectKey: null })).toBe("changes");
  });

  it("reads the object shape of a newer server payload", () => {
    expect(projectGitState({ type: "git", store: "/repo" })).toBe("git");
    expect(projectGitState({ type: "other" })).toBe("unknown");
    expect(projectGitState("none")).toBe("none");
    expect(projectGitState(undefined)).toBe("unknown");
  });
});
