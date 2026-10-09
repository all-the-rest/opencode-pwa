import { describe, expect, it } from "vitest";
import {
  CONTEXT_GROUP_TOOLS,
  HIDDEN_TOOLS,
  MAX_ARG_CHARS,
  canonicalToolName,
  getToolInfo,
  isContextGroupTool,
  isEditTool,
  isHiddenTool,
} from "./toolInfo.ts";

describe("getToolInfo labels and subtitles", () => {
  it("maps the original's tools to icon, label key and subtitle", () => {
    const read = getToolInfo("read", { filePath: "/src/app.ts" });
    expect(read.labelKey).toBe("read");
    expect(read.icon).toBe("glasses");
    expect(read.subtitle).toBe("/src/app.ts");

    const list = getToolInfo("list", { path: "/src" });
    expect(list.labelKey).toBe("list");
    expect(list.subtitle).toBe("/src");

    const glob = getToolInfo("glob", { pattern: "**/*.ts" });
    expect(glob.labelKey).toBe("glob");
    expect(glob.subtitle).toBe("**/*.ts");

    const grep = getToolInfo("grep", { pattern: "TODO" });
    expect(grep.labelKey).toBe("grep");
    expect(grep.subtitle).toBe("TODO");

    const bash = getToolInfo("bash", { command: "pnpm test" });
    expect(bash.labelKey).toBe("shell");
    expect(bash.subtitle).toBe("pnpm test");

    const shell = getToolInfo("shell", { command: "ls" });
    expect(shell.labelKey).toBe("shell");

    const edit = getToolInfo("edit", { filePath: "/src/app.ts" });
    expect(edit.labelKey).toBe("edit");
    expect(edit.icon).toBe("edit");

    const write = getToolInfo("write", { filePath: "/src/new.ts" });
    expect(write.labelKey).toBe("write");

    const webfetch = getToolInfo("webfetch", { url: "https://example.com" });
    expect(webfetch.labelKey).toBe("webfetch");
    expect(webfetch.subtitle).toBe("https://example.com");

    const websearch = getToolInfo("websearch", { query: "opencode" });
    expect(websearch.labelKey).toBe("websearch");
    expect(websearch.subtitle).toBe("opencode");

    const task = getToolInfo("task", { subagent_type: "explore", description: "Suche Helper" });
    expect(task.labelKey).toBe("task");
    expect(task.subtitle).toBe("Suche Helper");
    // Real payloads of the owner's server carry `subagent` tool calls.
    const subagent = getToolInfo("subagent", { agent: "explore", description: "Quellen durchsuchen" });
    expect(subagent.labelKey).toBe("subagent");
    expect(subagent.icon).toBe("task");
    expect(subagent.subtitle).toBe("Quellen durchsuchen");

    const skill = getToolInfo("skill", { name: "commit" });
    expect(skill.labelKey).toBe("skill");
    expect(skill.subtitle).toBe("commit");
  });

  it("reads the websearch provider from state.metadata", () => {
    const info = getToolInfo("websearch", { query: "x" }, { provider: "exa" });
    expect(info.provider).toBe("exa");
    expect(getToolInfo("read", {}, { provider: "exa" }).provider).toBeNull();
    expect(getToolInfo("websearch", {}, null).provider).toBeNull();
  });

  it("returns no subtitle when the expected input keys are missing", () => {
    expect(getToolInfo("read", {}).subtitle).toBeNull();
    expect(getToolInfo("grep", {}).subtitle).toBeNull();
    expect(getToolInfo("bash", {}).subtitle).toBeNull();
    expect(getToolInfo("todowrite", { todos: [] }).subtitle).toBeNull();
  });

  it("keeps unknown tools rendering with their name and a best-effort subtitle", () => {
    const info = getToolInfo("banana", { filePath: "/src/x.ts", sessionID: "ses-1" });
    expect(info.labelKey).toBeNull();
    expect(info.icon).toBe("tool");
    expect(info.subtitle).toBe("/src/x.ts");
    expect(info.args).toEqual(["filePath=/src/x.ts"]);
    expect(info.changes).toBeNull();

    const bare = getToolInfo("banana");
    expect(bare.subtitle).toBeNull();
    expect(bare.args).toEqual([]);
  });
});

