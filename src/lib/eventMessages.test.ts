import { describe, expect, it } from "vitest";
import {
  extractContentUpdateMessage,
  extractMessageFromEvent,
  extractStreamDelta,
  foldDeltaIntoParts,
  foldStreamDelta,
  latestSessionMeta,
  readEventSessionID,
  readEventType,
  type StreamDelta,
} from "./eventMessages.ts";
import { mergeMessageLists, toCachedMessages, type CachedMessage } from "./messageCache.ts";
import type { ChatPart } from "./sessionMessages.ts";

describe("readEventType / readEventSessionID", () => {
  it("reads type and session id from data envelopes", () => {
    const event = { type: "session.idle", data: { sessionID: "abcdef123456" } };
    expect(readEventType(event)).toBe("session.idle");
    expect(readEventSessionID(event)).toBe("abcdef123456");
  });

  it("returns null for malformed payloads", () => {
    expect(readEventType(null)).toBeNull();
    expect(readEventType({})).toBeNull();
    expect(readEventSessionID(null)).toBeNull();
    expect(readEventSessionID({ type: "session.idle" })).toBeNull();
  });
});

describe("extractMessageFromEvent", () => {
  it("extracts nested data.message payloads", () => {
    const event = {
      type: "message.created",
      data: {
        sessionID: "session-1",
        message: { id: "msg-7", role: "assistant", text: "Hallo Welt" },
      },
    };
    expect(extractMessageFromEvent(event, 1234)).toEqual({
      sessionID: "session-1",
      messageID: "msg-7",
      role: "assistant",
      text: "Hallo Welt",
      created: 1234,
      noteKind: null,
      noteDetail: null,
      parts: [{ kind: "text", text: "Hallo Welt" }],
      agent: null,
      model: null,
      durationMs: null,
    });
  });

  it("extracts flat data payloads with content fallback", () => {
    const event = {
      type: "message.updated",
      data: { sessionID: "session-2", id: "msg-1", role: "user", content: "Frage" },
    };
    expect(extractMessageFromEvent(event, 50)).toMatchObject({
      sessionID: "session-2",
      messageID: "msg-1",
      role: "user",
      text: "Frage",
      parts: [{ kind: "text", text: "Frage" }],
    });
  });

  it("parses real V2 assistant events with tool parts", () => {
    const event = {
      type: "message.created",
      data: {
        sessionID: "session-3",
        message: {
          type: "assistant",
          id: "a-1",
          time: { created: 99 },
          content: [
            { type: "text", text: "Fertig" },
            {
              type: "tool",
              id: "t-1",
              name: "bash",
              state: { status: "completed", content: [{ type: "text", text: "ok" }] },
            },
          ],
        },
      },
    };
    expect(extractMessageFromEvent(event, 100)).toMatchObject({
      sessionID: "session-3",
      messageID: "a-1",
      role: "assistant",
      text: "Fertig",
      parts: [
        { kind: "text", text: "Fertig" },
        { kind: "tool", name: "bash", status: "completed", detail: "ok" },
      ],
    });
  });

  it("ignores non-message events and malformed payloads", () => {
    expect(extractMessageFromEvent({ type: "session.idle", data: { sessionID: "s" } })).toBeNull();
    expect(extractMessageFromEvent({ type: "session.text.delta" })).toBeNull();
    expect(extractMessageFromEvent(null)).toBeNull();
    expect(extractMessageFromEvent({ type: "message.created", data: {} })).toBeNull();
    expect(
      extractMessageFromEvent({ type: "message.created", data: { sessionID: "s" } }),
    ).toBeNull();
  });

  it("never mis-parses content.updated into a note (returns null here)", () => {
    // Regression: `content.updated` carries `messageID`, which used to lure the
    // generic extractor into a bogus "Unbekannter Inhalt" note that was then
    // persisted as final. It must be handled exclusively via
    // extractContentUpdateMessage, never here.
    const event = {
      type: "session.message.content.updated",
      created: 500,
      data: {
        sessionID: "s",
        messageID: "a-1",
        content: [{ type: "text", text: "Hallo" }],
      },
    };
    expect(extractMessageFromEvent(event)).toBeNull();
  });
});

