import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "../lib/opencode.ts";
import { ServerProvider, useServers } from "../state/servers.tsx";
import { describeEvent, useEventNotifications } from "./useEventNotifications.ts";

const listeners = new Set<(event: unknown) => void>();

vi.mock("../lib/eventHub.ts", () => ({
  subscribeServerEvents: (_server: unknown, listener: (event: unknown) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
}));

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://localhost:4096",
  username: "",
  password: "",
};

function Harness() {
  useEventNotifications(server);
  return null;
}

function ToggleHarness() {
  useEventNotifications(server);
  const { toggleServerEventNotifications } = useServers();
  return (
    <button type="button" onClick={() => toggleServerEventNotifications("s1")}>toggle</button>
  );
}

function NullHarness() {
  useEventNotifications(null);
  return null;
}

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

describe("useEventNotifications (hook)", () => {
  beforeEach(() => {
    listeners.clear();
  });

  it("subscribes by default (per-server pref defaults to on)", () => {
    render(
      <ServerProvider>
        <Harness />
      </ServerProvider>,
    );
    expect(listeners.size).toBe(1);
  });

  it("unsubscribes when the per-server toggle is switched off and resubscribes when switched on", () => {
    render(
      <ServerProvider>
        <ToggleHarness />
      </ServerProvider>,
    );
    expect(listeners.size).toBe(1);

    act(() => {
      screen.getByRole("button", { name: "toggle" }).click();
    });
    expect(listeners.size).toBe(0);

    act(() => {
      screen.getByRole("button", { name: "toggle" }).click();
    });
    expect(listeners.size).toBe(1);
  });

  it("does not subscribe without a server", () => {
    render(
      <ServerProvider>
        <NullHarness />
      </ServerProvider>,
    );
    expect(listeners.size).toBe(0);
  });
});