describe("argument chips", () => {
  it("renders key=value chips for read/grep/glob arguments", () => {
    expect(getToolInfo("read", { filePath: "/a.ts", offset: 10, limit: 20 }).args).toEqual([
      "offset=10",
      "limit=20",
    ]);
    expect(getToolInfo("grep", { pattern: "TODO", include: "*.ts" }).args).toEqual([
      "pattern=TODO",
      "include=*.ts",
    ]);
    expect(getToolInfo("glob", { pattern: "**/*.ts" }).args).toEqual(["pattern=**/*.ts"]);
    expect(getToolInfo("edit", { filePath: "/a.ts", oldString: "x" }).args).toEqual([]);
  });

  it("truncates long values and skips non-primitives", () => {
    const long = "x".repeat(MAX_ARG_CHARS + 10);
    const chips = getToolInfo("read", { offset: long }).args;
    expect(chips[0]?.length).toBe(`offset=`.length + MAX_ARG_CHARS + 1);
    expect(chips[0]?.endsWith("…")).toBe(true);
    expect(getToolInfo("banana", { nested: { a: 1 } }).args).toEqual([]);
    expect(getToolInfo("banana", { flag: true, count: 3 }).args).toEqual([
      "flag=true",
      "count=3",
    ]);
  });
});

describe("change badges", () => {
  it("counts added/removed lines of edit calls", () => {
    const info = getToolInfo("edit", { filePath: "/a.ts", oldString: "a\nb", newString: "a\nb\nc" });
    expect(info.changes).toEqual({ additions: 3, deletions: 2 });
  });

  it("counts written lines for write calls", () => {
    expect(getToolInfo("write", { filePath: "/a.ts", content: "a\nb\n" }).changes).toEqual({
      additions: 3,
      deletions: 0,
    });
  });

  it("stays null without usable input", () => {
    expect(getToolInfo("edit", {}).changes).toBeNull();
    expect(getToolInfo("write", {}).changes).toBeNull();
    expect(getToolInfo("read", { filePath: "/a.ts" }).changes).toBeNull();
  });
});

describe("tool groups", () => {
  it("folds read/glob/grep/list into the context group", () => {
    for (const name of ["read", "glob", "grep", "list"]) {
      expect(isContextGroupTool(name)).toBe(true);
      expect(CONTEXT_GROUP_TOOLS.has(name)).toBe(true);
    }
    for (const name of ["bash", "edit", "write", "task", "banana"]) {
      expect(isContextGroupTool(name)).toBe(false);
    }
  });

  it("hides todowrite like the original", () => {
    expect(isHiddenTool("todowrite")).toBe(true);
    expect(HIDDEN_TOOLS.has("todowrite")).toBe(true);
    expect(isHiddenTool("read")).toBe(false);
  });

  it("marks edit-type tools", () => {
    expect(isEditTool("edit")).toBe(true);
    expect(isEditTool("write")).toBe(true);
    expect(isEditTool("read")).toBe(false);
    expect(isEditTool("banana")).toBe(false);
  });
});

describe("canonicalToolName", () => {
  it("resolves the apply_patch alias", () => {
    expect(canonicalToolName("apply_patch")).toBe("patch");
    expect(canonicalToolName("patch")).toBe("patch");
    expect(canonicalToolName("read")).toBe("read");
    expect(getToolInfo("apply_patch", { files: ["/a.ts", "/b.ts"] }).labelKey).toBe("patch");
    expect(getToolInfo("apply_patch", { files: ["/a.ts", "/b.ts"] }).fileCount).toBe(2);
  });
});