describe("extractContentUpdateMessage", () => {
  it("maps data.content through the assistant builder, keyed by messageID", () => {
    const event = {
      type: "session.message.content.updated",
      created: 777,
      data: {
        sessionID: "session-9",
        messageID: "asst-1",
        content: [
          { type: "text", text: "Erste " },
          { type: "reasoning", text: "nachgedacht" },
          { type: "tool", id: "t1", name: "read", state: { status: "running", input: { filePath: "/a.ts" } } },
        ],
      },
    };
    expect(extractContentUpdateMessage(event)).toMatchObject({
      sessionID: "session-9",
      messageID: "asst-1",
      role: "assistant",
      created: 777,
      parts: [
        { kind: "text", text: "Erste " },
        { kind: "reasoning", text: "nachgedacht" },
        { kind: "tool", name: "read", status: "running" },
      ],
    });
  });

  it("grows the same assistant message across repeated snapshots", () => {
    const first = extractContentUpdateMessage({
      type: "session.message.content.updated",
      created: 10,
      data: { sessionID: "s", messageID: "a", content: [{ type: "text", text: "Hallo" }] },
    });
    const second = extractContentUpdateMessage({
      type: "session.message.content.updated",
      created: 20,
      data: { sessionID: "s", messageID: "a", content: [{ type: "text", text: "Hallo Welt" }] },
    });
    expect(first?.messageID).toBe("a");
    expect(second?.messageID).toBe("a");
    expect(first?.text).toBe("Hallo");
    expect(second?.text).toBe("Hallo Welt");
  });

  it("returns null for non-content-update events, missing ids and empty content", () => {
    expect(extractContentUpdateMessage({ type: "message.updated", data: { sessionID: "s" } })).toBeNull();
    expect(extractContentUpdateMessage(null)).toBeNull();
    expect(
      extractContentUpdateMessage({
        type: "session.message.content.updated",
        data: { messageID: "a", content: [{ type: "text", text: "x" }] },
      }),
    ).toBeNull();
    expect(
      extractContentUpdateMessage({
        type: "session.message.content.updated",
        data: { sessionID: "s", messageID: "a", content: [] },
      }),
    ).toBeNull();
  });

  it("carries the session agent/model forward when the snapshot declares none", () => {
    // The streaming bubble's `agent · model` header must not be empty until
    // the full message arrives: the previous turn's meta fills the gap.
    const event = {
      type: "session.message.content.updated",
      created: 40,
      data: { sessionID: "s", messageID: "a-2", content: [{ type: "text", text: "läuft" }] },
    };
    expect(
      extractContentUpdateMessage(event, 40, { agent: "coder", model: "anthropic/claude" }),
    ).toMatchObject({ agent: "coder", model: "anthropic/claude" });
    // Without a fallback the meta stays empty (previous behaviour).
    expect(extractContentUpdateMessage(event, 40)).toMatchObject({ agent: null, model: null });
  });

  it("keeps a snapshot's own agent/model over the fallback", () => {
    const event = {
      type: "session.message.content.updated",
      created: 50,
      data: {
        sessionID: "s",
        messageID: "a-3",
        agent: "plan",
        model: { providerID: "openai", modelID: "gpt" },
        content: [{ type: "text", text: "Fertig" }],
      },
    };
    expect(extractContentUpdateMessage(event, 50, { agent: "coder", model: "anthropic/claude" })).toMatchObject({
      agent: "plan",
      model: "openai/gpt",
    });
  });
});

describe("latestSessionMeta", () => {
  it("takes the newest message that declares an agent or model", () => {
    expect(
      latestSessionMeta([
        { agent: null, model: null },
        { agent: null, model: null },
        { agent: "plan", model: "openai/gpt" },
        { agent: "coder", model: "anthropic/claude" },
      ]),
    ).toEqual({ agent: "plan", model: "openai/gpt" });
  });

  it("falls back to empty meta when nothing declares one", () => {
    expect(latestSessionMeta([{ agent: null, model: null }])).toEqual({ agent: null, model: null });
    expect(latestSessionMeta([])).toEqual({ agent: null, model: null });
  });
});

// ---------------------------------------------------------------------------
// Streaming deltas (session.text.delta / session.reasoning.delta /
// session.tool.input.delta)
// ---------------------------------------------------------------------------

function textDelta(
  messageID: string,
  ordinal: number,
  delta: string,
  created: number | null = null,
): StreamDelta {
  return { kind: "text", sessionID: "ses", messageID, ordinal, callID: null, delta, created };
}

function reasoningDelta(
  messageID: string,
  ordinal: number,
  delta: string,
  created: number | null = null,
): StreamDelta {
  return { kind: "reasoning", sessionID: "ses", messageID, ordinal, callID: null, delta, created };
}

