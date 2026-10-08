import { describe, expect, it } from "vitest";
import {
  extractContentUpdateMessage,
  extractMessageFromEvent,
  latestSessionMeta,
  readEventSessionID,
  readEventType,
} from "./eventMessages.ts";

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
