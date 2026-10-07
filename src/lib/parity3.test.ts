import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelSessionForm,
  cancelSessionInbox,
  clearSessionRevert,
  commitSessionRevert,
  exportSession,
  extractCommands,
  extractSessionForms,
  extractSessionInbox,
  extractSessionRevert,
  extractSessionTransfer,
  extractSkills,
  extractWebsearchAnswer,
  extractWebsearchProviders,
  importSession,
  listCommands,
  listSessionForms,
  listSessionInbox,
  listSkills,
  listWebsearchProviders,
  parseFormAnswerText,
  parseSessionTransferText,
  queryWebsearch,
  replySessionForm,
  runSessionCommand,
  stageSessionRevert,
  updateSessionInbox,
  type ServerConfig,
} from "./opencode.ts";

// Every client call throws, so each function must take its direct-fetch
// fallback (verified paths, see the batch-3 section in `opencode.ts`).
vi.mock("@opencode/client", () => ({
  OpenCode: {
    make: () => {
      throw new Error("Client kaputt");
    },
  },
}));

vi.mock("./credentialVault.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./credentialVault.ts")>();
  return { ...actual, readCredential: () => Promise.resolve("") };
});

const fetchMock = vi.fn();

const server: ServerConfig = {
  id: "s1",
  name: "Lokal",
  baseUrl: "http://x.local/",
  username: "",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];
  return { url, init };
}

function lastJsonBody(): unknown {
  const { init } = lastCall();
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractSessionRevert", () => {
  it("reads the staged message and its file count", () => {
    expect(
      extractSessionRevert({
        messageID: "m-3",
        files: [{ file: "a.ts" }, { file: "b.ts" }],
      }),
    ).toEqual({ messageID: "m-3", fileCount: 2 });
    expect(extractSessionRevert({ data: { messageID: "m-1" } })).toEqual({
      messageID: "m-1",
      fileCount: null,
    });
  });

  it("rejects payloads without a message id", () => {
    expect(extractSessionRevert(null)).toBeNull();
    expect(extractSessionRevert({})).toBeNull();
  });
});

describe("session revert flow", () => {
  it("stages via POST /api/session/{id}/revert/stage", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messageID: "m-3", files: [] }));
    const result = await stageSessionRevert(server, "ses-1", "m-3");
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ messageID: "m-3", fileCount: 0 });
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/session/ses-1/revert/stage");
    expect(init.method).toBe("POST");
    expect(lastJsonBody()).toEqual({ messageID: "m-3" });
  });

  it("commits via POST /api/session/{id}/revert/commit", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await commitSessionRevert(server, "ses-1");
    expect(result.error).toBeNull();
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/session/ses-1/revert/commit");
    expect(init.method).toBe("POST");
  });

  it("clears via DELETE /api/session/{id}/revert", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await clearSessionRevert(server, "ses-1");
    expect(result.error).toBeNull();
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/session/ses-1/revert");
    expect(init.method).toBe("DELETE");
  });
});

describe("extractSessionTransfer / parseSessionTransferText", () => {
  const transfer = { info: { id: "ses-9" }, messages: [{ id: "m1" }] };

  it("accepts info plus messages and keeps an optional location", () => {
    expect(extractSessionTransfer(transfer)).toEqual(transfer);
    expect(extractSessionTransfer(null)).toBeNull();
    expect(extractSessionTransfer({ info: { id: "x" } })).toBeNull();
    expect(extractSessionTransfer({ info: { id: "x" }, messages: {} })).toBeNull();
  });

  it("keeps the location for the re-import when the export carried one", () => {
    const withLocation = { ...transfer, location: { directory: "/repo" } };
    expect(extractSessionTransfer(withLocation)).toEqual(withLocation);
  });

  it("parses pasted JSON and explains failures in German", () => {
    expect(parseSessionTransferText(JSON.stringify(transfer)).error).toBeNull();
    expect(parseSessionTransferText(JSON.stringify(transfer)).payload).toEqual(transfer);
    expect(parseSessionTransferText("kein json").error).toContain("JSON");
    expect(parseSessionTransferText("{}").error).toContain("info");
  });
});

