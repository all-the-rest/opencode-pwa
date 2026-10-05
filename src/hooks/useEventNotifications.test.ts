import { describe, expect, it } from "vitest";
import { describeEvent } from "./useEventNotifications.ts";

describe("describeEvent", () => {
  it("maps permission requests to important notifications", () => {
    expect(describeEvent({ type: "permission.asked", data: { sessionID: "abcdef123456" } })).toEqual({
      title: "Freigabe erforderlich",
      body: "Eine Aktion wartet auf Freigabe (abcdef12).",
      important: true,
    });
    expect(describeEvent({ type: "permission.replied" })?.important).toBe(false);
  });

  it("maps session lifecycle events", () => {
    expect(describeEvent({ type: "session.created" })?.title).toBe("Neue Session");
    expect(describeEvent({ type: "session.deleted" })?.title).toBe("Session gelöscht");
    expect(describeEvent({ type: "session.idle" })?.title).toBe("Session bereit");
    expect(describeEvent({ type: "session.execution.succeeded" })?.title).toBe("Ausführung fertig");
    expect(describeEvent({ type: "session.execution.interrupted" })?.important).toBe(false);
  });

  it("marks failures and failed compactions as important", () => {
    for (const type of [
      "session.execution.failed",
      "session.step.failed",
      "session.tool.failed",
      "session.compaction.failed",
    ]) {
      expect(describeEvent({ type })?.important).toBe(true);
    }
    expect(describeEvent({ type: "session.compaction.started" })?.important).toBe(false);
    expect(describeEvent({ type: "session.compaction.ended" })?.title).toBe("Kompaktierung fertig");
  });

  it("ignores noisy streaming events and malformed payloads", () => {
    expect(describeEvent({ type: "session.text.delta" })).toBeNull();
    expect(describeEvent({ type: "session.step.streamed" })).toBeNull();
    expect(describeEvent({ type: "unknown.event" })).toBeNull();
    expect(describeEvent(null)).toBeNull();
    expect(describeEvent({})).toBeNull();
  });
});
