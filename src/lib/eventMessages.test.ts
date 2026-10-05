import { describe, expect, it } from "vitest";
import { extractMessageFromEvent, readEventSessionID, readEventType } from "./eventMessages.ts";

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
});
