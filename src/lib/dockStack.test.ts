import { describe, expect, it } from "vitest";
import {
  DOCK_KIND_LIMIT,
  dockReducer,
  dockStackHasContent,
  dropDockForm,
  dropDockInbox,
  dropDockPermission,
  EMPTY_DOCK_STACK,
  setDockInboxDelivery,
  splitDockKind,
  toDockInboxItem,
  toDockPermission,
  toDockRevert,
  visibleDocks,
  type DockStackState,
} from "./dockStack.ts";
import { extractFormFields } from "./formFields.ts";

function state(overrides: Partial<DockStackState> = {}): DockStackState {
  return { ...EMPTY_DOCK_STACK, sessionID: "ses-1", ...overrides };
}

/** A `permission.asked` payload (`PermissionRequest`). */
function asked(id: string, message: string | null = null) {
  return {
    type: "permission.asked",
    location: {},
    data: {
      id,
      sessionID: "ses-1",
      action: "bash",
      resources: ["ls -la"],
      ...(message === null ? {} : { message }),
    },
  };
}

describe("dockReducer list actions", () => {
  it("starts empty and resets per session", () => {
    expect(dockStackHasContent(EMPTY_DOCK_STACK)).toBe(false);
    const filled = dockReducer(EMPTY_DOCK_STACK, {
      type: "permissions",
      rows: [{ id: "p1", action: "bash", resources: [], message: null }],
    });
    expect(dockStackHasContent(filled)).toBe(true);
    expect(filled.permissions).toHaveLength(1);
    expect(dockReducer(filled, { type: "reset", sessionID: "ses-2" })).toEqual({
      ...EMPTY_DOCK_STACK,
      sessionID: "ses-2",
    });
  });

  it("replaces rows wholesale on every load (no duplicates across polls)", () => {
    let next = dockReducer(EMPTY_DOCK_STACK, {
      type: "permissions",
      rows: [{ id: "p1", action: "bash", resources: [], message: null }],
    });
    next = dockReducer(next, {
      type: "permissions",
      rows: [
        { id: "p1", action: "bash", resources: [], message: null },
        { id: "p2", action: "read", resources: ["a.ts"], message: "lesen?" },
      ],
    });
    expect(next.permissions.map((row) => row.id)).toEqual(["p1", "p2"]);
  });
});

describe("visibleDocks", () => {
  it("renders in the original's order and skips empty docks", () => {
    expect(visibleDocks(state())).toEqual([]);
    expect(
      visibleDocks(
        state({
          inbox: [{ id: "i1", kind: "user", summary: "x", delivery: "queue" }],
          revert: { messageID: "m1", fileCount: 1 },
          permissions: [{ id: "p1", action: "bash", resources: [], message: null }],
          forms: [{ id: "f1", title: "F", fields: [] }],
        }),
      ),
    ).toEqual(["question", "permission", "revert", "inbox"]);
  });

  it("adds the todo slot once an endpoint exists (today none does)", () => {
    expect(
      visibleDocks(state({ todos: [{ id: "t1", content: "x", status: "pending" }] })),
    ).toEqual(["todo"]);
  });
});

describe("splitDockKind — per-kind cap", () => {
  it("keeps every entry when at or below the limit", () => {
    expect(splitDockKind([])).toEqual({ visible: [], hidden: 0 });
    const two = [{ id: "a" }, { id: "b" }];
    expect(splitDockKind(two)).toEqual({ visible: two, hidden: 0 });
    // A fresh array is always returned (never the input reference).
    expect(splitDockKind(two).visible).not.toBe(two);
  });

  it("shows the newest entries and counts the hidden tail", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    // Newest = end of the array: the last two stay, the older two collapse.
    expect(splitDockKind(rows)).toEqual({ visible: [{ id: "c" }, { id: "d" }], hidden: 2 });
  });

  it("hides exactly one entry for limit+1 (three) entries", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(splitDockKind(rows)).toEqual({ visible: [{ id: "b" }, { id: "c" }], hidden: 1 });
  });

  it("honours a custom limit and never collapses a non-positive one", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(splitDockKind(rows, 1)).toEqual({ visible: [{ id: "c" }], hidden: 2 });
    expect(splitDockKind(rows, 5)).toEqual({ visible: rows, hidden: 0 });
    // A limit of 0 (or less) means "no cap": everything shows.
    expect(splitDockKind(rows, 0)).toEqual({ visible: rows, hidden: 0 });
  });

  it("defaults the limit to DOCK_KIND_LIMIT (2)", () => {
    expect(DOCK_KIND_LIMIT).toBe(2);
  });
});