function toolInputDelta(
  messageID: string,
  callID: string,
  delta: string,
  created: number | null = null,
): StreamDelta {
  return { kind: "tool-input", sessionID: "ses", messageID, ordinal: null, callID, delta, created };
}

function streamRow(id: string, parts: ChatPart[], created = 100): CachedMessage {
  const [row] = toCachedMessages("srv", "ses", [
    {
      id,
      role: "assistant",
      text: "",
      created,
      noteKind: null,
      noteDetail: null,
      parts,
      agent: null,
      model: null,
      durationMs: null,
    },
  ]);
  if (row === undefined) throw new Error("fixture");
  return row;
}

describe("extractStreamDelta", () => {
  it("reads the verified session.text.delta envelope", () => {
    // Field names verified in the installed client (types.d.ts 1505-1519).
    expect(
      extractStreamDelta({
        type: "session.text.delta",
        created: 5000,
        data: { sessionID: "ses_abc", assistantMessageID: "msg_1", ordinal: 0, delta: "Hallo " },
      }),
    ).toEqual({
      kind: "text",
      sessionID: "ses_abc",
      messageID: "msg_1",
      ordinal: 0,
      callID: null,
      delta: "Hallo ",
      created: 5000,
    });
  });

  it("reads the verified session.reasoning.delta envelope", () => {
    // Field names verified in the installed client (types.d.ts 1520-1534).
    expect(
      extractStreamDelta({
        type: "session.reasoning.delta",
        created: 6000,
        data: { sessionID: "ses_abc", assistantMessageID: "msg_1", ordinal: 2, delta: "prüfen" },
      }),
    ).toEqual({
      kind: "reasoning",
      sessionID: "ses_abc",
      messageID: "msg_1",
      ordinal: 2,
      callID: null,
      delta: "prüfen",
      created: 6000,
    });
  });

  it("reads session.tool.input.delta with its call id and no ordinal", () => {
    // Field names verified in the installed client (types.d.ts 1535-1549):
    // this delta names the tool call by `id`, not by an `ordinal`.
    expect(
      extractStreamDelta({
        type: "session.tool.input.delta",
        data: { sessionID: "ses_abc", assistantMessageID: "msg_1", id: "call_9", delta: '{"a":1}' },
      }),
    ).toEqual({
      kind: "tool-input",
      sessionID: "ses_abc",
      messageID: "msg_1",
      ordinal: null,
      callID: "call_9",
      delta: '{"a":1}',
      created: null,
    });
  });

  it("rejects other events, frames without ids and unusable ordinals", () => {
    expect(extractStreamDelta({ type: "session.message.content.updated", data: {} })).toBeNull();
    expect(extractStreamDelta(null)).toBeNull();
    expect(
      extractStreamDelta({
        type: "session.text.delta",
        data: { assistantMessageID: "a", ordinal: 0, delta: "x" },
      }),
    ).toBeNull();
    expect(
      extractStreamDelta({
        type: "session.reasoning.delta",
        data: { sessionID: "s", assistantMessageID: "a", delta: "x" },
      }),
    ).toBeNull();
    expect(
      extractStreamDelta({
        type: "session.text.delta",
        data: { sessionID: "s", assistantMessageID: "a", ordinal: 0 },
      }),
    ).toBeNull();
    for (const ordinal of [-1, 1.5, "0", null]) {
      expect(
        extractStreamDelta({
          type: "session.text.delta",
          data: { sessionID: "s", assistantMessageID: "a", ordinal, delta: "x" },
        }),
      ).toBeNull();
    }
  });

  it("is never mis-parsed into a message by the snapshot extractor", () => {
    // `session.tool.input.delta` carries a bare `data.id`, which would lure
    // `extractMessageFromEvent` into a bogus note row keyed by the *call* id.
    // That is precisely why the delta branch has to run first in the hook.
    const frame = {
      type: "session.tool.input.delta",
      data: { sessionID: "ses", assistantMessageID: "a", id: "call_1", delta: "{}" },
    };
    expect(extractMessageFromEvent(frame)).toMatchObject({ messageID: "call_1" });
    expect(extractStreamDelta(frame)?.kind).toBe("tool-input");
  });
});

