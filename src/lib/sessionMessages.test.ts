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
          state: {
            status: "completed",
            input: { filePath: "/src/app.ts" },
            content: [{ type: "text", text: "Dateiinhalt" }],
          },
        },
      ],
    });
    expect(message?.role).toBe("assistant");
    expect(message?.parts).toEqual([
      { kind: "text", text: "Antwort" },
      { kind: "reasoning", text: "Überlegung" },
      {
        kind: "tool",
        name: "read",
        status: "completed",
        detail: "Dateiinhalt",
        input: { filePath: "/src/app.ts" },
        metadata: null,
      },
    ]);
    expect(message?.text).toBe("Antwort");
  });

  it("carries state.input and state.metadata of a tool call", () => {
    const message = single({
      type: "assistant",
      id: "a6",
      content: [
        {
          type: "tool",
          id: "t",
          name: "grep",
          state: {
            status: "running",
            input: { pattern: "TODO", path: "/src" },
            metadata: { provider: "anthropic", sessionId: "ses-1" },
          },
        },
      ],
    });
    expect(message?.parts).toEqual([
      {
        kind: "tool",
        name: "grep",
        status: "running",
        detail: null,
        input: { pattern: "TODO", path: "/src" },
        metadata: { provider: "anthropic", sessionId: "ses-1" },
      },
    ]);
  });

  it("parses the streaming state's JSON string input and has no metadata", () => {
    const message = single({
      type: "assistant",
      id: "a7",
      content: [
        {
          type: "tool",
          id: "t",
          name: "bash",
          state: { status: "streaming", input: '{"command":"pnpm test"}' },
        },
      ],
    });
    expect(message?.parts).toEqual([
      {
        kind: "tool",
        name: "bash",
        status: "streaming",
        detail: null,
        input: { command: "pnpm test" },
        metadata: null,
      },
    ]);
  });

  it("accepts the original SDK's tool key alongside name", () => {
    const message = single({
      type: "assistant",
      id: "a8",
      content: [{ type: "tool", id: "t", tool: "edit", state: { status: "completed" } }],
    });
    expect(message?.parts[0]).toMatchObject({ kind: "tool", name: "edit" });
  });

  it("reads the turn duration from time.created/time.completed", () => {
    const message = single({
      type: "assistant",
      id: "a9",
      time: { created: 1000, completed: 4500 },
      content: [{ type: "text", text: "Fertig" }],
    });
    expect(message?.durationMs).toBe(3500);

    const stillRunning = single({
      type: "assistant",
      id: "a10",
      time: { created: 1000 },
      content: [{ type: "text", text: "Läuft" }],
    });
    expect(stillRunning?.durationMs).toBeNull();
  });

  it("maps running tools without detail and error tools with message", () => {
    const running = single({
      type: "assistant",
      id: "a2",
      content: [{ type: "tool", id: "t", name: "bash", state: { status: "running" } }],
    });
    expect(running?.parts).toEqual([
      { kind: "tool", name: "bash", status: "running", detail: null, input: {}, metadata: null },
    ]);
    expect(running?.text).toBe("bash");

    const failed = single({
      type: "assistant",
      id: "a3",
      content: [
        {
          type: "tool",
          id: "t",
          name: "bash",
          state: { status: "error", input: { command: "ls" }, error: { type: "x", message: "Boom" } },
        },
      ],
    });
    expect(failed?.parts).toEqual([
      {
        kind: "tool",
        name: "bash",
        status: "error",
        detail: "Boom",
        input: { command: "ls" },
        metadata: null,
      },
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
      { kind: "tool", name: "read", status: "completed", detail: "a.png", input: {}, metadata: null },
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
    expect(running?.parts).toEqual([]);

    const done = single({ type: "compaction", id: "c2", status: "completed", summary: "Kurz" });
    expect(done?.text).toBe("Kurz");

    const idle = single({ type: "idle", id: "i1", outcome: "succeeded" });
    expect(idle).toMatchObject({ role: "note", noteKind: "idle", noteDetail: "succeeded" });
  });

  it("maps the real agent-switched discriminator to a note", () => {
    const message = single({
      type: "agent-switched",
      id: "g1",
      agent: "coder",
      previous: "ask",
      time: { created: 900 },
    });
    expect(message).toMatchObject({
      role: "note",
      noteKind: "agent",
      text: "coder",
      noteDetail: "ask",
    });
    expect(message?.parts.some((part) => part.kind === "unknown")).toBe(false);
  });

  it("maps the real model-switched discriminator to a note", () => {
    const message = single({
      type: "model-switched",
      id: "g2",
      model: { id: "sonnet", providerID: "anthropic" },
      time: { created: 900 },
    });
    expect(message).toMatchObject({ role: "note", noteKind: "model", text: "anthropic/sonnet" });
    expect(message?.parts.some((part) => part.kind === "unknown")).toBe(false);
  });

  it("tolerates the legacy agent-selected / model-selected spellings", () => {
    expect(single({ type: "agent-selected", id: "g", agent: "coder" })?.noteKind).toBe("agent");
    expect(single({ type: "agent-selected", id: "g", agent: "coder" })?.text).toBe("coder");
    expect(
      single({ type: "model-selected", id: "m", model: { id: "sonnet", providerID: "anthropic" } })
        ?.noteKind,
    ).toBe("model");
    expect(
      single({ type: "model-selected", id: "m", model: { id: "sonnet", providerID: "anthropic" } })
        ?.text,
    ).toBe("anthropic/sonnet");
  });

  it("maps location-switched to a note", () => {
    expect(
      single({ type: "location-switched", id: "l", location: { directory: "/repo" } })?.noteKind,
    ).toBe("location");
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

  it("treats the legacy spellings as known, never as unknown", () => {
    for (const type of ["agent-selected", "model-selected"]) {
      const message = single({ type, id: "legacy", agent: "coder" });
      expect(message?.noteKind).not.toBe("unknown");
    }
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

describe("chat chrome meta (agent · model · duration)", () => {
  it("carries the agent and model of a message that declares them", () => {
    const message = single({
      type: "assistant",
      id: "a1",
      agent: "coder",
      model: { id: "sonnet", providerID: "anthropic" },
      time: { created: 1000, completed: 1200 },
      content: [{ type: "text", text: "Hallo" }],
    });
    expect(message).toMatchObject({
      agent: "coder",
      model: "anthropic/sonnet",
      durationMs: 200,
    });
  });

  it("lets later messages inherit the agent/model seen before them", () => {
    const rows = parseSessionMessages(
      {
        data: [
          {
            type: "assistant",
            id: "a1",
            agent: "coder",
            model: { id: "sonnet", providerID: "anthropic" },
            content: [{ type: "text", text: "Antwort" }],
          },
          { type: "user", id: "u1", text: "Und jetzt?" },
          { type: "agent-switched", id: "n1", agent: "review" },
          { type: "user", id: "u2", text: "Bitte prüfen" },
          {
            type: "model-switched",
            id: "n2",
            model: { id: "haiku", providerID: "anthropic" },
          },
          { type: "user", id: "u3", text: "Danke" },
        ],
      },
      NOW,
    );
    expect(rows.map((row) => row.agent)).toEqual([
      "coder",
      "coder",
      "review",
      "review",
      "review",
      "review",
    ]);
    expect(rows.map((row) => row.model)).toEqual([
      "anthropic/sonnet",
      "anthropic/sonnet",
      "anthropic/sonnet",
      "anthropic/sonnet",
      "anthropic/haiku",
      "anthropic/haiku",
    ]);
  });

  it("leaves agent/model null when the session never sent them", () => {
    const message = single({ type: "user", id: "u1", text: "Hallo" });
    expect(message).toMatchObject({ agent: null, model: null, durationMs: null });
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

describe("parseSessionMessages V2 union coverage", () => {
  const at = (created: number) => ({ created });

  function single(entry: unknown) {
    const messages = parseSessionMessages({ data: [entry] });
    expect(messages).toHaveLength(1);
    return messages[0];
  }

  it("maps user text plus file attachments", () => {
    const message = single({
      type: "user",
      id: "u1",
      text: "Hallo",
      files: [{ uri: "file:///src/app.ts", name: "app.ts" }],
      time: at(1000),
    });
    expect(message?.role).toBe("user");
    expect(message?.parts.some((part) => part.kind === "text")).toBe(true);
    expect(message?.parts.some((part) => part.kind === "files")).toBe(true);
    expect(message?.parts.some((part) => part.kind === "unknown")).toBe(false);
  });

  it("maps assistant text, reasoning and tool content", () => {
    const message = single({
      type: "assistant",
      id: "a1",
      content: [
        { type: "text", text: "Antwort" },
        { type: "reasoning", text: "Überlegung" },
        {
          type: "tool",
          id: "t1",
          name: "read",
          state: { status: "completed", input: { filePath: "/src/x.ts" } },
        },
        { type: "file", uri: "file:///src/x.ts", name: "x.ts" },
      ],
      time: at(2000),
    });
    expect(message?.role).toBe("assistant");
    const kinds = message?.parts.map((part) => part.kind) ?? [];
    expect(kinds).toContain("text");
    expect(kinds).toContain("reasoning");
    expect(kinds).toContain("tool");
    expect(kinds).toContain("files");
    expect(kinds).not.toContain("unknown");
  });

  it("maps system and synthetic notes with their text", () => {
    for (const type of ["system", "synthetic"] as const) {
      const message = single({ type, id: `${type}-1`, text: "Hinweis", time: at(3000) });
      expect(message?.role).toBe("note");
      expect(message?.noteKind).toBe(type);
      expect(message?.parts).toHaveLength(1);
      expect(message?.parts[0]?.kind).toBe("text");
    }
  });

  it("maps skill notes with name and text", () => {
    const message = single({
      type: "skill",
      id: "s1",
      name: "commit",
      text: "Skill geladen",
      time: at(3000),
    });
    expect(message?.noteKind).toBe("skill");
    expect(message?.parts.some((part) => part.kind === "unknown")).toBe(false);
  });

  it("maps shell notes with command summary and output", () => {
    const message = single({
      type: "shell",
      id: "sh1",
      command: "pnpm test",
      status: "done",
      output: { output: "ok\n" },
      time: at(3000),
    });
    expect(message?.noteKind).toBe("shell");
    expect(message?.parts.some((part) => part.kind === "text")).toBe(true);
    expect(message?.parts.some((part) => part.kind === "unknown")).toBe(false);
  });

  it("maps compaction with and without content to zero unknown parts", () => {
    const full = single({
      type: "compaction",
      id: "c1",
      status: "completed",
      summary: "Kurzfassung",
      time: at(4000),
    });
    expect(full?.noteKind).toBe("compaction");
    expect(full?.noteDetail).toBe("completed");
    expect(full?.parts.some((part) => part.kind === "unknown")).toBe(false);

    const bare = single({ type: "compaction", id: "c2", status: "running", time: at(4000) });
    expect(bare?.noteKind).toBe("compaction");
    expect(bare?.parts).toHaveLength(0);
  });

  it("maps every idle outcome to a bare status note without unknown parts", () => {
    for (const outcome of ["succeeded", "failed", "interrupted"]) {
      const message = single({ type: "idle", id: `i-${outcome}`, outcome, time: at(5000) });
      expect(message?.role).toBe("note");
      expect(message?.noteKind).toBe("idle");
      expect(message?.noteDetail).toBe(outcome);
      expect(message?.parts).toHaveLength(0);
      expect(message?.parts.some((part) => part.kind === "unknown")).toBe(false);
    }
  });

  it("maps agent, model and location switches", () => {
    const agent = single({ type: "agent-switched", id: "g1", agent: "coder", time: at(1000) });
    expect(agent?.noteKind).toBe("agent");
    expect(agent?.parts.some((part) => part.kind === "unknown")).toBe(false);

    const model = single({
      type: "model-switched",
      id: "g2",
      model: { id: "sonnet", providerID: "anthropic" },
      time: at(1000),
    });
    expect(model?.noteKind).toBe("model");
    expect(model?.parts.some((part) => part.kind === "unknown")).toBe(false);

    const location = single({
      type: "location-switched",
      id: "g3",
      location: { directory: "/tmp/repo" },
      time: at(1000),
    });
    expect(location?.noteKind).toBe("location");
    expect(location?.parts.some((part) => part.kind === "unknown")).toBe(false);
  });

  it("covers every member of the real union with its own rendering", () => {
    const union: Array<{ type: string; entry: Record<string, unknown>; noteKind?: string }> = [
      { type: "user", entry: { text: "Frage" } },
      {
        type: "assistant",
        entry: { agent: "coder", content: [{ type: "text", text: "Antwort" }] },
      },
      { type: "system", entry: { text: "System" }, noteKind: "system" },
      { type: "synthetic", entry: { text: "Synthese" }, noteKind: "synthetic" },
      { type: "skill", entry: { name: "review", text: "Skill" }, noteKind: "skill" },
      { type: "shell", entry: { command: "ls", status: "exited" }, noteKind: "shell" },
      { type: "agent-switched", entry: { agent: "coder" }, noteKind: "agent" },
      {
        type: "model-switched",
        entry: { model: { id: "sonnet", providerID: "anthropic" } },
        noteKind: "model",
      },
      {
        type: "location-switched",
        entry: { location: { directory: "/repo" } },
        noteKind: "location",
      },
      { type: "compaction", entry: { status: "completed", summary: "Kurz" }, noteKind: "compaction" },
    ];
    for (const member of union) {
      const message = single({ type: member.type, id: member.type, ...member.entry });
      expect(message?.parts.some((part) => part.kind === "unknown")).toBe(false);
      if (member.noteKind !== undefined) {
        expect(message?.role).toBe("note");
        expect(message?.noteKind).toBe(member.noteKind);
      } else {
        expect(message?.role).toBe(member.type);
      }
    }
  });

  it("keeps the unknown fallback for truly foreign types only", () => {
    const foreign = single({
      type: "future-thing",
      id: "f1",
      payload: { deep: [1] },
      time: at(6000),
    });
    expect(foreign?.role).toBe("note");
    expect(foreign?.noteKind).toBe("unknown");
    expect(foreign?.parts.some((part) => part.kind === "unknown")).toBe(true);
  });

  it("keeps parsing legacy role/text rows and info/parts envelopes", () => {
    const legacy = single({ id: "l1", role: "user", text: "Alt" });
    expect(legacy?.role).toBe("user");

    const wrapped = single({
      info: { type: "assistant", id: "w1" },
      parts: [{ type: "text", text: "Eingehüllt" }],
    });
    expect(wrapped?.role).toBe("assistant");
    expect(wrapped?.parts.some((part) => part.kind === "unknown")).toBe(false);
  });
});