describe("reduceDockEvent — permissions", () => {
  it("appends a new request and ignores duplicates", () => {
    let next = dockReducer(state(), { type: "event", event: asked("per-1", "Shell?") });
    expect(next.permissions).toHaveLength(1);
    next = dockReducer(next, { type: "event", event: asked("per-1", "Shell?") });
    expect(next.permissions).toHaveLength(1);
  });

  it("removes the answered request", () => {
    let next = dockReducer(state(), { type: "event", event: asked("per-1") });
    next = dockReducer(next, {
      type: "event",
      event: { type: "permission.replied", data: { sessionID: "ses-1", requestID: "per-1" } },
    });
    expect(next.permissions).toEqual([]);
  });

  it("ignores events of another session", () => {
    const foreign = { ...asked("per-2"), data: { ...asked("per-2").data, sessionID: "ses-2" } };
    expect(dockReducer(state(), { type: "event", event: foreign })).toEqual(state());
    const unknown = { type: "session.renamed", data: { sessionID: "ses-1" } };
    expect(dockReducer(state(), { type: "event", event: unknown })).toEqual(state());
    expect(dockReducer(state(), { type: "event", event: null })).toEqual(state());
    expect(dockReducer(state(), { type: "event", event: { data: 1 } })).toEqual(state());
  });
});

describe("reduceDockEvent — forms", () => {
  it("adds a created form with its fields and drops replied/cancelled ones", () => {
    const created = {
      type: "form.created",
      data: {
        form: {
          id: "f-1",
          sessionID: "ses-1",
          title: "Freigabe?",
          fields: [{ key: "ok", type: "boolean" }],
        },
      },
    };
    let next = dockReducer(state(), { type: "event", event: created });
    expect(next.forms).toHaveLength(1);
    expect(next.forms[0]?.title).toBe("Freigabe?");
    expect(next.forms[0]?.fields).toHaveLength(1);
    for (const type of ["form.replied", "form.cancelled"]) {
      next = dockReducer(next, {
        type: "event",
        event: { type, data: { id: "f-1", sessionID: "ses-1" } },
      });
      expect(next.forms).toEqual([]);
    }
  });

  it("ignores a form.created of another session", () => {
    const foreign = {
      type: "form.created",
      data: { form: { id: "f-9", sessionID: "ses-2", title: "egal", fields: [] } },
    };
    expect(dockReducer(state(), { type: "event", event: foreign })).toEqual(state());
  });

  it("ignores a form.created without an id", () => {
    const next = dockReducer(state(), {
      type: "event",
      event: { type: "form.created", data: { form: { title: "x" } } },
    });
    expect(next).toEqual(state());
  });
});

describe("reduceDockEvent — inbox", () => {
  it("appends an enqueued item and drops delivered/cancelled ones", () => {
    const enqueued = {
      type: "session.inbox.enqueued",
      data: {
        sessionID: "ses-1",
        inboxID: "in-1",
        item: { type: "user", payload: { text: "Nachfrage" }, delivery: "queue" },
      },
    };
    let next = dockReducer(state(), { type: "event", event: enqueued });
    expect(next.inbox).toEqual([{ id: "in-1", kind: "user", summary: "Nachfrage", delivery: "queue" }]);
    next = dockReducer(next, { type: "event", event: enqueued });
    expect(next.inbox).toHaveLength(1);
    next = dockReducer(next, {
      type: "event",
      event: {
        type: "session.inbox.delivery.changed",
        data: { sessionID: "ses-1", inboxID: "in-1", delivery: "steer" },
      },
    });
    expect(next.inbox[0]?.delivery).toBe("steer");
    for (const type of ["session.inbox.delivered", "session.inbox.cancelled"]) {
      next = dockReducer(next, {
        type: "event",
        event: { type, data: { sessionID: "ses-1", inboxID: "in-1" } },
      });
      expect(next.inbox).toEqual([]);
    }
  });
});