describe("foldDeltaIntoParts", () => {
  it("appends a text delta to the part its ordinal names", () => {
    const parts: ChatPart[] = [{ kind: "text", text: "Hallo" }];
    const folded = foldDeltaIntoParts(parts, textDelta("a", 0, " Welt"));
    expect(folded).toEqual([{ kind: "text", text: "Hallo Welt", live: true }]);
    // The input is never mutated.
    expect(parts).toEqual([{ kind: "text", text: "Hallo" }]);
  });

  it("targets the ordinal: another index stays untouched", () => {
    const parts: ChatPart[] = [
      { kind: "reasoning", text: "erst" },
      { kind: "text", text: "Ant" },
    ];
    const folded = foldDeltaIntoParts(parts, reasoningDelta("a", 0, " denken"));
    expect(folded).toEqual([
      { kind: "reasoning", text: "erst denken", live: true },
      { kind: "text", text: "Ant" },
    ]);
    const grown = foldDeltaIntoParts(folded, textDelta("a", 1, "wort"));
    expect(grown).toEqual([
      { kind: "reasoning", text: "erst denken", live: true },
      { kind: "text", text: "Antwort", live: true },
    ]);
  });

  it("creates the part when the ordinal is new", () => {
    const folded = foldDeltaIntoParts([], reasoningDelta("a", 0, "ich "));
    expect(folded).toEqual([{ kind: "reasoning", text: "ich ", live: true }]);
    const alsoText = foldDeltaIntoParts(folded, textDelta("a", 1, "Antwort"));
    expect(alsoText).toEqual([
      { kind: "reasoning", text: "ich ", live: true },
      { kind: "text", text: "Antwort", live: true },
    ]);
  });

  it("pads a gap so the array index stays the ordinal (never sparse)", () => {
    const folded = foldDeltaIntoParts([], reasoningDelta("a", 2, "spät"));
    expect(folded).toHaveLength(3);
    expect(folded[0]).toEqual({ kind: "unknown" });
    expect(folded[2]).toEqual({ kind: "reasoning", text: "spät", live: true });
    expect(Object.keys(folded)).toHaveLength(3);
  });

  it("lets an authoritative snapshot win on a kind mismatch", () => {
    // The row came from a snapshot that really holds a tool at this ordinal:
    // a text delta must not overwrite it.
    const parts: ChatPart[] = [
      { kind: "tool", name: "read", status: "running", detail: null, input: {}, metadata: null },
    ];
    expect(foldDeltaIntoParts(parts, textDelta("a", 0, "Text"))).toBe(parts);
  });

  it("accumulates tool input across frames and re-parses through the parser", () => {
    const parts: ChatPart[] = [
      { kind: "tool", name: "read", status: "running", detail: null, input: {}, metadata: null, id: "call_1" },
    ];
    // First fragment: not valid JSON yet — `toolInput` degrades to `{}`.
    const first = foldDeltaIntoParts(parts, toolInputDelta("a", "call_1", '{"filePath":'));
    expect(first[0]).toMatchObject({ kind: "tool", input: {}, rawInput: '{"filePath":' });
    // Complete JSON parses through the same `toolInput` snapshot path.
    const second = foldDeltaIntoParts(first, toolInputDelta("a", "call_1", '"/a.ts"}'));
    expect(second[0]).toMatchObject({ kind: "tool", input: { filePath: "/a.ts" } });
    expect(second[0]).toMatchObject({ rawInput: '{"filePath":"/a.ts"}' });
  });

  it("leaves parts alone for an unknown tool call id and other rows", () => {
    const parts: ChatPart[] = [
      { kind: "tool", name: "read", status: "running", detail: null, input: {}, metadata: null, id: "call_1" },
      { kind: "text", text: "vorher" },
    ];
    const folded = foldDeltaIntoParts(parts, toolInputDelta("a", "call_andere", "{}"));
    expect(folded).toBe(parts);
  });

  it("returns the same array when a frame changes nothing", () => {
    const parts: ChatPart[] = [{ kind: "text", text: "fertig" }];
    expect(foldDeltaIntoParts(parts, toolInputDelta("a", "call_1", "{}"))).toBe(parts);
    expect(foldDeltaIntoParts(parts, textDelta("a", 0, "x"))).not.toBe(parts);
  });
});

