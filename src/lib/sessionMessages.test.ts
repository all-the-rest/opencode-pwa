import { describe, expect, it } from "vitest";
import { formatChatTime, parseSessionMessages } from "./sessionMessages.ts";

const NOW = 1_700_000_000_000;

function single(entry: unknown) {
  return parseSessionMessages({ data: [entry] }, NOW)[0];
}

describe("parseSessionMessages envelopes", () => {
  it("supports { data }, { messages } and plain arrays, oldest first", () => {
    const user = { type: "user", id: "u1", text: "Hallo", time: { created: 100 } };
    expect(parseSessionMessages({ data: [user] }, NOW)).toHaveLength(1);
    expect(parseSessionMessages({ messages: [user] }, NOW)).toHaveLength(1);
    expect(parseSessionMessages([user], NOW)).toHaveLength(1);
    const ordered = parseSessionMessages({ data: [user, { ...user, id: "u2" }] }, NOW);
    expect(ordered.map((m) => m.id)).toEqual(["u1", "u2"]);
  });

  it("returns an empty list for unknown shapes", () => {
    expect(parseSessionMessages(null, NOW)).toEqual([]);
    expect(parseSessionMessages({ data: "nope" }, NOW)).toEqual([]);
    expect(parseSessionMessages({}, NOW)).toEqual([]);
  });

  it("derives recency from payload order without timestamps", () => {
    const rows = parseSessionMessages(
      { data: [{ type: "user", id: "a", text: "x" }, { type: "user", id: "b", text: "y" }] },
      NOW,
    );
    expect(rows[0]?.created).toBeLessThan(rows[1]?.created ?? 0);
    expect(rows[1]?.created).toBe(NOW);
  });
});

describe("user messages", () => {
  it("parses text with timestamp and id variants", () => {
    const message = single({
      type: "user",
      messageID: "m1",
      text: "Hallo **Welt**",
      time: { created: 123 },
    });
    expect(message).toMatchObject({ id: "m1", role: "user", noteKind: null, created: 123 });
    expect(message?.parts).toEqual([{ kind: "text", text: "Hallo **Welt**" }]);
    expect(message?.text).toBe("Hallo **Welt**");
  });

  it("collects file attachments as a files part", () => {
    const message = single({
      type: "user",
      id: "m2",
      text: "Schau hier",
      files: [{ uri: "file:///src/app.ts", name: "app.ts" }, "notizen.md"],
    });
    expect(message?.role).toBe("user");
    expect(message?.parts).toContainEqual({ kind: "files", files: ["app.ts", "notizen.md"] });
  });

  it("keeps legacy { id, role, text } entries working", () => {
    const message = single({ id: "alt", role: "user", text: "Alttext" });
    expect(message).toMatchObject({ id: "alt", role: "user", text: "Alttext" });
    expect(message?.parts).toEqual([{ kind: "text", text: "Alttext" }]);
  });
});

describe("assistant messages", () => {
  it("parses text, reasoning and tool content parts", () => {
    const message = single({
      type: "assistant",
      id: "a1",
      time: { created: 200 },
      content: [
        { type: "text", text: "Antwort" },
        { type: "reasoning", text: "Überlegung" },
        {
          type: "tool",
          id: "t1",
          name: "read",
          state: { status: "completed", content: [{ type: "text", text: "Dateiinhalt" }] },
        },
      ],
    });
    expect(message?.role).toBe("assistant");
    expect(message?.parts).toEqual([
      { kind: "text", text: "Antwort" },
      { kind: "reasoning", text: "Überlegung" },
      { kind: "tool", name: "read", status: "completed", detail: "Dateiinhalt" },
    ]);
    expect(message?.text).toBe("Antwort");
  });

  it("maps running tools without detail and error tools with message", () => {
    const running = single({
      type: "assistant",
      id: "a2",
      content: [{ type: "tool", id: "t", name: "bash", state: { status: "running" } }],
    });
    expect(running?.parts).toEqual([{ kind: "tool", name: "bash", status: "running", detail: null }]);
    expect(running?.text).toBe("bash");

    const failed = single({
      type: "assistant",
      id: "a3",
      content: [
        {
          type: "tool",
          id: "t",
          name: "bash",
          state: { status: "error", error: { type: "x", message: "Boom" } },
        },
      ],
    });
    expect(failed?.parts).toEqual([
      { kind: "tool", name: "bash", status: "error", detail: "Boom" },
    ]);
  });

  it("summarizes file tool output by name and degrades empty content", () => {
    const fileTool = single({
      type: "assistant",
      id: "a4",
      content: [
        {
          type: "tool",
          id: "t",
          name: "read",
          state: {
            status: "completed",
            content: [{ type: "file", uri: "file:///a.png", mime: "image/png" }],
          },
        },
      ],
    });
    expect(fileTool?.parts).toEqual([
      { kind: "tool", name: "read", status: "completed", detail: "a.png" },
    ]);

    const empty = single({ type: "assistant", id: "a5", content: [] });
    expect(empty?.parts).toEqual([{ kind: "unknown" }]);
    expect(empty?.text).toBe("");
  });

  it("keeps legacy assistant entries working", () => {
    const message = single({ id: "alt", role: "assistant", content: "Hi" });
    expect(message).toMatchObject({ role: "assistant", text: "Hi" });
  });
});