describe("session share (export/import)", () => {
  it("exports via GET /api/experimental/session/{id}/export", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ info: { id: "ses-1" }, messages: [{ id: "m1" }] }),
    );
    const result = await exportSession(server, "ses-1");
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ info: { id: "ses-1" }, messages: [{ id: "m1" }] });
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/experimental/session/ses-1/export");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("imports via POST /api/experimental/session/import", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "ses-neu" } }));
    const result = await importSession(server, { info: { id: "ses-1" }, messages: [] });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: "ses-neu" });
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/experimental/session/import");
    expect(init.method).toBe("POST");
    expect(lastJsonBody()).toEqual({ info: { id: "ses-1" }, messages: [] });
  });
});

describe("extractCommands / extractSkills", () => {
  it("normalizes command rows", () => {
    expect(
      extractCommands({ location: {}, data: [{ name: "test", description: "Tests" }, { name: "fix" }] }),
    ).toEqual([
      { name: "test", description: "Tests" },
      { name: "fix", description: null },
    ]);
    expect(extractCommands(null)).toEqual([]);
  });

  it("normalizes skill rows", () => {
    expect(
      extractSkills({ location: {}, data: [{ id: "s1", name: "Skill", description: "Hilft" }] }),
    ).toEqual([{ id: "s1", name: "Skill", description: "Hilft" }]);
    expect(extractSkills([null])).toEqual([{ id: "skill-0", name: "null", description: null }]);
  });
});

describe("commands and skills", () => {
  it("lists commands from /api/command", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ name: "test" }] }));
    const result = await listCommands(server);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ name: "test", description: null }]);
    expect(lastCall().url).toBe("http://x.local/api/command");
  });

  it("lists skills from /api/skill", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: "s1", name: "Skill" }] }));
    const result = await listSkills(server);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "s1", name: "Skill", description: null }]);
    expect(lastCall().url).toBe("http://x.local/api/skill");
  });

  it("runs a command via POST /api/session/{id}/command", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await runSessionCommand(server, "ses-1", "test", "schnell");
    expect(result.error).toBeNull();
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/session/ses-1/command");
    expect(init.method).toBe("POST");
    expect(lastJsonBody()).toEqual({ name: "test", text: "schnell" });
  });
});

describe("extractWebsearchProviders / extractWebsearchAnswer", () => {
  it("normalizes provider rows", () => {
    expect(
      extractWebsearchProviders({ location: {}, data: [{ id: "tavily", name: "Tavily" }] }),
    ).toEqual([{ id: "tavily", name: "Tavily" }]);
    expect(extractWebsearchProviders(null)).toEqual([]);
  });

  it("reads provider id and hits from the answer object", () => {
    expect(
      extractWebsearchAnswer({
        location: {},
        data: {
          providerID: "tavily",
          results: [{ url: "https://a.example", title: "A", content: "Text" }],
        },
      }),
    ).toEqual({
      providerID: "tavily",
      results: [{ url: "https://a.example", title: "A", content: "Text" }],
    });
    expect(extractWebsearchAnswer({ data: {} })).toBeNull();
    expect(extractWebsearchAnswer(null)).toBeNull();
  });
});

describe("websearch", () => {
  it("lists providers from /api/websearch/provider", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: "tavily", name: "Tavily" }] }));
    const result = await listWebsearchProviders(server);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "tavily", name: "Tavily" }]);
    expect(lastCall().url).toBe("http://x.local/api/websearch/provider");
  });

  it("searches via POST /api/websearch with provider", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { providerID: "tavily", results: [{ url: "https://a.example" }] } }),
    );
    const result = await queryWebsearch(server, "opencode pwa", "tavily");
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      providerID: "tavily",
      results: [{ url: "https://a.example", title: null, content: null }],
    });
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/websearch");
    expect(init.method).toBe("POST");
    expect(lastJsonBody()).toEqual({ query: "opencode pwa", providerID: "tavily" });
  });
});