describe("foldStreamDelta", () => {
  it("creates a placeholder assistant message for an unknown message id", () => {
    const rows: CachedMessage[] = [];
    const folded = foldStreamDelta(rows, reasoningDelta("msg_1", 0, "ich denke"), {
      serverID: "srv",
      now: 4000,
    });
    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({
      key: "srv:ses:msg_1",
      sessionKey: "srv:ses",
      serverID: "srv",
      sessionID: "ses",
      messageID: "msg_1",
      role: "assistant",
      // Agent/model are unknown at this point — never invented.
      agent: null,
      model: null,
      created: 4000,
      parts: [{ kind: "reasoning", text: "ich denke", live: true }],
    });
    // Rows were never mutated in place either.
    expect(rows).toHaveLength(0);
  });

  it("carries the session agent/model into the placeholder", () => {
    const folded = foldStreamDelta([], textDelta("msg_1", 0, "Antwort"), {
      serverID: "srv",
      meta: { agent: "coder", model: "anthropic/claude" },
      now: 4000,
    });
    expect(folded[0]).toMatchObject({ agent: "coder", model: "anthropic/claude" });
  });

  it("appends into the row it names and keeps other rows identical", () => {
    const first = streamRow("msg_1", [{ kind: "text", text: "Hallo" }], 200);
    const older = streamRow("msg_0", [{ kind: "text", text: "Frage" }], 100);
    const folded = foldStreamDelta([first, older], textDelta("msg_1", 0, " Welt"), {
      serverID: "srv",
      now: 4000,
    });
    expect(folded).toHaveLength(2);
    expect(folded[0]).not.toBe(first);
    expect(folded[0]?.messageID).toBe("msg_1");
    expect(folded[0]?.parts).toEqual([{ kind: "text", text: "Hallo Welt", live: true }]);
    // Identity is preserved for the untouched row: React skips it entirely.
    expect(folded[1]).toBe(older);
  });

  it("places the placeholder above older rows, never disturbing the order", () => {
    const older = streamRow("msg_0", [{ kind: "text", text: "alt" }], 100);
    const folded = foldStreamDelta([older], reasoningDelta("msg_2", 0, "neu"), {
      serverID: "srv",
      now: 9000,
    });
    expect(folded.map((row) => row.messageID)).toEqual(["msg_2", "msg_0"]);
  });

  it("drops a tool input delta when no row exists yet", () => {
    const older = streamRow("msg_0", [{ kind: "text", text: "alt" }], 100);
    const rows = [older];
    const folded = foldStreamDelta(rows, toolInputDelta("msg_neu", "call_1", "{}"), {
      serverID: "srv",
      now: 9000,
    });
    // Same array reference: nothing changed, so no re-render happens.
    expect(folded).toBe(rows);
    expect(folded).toHaveLength(1);
    expect(folded[0]).toBe(older);
  });

  it("keeps the streamed row's text fallback in sync with its parts", () => {
    const folded = foldStreamDelta([], textDelta("msg_1", 0, "Hallo"), { serverID: "srv", now: 1 });
    const grown = foldStreamDelta(folded, textDelta("msg_1", 0, " Welt"), { serverID: "srv", now: 2 });
    expect(grown[0]?.text).toBe("Hallo Welt");
  });
});

describe("authoritative refresh wins over a streamed row", () => {
  it("replaces the streamed row wholesale, never merges into it", () => {
    // A row grown purely from deltas …
    const streamed = foldStreamDelta([], reasoningDelta("msg_1", 0, "ungefäh"), {
      serverID: "srv",
      now: 1000,
    });
    // … versus the same message as the server finally sent it.
    const snapshot = extractContentUpdateMessage({
      type: "session.message.content.updated",
      created: 2000,
      data: {
        sessionID: "ses",
        messageID: "msg_1",
        content: [
          { type: "reasoning", text: "ungefähre Überlegung" },
          { type: "text", text: "Fertig." },
        ],
      },
    });
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    const [authoritative] = toCachedMessages("srv", "ses", [
      {
        id: snapshot.messageID,
        role: snapshot.role,
        text: snapshot.text,
        created: snapshot.created,
        noteKind: snapshot.noteKind,
        noteDetail: snapshot.noteDetail,
        parts: snapshot.parts,
        agent: snapshot.agent,
        model: snapshot.model,
        durationMs: snapshot.durationMs,
      },
    ]);
    if (authoritative === undefined) throw new Error("fixture");
    const merged = mergeMessageLists(streamed, [authoritative]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(authoritative);
    expect(merged[0]?.parts).toEqual([
      { kind: "reasoning", text: "ungefähre Überlegung" },
      { kind: "text", text: "Fertig." },
    ]);
  });
});
