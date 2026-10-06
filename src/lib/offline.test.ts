import { describe, expect, it } from "vitest";
import { blockedWhileOffline, isActionEnabled, reachability, type ServerAction } from "./offline.ts";

const ALL_ACTIONS: ServerAction[] = [
  "session-interrupt",
  "session-delete",
  "sessions-load-more",
  "session-fork",
  "session-compact",
  "session-diff",
  "session-stats",
  "agent-detail",
  "provider-list",
  "shell-create",
  "shell-remove",
  "shell-output",
  "pty-token",
  "file-read",
  "permission-reply",
];

describe("reachability", () => {
  it("is online while there is no error", () => {
    expect(reachability(null)).toEqual({ offline: false, markRowsOffline: false });
  });

  it("marks rows offline on any error", () => {
    expect(reachability("Server offline oder nicht erreichbar")).toEqual({
      offline: true,
      markRowsOffline: true,
    });
  });
});

describe("isActionEnabled", () => {
  it("enables every action while the server answers", () => {
    for (const action of ALL_ACTIONS) {
      expect(isActionEnabled(false, action)).toBe(true);
    }
  });

  it("disables every round-trip action while the server is unreachable", () => {
    for (const action of blockedWhileOffline()) {
      expect(isActionEnabled(true, action)).toBe(false);
    }
  });

  it("covers the full action surface, so nothing stays clickable", () => {
    expect([...blockedWhileOffline()].sort()).toEqual([...ALL_ACTIONS].sort());
  });
});

describe("offline policy", () => {
  // The owner requirement is an invariant of the policy module: reachability
  // loss must never translate into "remove the server". Nothing in this module
  // can remove or delete anything — it only reports booleans.
  it("exposes no removal side effect", () => {
    expect(Object.keys(reachability("boom"))).toEqual(["offline", "markRowsOffline"]);
  });
});