describe("extractSessionInbox", () => {
  it("normalizes queued entries with a short summary and delivery", () => {
    expect(
      extractSessionInbox([
        { id: "in-1", sessionID: "ses-1", type: "user", payload: { text: "Hallo" }, delivery: "queue" },
        { id: "in-2", sessionID: "ses-1", type: "compaction", payload: {}, delivery: "steer" },
        { id: "in-3", sessionID: "ses-1", type: "quatsch" },
      ]),
    ).toEqual([
      { id: "in-1", sessionID: "ses-1", kind: "user", summary: "Hallo", delivery: "queue" },
      { id: "in-2", sessionID: "ses-1", kind: "compaction", summary: "Kompaktierung", delivery: "steer" },
      { id: "in-3", sessionID: "ses-1", kind: "unbekannt", summary: "unbekannt", delivery: null },
    ]);
  });
});

describe("session inbox", () => {
  it("lists via GET /api/session/{id}/inbox", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ id: "in-1", sessionID: "ses-1", type: "user", payload: { text: "Hi" }, delivery: "queue" }]),
    );
    const result = await listSessionInbox(server, "ses-1");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { id: "in-1", sessionID: "ses-1", kind: "user", summary: "Hi", delivery: "queue" },
    ]);
    expect(lastCall().url).toBe("http://x.local/api/session/ses-1/inbox");
  });

  it("updates delivery via PATCH /api/session/{id}/inbox/{inboxID}", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await updateSessionInbox(server, "ses-1", "in-1", "steer");
    expect(result.error).toBeNull();
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/session/ses-1/inbox/in-1");
    expect(init.method).toBe("PATCH");
    expect(lastJsonBody()).toEqual({ delivery: "steer" });
  });

  it("cancels via DELETE /api/session/{id}/inbox/{inboxID}", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await cancelSessionInbox(server, "ses-1", "in-1");
    expect(result.error).toBeNull();
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/session/ses-1/inbox/in-1");
    expect(init.method).toBe("DELETE");
  });
});

describe("extractSessionForms / parseFormAnswerText", () => {
  it("normalizes pending-form rows", () => {
    expect(
      extractSessionForms([{ id: "f-1", sessionID: "ses-1", title: "Freigabe?" }]),
    ).toEqual([{ id: "f-1", sessionID: "ses-1", title: "Freigabe?" }]);
    expect(extractSessionForms(null)).toEqual([]);
  });

  it("accepts JSON objects and rejects bad values in German", () => {
    expect(parseFormAnswerText('{"ok": true}').answer).toEqual({ ok: true });
    expect(parseFormAnswerText('{"tags": ["a"]}').answer).toEqual({ tags: ["a"] });
    expect(parseFormAnswerText("kein json").error).toContain("JSON");
    expect(parseFormAnswerText("[1]").error).toContain("Objekt");
    expect(parseFormAnswerText('{"f": {"tief": 1}}').error).toContain("ungültigen Wert");
  });
});

describe("session forms", () => {
  it("lists via GET /api/session/{id}/form", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ id: "f-1", sessionID: "ses-1", title: "Freigabe?" }]),
    );
    const result = await listSessionForms(server, "ses-1");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "f-1", sessionID: "ses-1", title: "Freigabe?" }]);
    expect(lastCall().url).toBe("http://x.local/api/session/ses-1/form");
  });

  it("replies via POST /api/session/{id}/form/{formID}/reply", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await replySessionForm(server, "ses-1", "f-1", { ok: true });
    expect(result.error).toBeNull();
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/session/ses-1/form/f-1/reply");
    expect(init.method).toBe("POST");
    expect(lastJsonBody()).toEqual({ answer: { ok: true } });
  });

  it("cancels via DELETE /api/session/{id}/form/{formID}", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await cancelSessionForm(server, "ses-1", "f-1");
    expect(result.error).toBeNull();
    const { url, init } = lastCall();
    expect(url).toBe("http://x.local/api/session/ses-1/form/f-1");
    expect(init.method).toBe("DELETE");
  });
});
