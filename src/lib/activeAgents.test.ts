import { describe, expect, it } from "vitest";
import { activeModelLabel, joinActiveSessions } from "./activeAgents.ts";
import { extractActiveSessionIDs } from "./opencode.ts";
import type { SessionRow } from "./opencode.ts";

/** Extractor + aggregation for the "Agenten" overview (`GET /api/session/active`). */
describe("extractActiveSessionIDs", () => {
  it("reads the raw running map", () => {
    expect(
      extractActiveSessionIDs({ "ses-1": { type: "running" }, "ses-2": { type: "running" } }),
    ).toEqual(["ses-1", "ses-2"]);
  });

  it("reads a data envelope and plain string arrays", () => {
    expect(extractActiveSessionIDs({ data: { "ses-1": { type: "running" } } })).toEqual(["ses-1"]);
    expect(extractActiveSessionIDs(["ses-1", "", 42, null])).toEqual(["ses-1"]);
  });

  it("drops nullish entries and rejects garbage", () => {
    expect(extractActiveSessionIDs({ "ses-1": null, "": { type: "running" } })).toEqual([]);
    expect(extractActiveSessionIDs(null)).toEqual([]);
    expect(extractActiveSessionIDs("ses-1")).toEqual([]);
    expect(extractActiveSessionIDs(42)).toEqual([]);
  });
});

describe("joinActiveSessions", () => {
  const rows: SessionRow[] = [
    { id: "ses-1", label: "Alpha bauen", projectKey: null, agent: "coder" },
    { id: "ses-2", label: "Beta prüfen", projectKey: null, agent: null },
  ];

  it("joins titles, agents and model labels", () => {
    const joined = joinActiveSessions("srv", rows, ["ses-1"], { "ses-1": "anthropic/sonnet" });
    expect(joined).toEqual([
      {
        serverID: "srv",
        sessionID: "ses-1",
        title: "Alpha bauen",
        agent: "coder",
        model: "anthropic/sonnet",
        status: "running",
      },
    ]);
  });

  it("keeps unknown sessions with their ID as title and null model", () => {
    const joined = joinActiveSessions("srv", rows, ["ses-9"], {});
    expect(joined).toEqual([
      {
        serverID: "srv",
        sessionID: "ses-9",
        title: "ses-9",
        agent: null,
        model: null,
        status: "running",
      },
    ]);
  });

  it("formats model labels and tolerates missing models", () => {
    expect(activeModelLabel({ id: "sonnet", providerID: "anthropic" })).toBe("anthropic/sonnet");
    expect(activeModelLabel(null)).toBeNull();
  });
});