describe("reduceDockEvent — revert", () => {
  it("stages, commits and clears", () => {
    const staged = {
      type: "session.revert.staged",
      data: {
        sessionID: "ses-1",
        revert: { messageID: "m2", files: [{ file: "a.ts" }, { file: "b.ts" }] },
      },
    };
    let next = dockReducer(state(), { type: "event", event: staged });
    expect(next.revert).toEqual({ messageID: "m2", fileCount: 2 });
    // A staged payload without a message id is not a revert.
    next = dockReducer(next, {
      type: "event",
      event: { type: "session.revert.staged", data: { sessionID: "ses-1", revert: {} } },
    });
    expect(next.revert).toEqual({ messageID: "m2", fileCount: 2 });
    for (const type of ["session.revert.committed", "session.revert.cleared"]) {
      next = dockReducer(next, { type: "event", event: { type, data: { sessionID: "ses-1" } } });
      expect(next.revert).toBeNull();
    }
  });
});

describe("optimistic helpers", () => {
  const base = state({
    permissions: [{ id: "p1", action: "bash", resources: [], message: null }],
    forms: [{ id: "f1", title: "F", fields: extractFormFields([{ key: "k", type: "boolean" }]) }],
    inbox: [{ id: "i1", kind: "user", summary: "x", delivery: "queue" }],
  });

  it("drops one permission, form or inbox entry", () => {
    expect(dropDockPermission(base, "p1").permissions).toEqual([]);
    expect(dropDockForm(base, "f1").forms).toEqual([]);
    expect(dropDockInbox(base, "i1").inbox).toEqual([]);
    // Unknown ids leave the lists untouched.
    expect(dropDockPermission(base, "nope")).toEqual(base);
    expect(dropDockForm(base, "nope")).toEqual(base);
    expect(dropDockInbox(base, "nope")).toEqual(base);
  });

  it("changes one delivery and leaves the rest alone", () => {
    const next = setDockInboxDelivery(base, "i1", "steer");
    expect(next.inbox[0]?.delivery).toBe("steer");
    expect(next.permissions).toBe(base.permissions);
  });
});

describe("payload parsers", () => {
  it("reads a permission request with every fallback key", () => {
    expect(toDockPermission({ id: "p1", action: "bash", resources: ["ls"], message: "m" }, "x")).toEqual({
      id: "p1",
      action: "bash",
      resources: ["ls"],
      message: "m",
    });
    expect(toDockPermission({}, "fallback")).toEqual({
      id: "fallback",
      action: "unbekannt",
      resources: [],
      message: null,
    });
    expect(toDockPermission(null, "fallback").action).toBe("unbekannt");
  });

  it("reads an inbox item and falls back to a kind summary", () => {
    expect(toDockInboxItem("in-1", { type: "user", payload: { text: "hi" }, delivery: "steer" })).toEqual({
      id: "in-1",
      kind: "user",
      summary: "hi",
      delivery: "steer",
    });
    expect(toDockInboxItem("in-2", { type: "compaction" })).toEqual({
      id: "in-2",
      kind: "compaction",
      summary: "Kompaktierung",
      delivery: null,
    });
    expect(toDockInboxItem("in-3", null).summary).toBe("unbekannt");
  });

  it("truncates a long inbox summary", () => {
    const long = toDockInboxItem("in-1", { type: "user", payload: { text: "x".repeat(200) } });
    expect(long.summary).toHaveLength(141);
    expect(long.summary.endsWith("…")).toBe(true);
  });

  it("reads a staged revert with and without files", () => {
    expect(toDockRevert({ messageID: "m1", files: [1, 2] })).toEqual({ messageID: "m1", fileCount: 2 });
    expect(toDockRevert({ messageID: "m1" })).toEqual({ messageID: "m1", fileCount: null });
    expect(toDockRevert({ files: [] })).toBeNull();
    expect(toDockRevert(null)).toBeNull();
  });
});
