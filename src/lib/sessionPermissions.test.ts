import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listSessionPermissions,
  replySessionPermission,
  type ServerConfig,
} from "./opencode.ts";

/** Client mocks for the per-session permission endpoints (wave 5 dock). */
const permissionListMock = vi.hoisted(() => vi.fn());
const permissionReplyMock = vi.hoisted(() => vi.fn());

vi.mock("@opencode/client", () => ({
  OpenCode: {
    make: () => ({
      permission: { list: permissionListMock, reply: permissionReplyMock },
    }),
  },
}));

vi.mock("./credentialVault.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./credentialVault.ts")>();
  return { ...actual, readCredential: () => Promise.resolve("") };
});

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://x.local/",
  username: "",
};

const pendingRequest = {
  id: "per-1",
  sessionID: "ses-1",
  action: "bash",
  resources: ["ls -la"],
  save: [],
  message: "Shell ausführen?",
};

beforeEach(() => {
  permissionListMock.mockReset();
  permissionReplyMock.mockReset();
});

describe("listSessionPermissions", () => {
  it("normalizes the pending requests of ONE session (bare array, no envelope)", async () => {
    permissionListMock.mockResolvedValue([pendingRequest]);
    const result = await listSessionPermissions(server, "ses-1");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        id: "per-1",
        sessionID: "ses-1",
        action: "bash",
        resources: ["ls -la"],
        message: "Shell ausführen?",
      },
    ]);
    expect(permissionListMock).toHaveBeenCalledWith({ sessionID: "ses-1" });
  });

  it("returns an empty list when the session has nothing pending", async () => {
    permissionListMock.mockResolvedValue([]);
    const result = await listSessionPermissions(server, "ses-1");
    expect(result.data).toEqual([]);
  });

  it("surfaces a client failure as an error result", async () => {
    permissionListMock.mockRejectedValue(new Error("Server offline"));
    const result = await listSessionPermissions(server, "ses-1");
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });
});

describe("replySessionPermission", () => {
  it("answers 'once' through POST /api/session/{id}/permission/{requestID}/reply", async () => {
    permissionReplyMock.mockResolvedValue(undefined);
    const result = await replySessionPermission(server, "ses-1", "per-1", "once");
    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
    expect(permissionReplyMock).toHaveBeenCalledWith({
      sessionID: "ses-1",
      requestID: "per-1",
      decision: "once",
    });
  });

  it("answers 'reject' the same way", async () => {
    permissionReplyMock.mockResolvedValue(undefined);
    const result = await replySessionPermission(server, "ses-1", "per-1", "reject");
    expect(result.error).toBeNull();
    expect(permissionReplyMock).toHaveBeenCalledWith({
      sessionID: "ses-1",
      requestID: "per-1",
      decision: "reject",
    });
  });

  it("surfaces a failed reply as an error result", async () => {
    permissionReplyMock.mockRejectedValue(new Error("404"));
    const result = await replySessionPermission(server, "ses-1", "per-1", "once");
    expect(result.data).toBeNull();
    expect(result.error).toBe("404");
  });
});