describe("notes (system, idle, compaction and friends)", () => {
  it("renders system, synthetic and skill as notes, never bubbles", () => {
    for (const [type, noteKind] of [
      ["system", "system"],
      ["synthetic", "synthetic"],
    ] as const) {
      const message = single({ type, id: `${type}-1`, text: "Hinweis", time: { created: 5 } });
      expect(message).toMatchObject({ role: "note", noteKind, text: "Hinweis" });
    }
    const skill = single({ type: "skill", id: "s", skill: "review", name: "Review", text: "Los" });
    expect(skill).toMatchObject({ role: "note", noteKind: "skill" });
    expect(skill?.text).toContain("Review");
    expect(skill?.text).toContain("Los");
  });

  it("summarizes shell output without dumping it", () => {
    const message = single({
      type: "shell",
      id: "sh",
      command: "pnpm test",
      status: "exited",
      exit: 0,
      output: { output: "ok", cursor: 2, size: 2, truncated: false },
    });
    expect(message?.role).toBe("note");
    expect(message?.noteKind).toBe("shell");
    expect(message?.text).toContain("pnpm test");
    expect(message?.text).toContain("0");
    expect(message?.parts).toHaveLength(2);
  });

  it("carries compaction status and summary, idle outcome", () => {
    const running = single({ type: "compaction", id: "c1", status: "running" });
    expect(running).toMatchObject({ role: "note", noteKind: "compaction", noteDetail: "running" });
    expect(running?.parts).toEqual([{ kind: "unknown" }]);

    const done = single({ type: "compaction", id: "c2", status: "completed", summary: "Kurz" });
    expect(done?.text).toBe("Kurz");

    const idle = single({ type: "idle", id: "i1", outcome: "succeeded" });
    expect(idle).toMatchObject({ role: "note", noteKind: "idle", noteDetail: "succeeded" });
  });

  it("summarizes agent, model and location switches", () => {
    expect(
      single({ type: "agent-selected", id: "g", agent: "coder" })?.text,
    ).toBe("coder");
    expect(
      single({
        type: "model-selected",
        id: "m",
        model: { id: "sonnet", providerID: "anthropic" },
      })?.text,
    ).toBe("anthropic/sonnet");
    expect(
      single({ type: "location-switched", id: "l", location: { directory: "/repo" } })?.text,
    ).toBe("/repo");
  });
});

describe("unknown and malformed entries", () => {
  it("degrades future types to a small unknown note, never a JSON dump", () => {
    const message = single({
      type: "quantum-entanglement",
      id: "q1",
      payload: { deep: { nested: [1, 2, 3] } },
    });
    expect(message?.role).toBe("note");
    expect(message?.noteKind).toBe("unknown");
    expect(message?.parts).toEqual([{ kind: "unknown" }]);
    expect(message?.text).toBe("");
  });

  it("tolerates { info, parts } envelopes without guessing types", () => {
    const message = single({
      info: { id: "w1", role: "assistant", type: "assistant" },
      parts: [
        { type: "text", text: "Hallo" },
        { type: "teleport", target: "mars" },
      ],
    });
    expect(message).toMatchObject({ id: "w1", role: "assistant", text: "Hallo" });
    expect(message?.parts).toEqual([{ kind: "text", text: "Hallo" }, { kind: "unknown" }]);
  });

  it("handles primitives and null without crashing", () => {
    const rows = parseSessionMessages({ data: ["Hallo", 42, null, { odd: true }] }, NOW);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ role: "note", text: "Hallo" });
    expect(rows[2]?.parts).toEqual([{ kind: "unknown" }]);
    expect(rows[3]?.parts).toEqual([{ kind: "unknown" }]);
    for (const row of rows) {
      expect(JSON.stringify(row)).not.toContain("odd");
    }
  });

  it("falls back to generated ids for entries without one", () => {
    const rows = parseSessionMessages({ data: [{}, { type: "user" }] }, NOW);
    expect(rows[0]?.id).toBe("nachricht-0");
    expect(rows[1]?.id).toBe("nachricht-1");
  });
});

describe("formatChatTime", () => {
  it("formats in German locale and guards invalid input", () => {
    const formatted = formatChatTime(Date.UTC(2026, 9, 8, 12, 30));
    expect(formatted).toMatch(/08\.10\./);
    expect(formatted).toMatch(/12:30/);
    expect(formatChatTime(Number.NaN)).toBe("");
  });
});
