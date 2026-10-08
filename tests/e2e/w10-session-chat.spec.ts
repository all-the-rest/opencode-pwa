import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W10 (chat-first session view):
 *  - SessionDetail renders real V2 `message.list` shapes as chat bubbles
 *    (user right, assistant left) plus centered notes — never raw JSON.
 *  - Tool calls / reasoning collapse, Markdown renders, timestamps show.
 *  - Secondary panels sit BELOW the composer as a collapsed accordion.
 *  - Every ConfirmDialog usage opens, acts and closes (Escape/backdrop).
 *  - Permission-reply, form-reply and inbox delivery prove open/act/close.
 */

const server = {
  id: "chat-server",
  name: "Chat-Server",
  baseUrl: "http://chat.local",
  username: "",
};

interface CallLog {
  interrupts: string[];
  compacts: string[];
  forks: string[];
  deletes: string[];
  revertStages: string[];
  revertCommits: string[];
  prompts: Array<{ sessionID: string; text: string }>;
  permissionReplies: Array<{ sessionID: string; requestID: string; decision: string }>;
  answeredPermissions: string[];
  inboxUpdates: Array<{ inboxID: string; delivery: string }>;
  inboxCancels: string[];
  formReplies: Array<{ formID: string; answer: unknown }>;
  shellRemoves: string[];
}

function freshLog(): CallLog {
  return {
    interrupts: [],
    compacts: [],
    forks: [],
    deletes: [],
    revertStages: [],
    revertCommits: [],
    prompts: [],
    permissionReplies: [],
    answeredPermissions: [],
    inboxUpdates: [],
    inboxCancels: [],
    formReplies: [],
    shellRemoves: [],
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

const sessionInfo = {
  data: {
    id: "ses-1",
    agent: "coder",
    model: { id: "claude-sonnet-4", providerID: "anthropic" },
    tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0.001,
  },
};

/** Real V2 `SessionMessageInfo` shapes (flat `type` union, no `{info,parts}`). */
function messagePayload() {
  const at = (created: number) => ({ created });
  return {
    data: [
      {
        type: "user",
        id: "m1",
        text: "Erkläre **Markdown** und `Code`",
        files: [{ uri: "file:///src/app.ts", name: "app.ts" }],
        time: at(1000),
      },
      {
        type: "assistant",
        id: "m2",
        agent: "coder",
        model: { id: "sonnet", providerID: "anthropic" },
        content: [
          { type: "reasoning", text: "Ich überlege kurz" },
          { type: "text", text: "Hier die **Antwort** mit [Link](https://a.example/x)." },
          {
            type: "tool",
            id: "t1",
            name: "read",
            state: { status: "completed", content: [{ type: "text", text: "Dateiinhalt" }] },
          },
          { type: "tool", id: "t2", name: "bash", state: { status: "running" } },
        ],
        time: at(2000),
      },
      { type: "system", id: "m3", text: "Systemhinweis vom Server", time: at(3000) },
      { type: "idle", id: "m4", outcome: "succeeded", time: at(4000) },
      {
        type: "compaction",
        id: "m5",
        status: "completed",
        reason: "manual",
        summary: "Kurzfassung der Session",
        recent: "",
        time: at(5000),
      },
      { type: "future-thing", id: "m6", payload: { deep: { nested: [1] } }, time: at(6000) },
    ],
    cursor: { next: null, previous: null },
  };
}

async function mockApi(page: Page, log: CallLog) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }
    if (url.includes("/experimental/session/stats")) {
      await json(route, { data: { sessions: 1, prompts: 2, steps: 3 } });
      return;
    }
    if (/\/api\/session\/ses-1\/message/.test(url)) {
      await json(route, messagePayload());
      return;
    }
    if (/\/api\/session\/ses-1\/prompt$/.test(url) && method === "POST") {
      const body = (request.postDataJSON() ?? {}) as { text?: unknown };
      log.prompts.push({
        sessionID: "ses-1",
        text: typeof body.text === "string" ? body.text : "",
      });
      await json(route, {});
      return;
    }
    if (/\/api\/session\/[^/]+\/interrupt$/.test(url) && method === "POST") {
      log.interrupts.push(url.match(/\/api\/session\/([^/]+)\/interrupt/)?.[1] ?? "");
      await json(route, {});
      return;
    }
    if (/\/api\/session\/[^/]+\/compact$/.test(url) && method === "POST") {
      log.compacts.push(url.match(/\/api\/session\/([^/]+)\/compact/)?.[1] ?? "");
      await json(route, {});
      return;
    }
    if (/\/api\/session\/[^/]+\/fork$/.test(url) && method === "POST") {
      log.forks.push(url.match(/\/api\/session\/([^/]+)\/fork/)?.[1] ?? "");
      await json(route, { data: { id: "ses-2", title: "Kopie" } });
      return;
    }
    if (/\/api\/session\/ses-1$/.test(url) && method === "DELETE") {
      log.deletes.push("ses-1");
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (/\/api\/session\/[^/]+\/revert\/stage$/.test(url) && method === "POST") {
      log.revertStages.push("ses-1");
      await json(route, { data: { messageID: "m2", files: [{ file: "src/app.ts" }] } });
      return;
    }
    if (/\/api\/session\/[^/]+\/revert\/commit$/.test(url) && method === "POST") {
      log.revertCommits.push("ses-1");
      await json(route, {});
      return;
    }
    const inboxMatch = url.match(/\/api\/session\/([^/]+)\/inbox(?:\/([^/]+))?$/);
    if (inboxMatch !== null) {
      const inboxID = inboxMatch[2] ?? "";
      if (method === "GET") {
        await json(route, {
          data: [
            { id: "in-1", sessionID: "ses-1", type: "user", payload: { text: "Nachfrage" }, delivery: "queue" },
          ],
        });
        return;
      }
      if (method === "PATCH") {
        const body = (request.postDataJSON() ?? {}) as { delivery?: unknown };
        log.inboxUpdates.push({
          inboxID,
          delivery: typeof body.delivery === "string" ? body.delivery : "",
        });
        await json(route, {});
        return;
      }
      if (method === "DELETE") {
        log.inboxCancels.push(inboxID);
        await json(route, {});
        return;
      }
    }
    const formMatch = url.match(/\/api\/session\/([^/]+)\/form(?:\/([^/]+)(\/reply)?)?$/);
    if (formMatch !== null) {
      const formID = formMatch[2] ?? "";
      if (method === "GET" && formID === "") {
        await json(route, { data: [{ id: "f-1", sessionID: "ses-1", title: "Freigabe?" }] });
        return;
      }
      if (method === "POST") {
        const body = (request.postDataJSON() ?? {}) as { answer?: unknown };
        log.formReplies.push({ formID, answer: body.answer ?? null });
        await json(route, {});
        return;
      }
    }
    if (/\/api\/session\/[^/]+\/permission\/[^/]+\/reply$/.test(url) && method === "POST") {
      const match = url.match(/\/api\/session\/([^/]+)\/permission\/([^/]+)\/reply/);
      const body = (request.postDataJSON() ?? {}) as { decision?: unknown };
      log.permissionReplies.push({
        sessionID: match?.[1] ?? "",
        requestID: match?.[2] ?? "",
        decision: typeof body.decision === "string" ? body.decision : "",
      });
      if (match?.[2] !== undefined) log.answeredPermissions.push(match[2]);
      // The endpoint declares `empty: true` (204, no body) — like w6 mocks it.
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (url.includes("/api/permission/request")) {
      await json(route, {
        location: {},
        data: [
          { id: "per-1", sessionID: "ses-1", action: "bash", resources: ["ls"], message: "Shell ausführen?" },
          { id: "per-2", sessionID: "ses-1", action: "read", resources: [], message: null },
        ].filter((row) => !log.answeredPermissions.includes(row.id)),
      });
      return;
    }
    if (/\/api\/shell\/[^/]+$/.test(url) && method === "DELETE") {
      log.shellRemoves.push(url.match(/\/api\/shell\/([^/]+)/)?.[1] ?? "");
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (url.includes("/api/shell")) {
      await json(route, { location: {}, data: [{ id: "sh-1", command: "pnpm dev" }] });
      return;
    }
    if (/\/api\/session\/ses-1$/.test(url) && method === "GET") {
      await json(route, sessionInfo);
      return;
    }
    if (url.includes("/api/command")) {
      await json(route, { location: {}, data: [] });
      return;
    }
    if (url.includes("/api/agent")) {
      await json(route, {
        location: {},
        data: [{ id: "coder", name: "Coder", mode: "primary" }],
      });
      return;
    }
    if (url.includes("/api/model")) {
      await json(route, {
        location: {},
        data: [{ modelID: "claude-sonnet-4", providerID: "anthropic", name: "Claude" }],
      });
      return;
    }
    if (url.includes("/api/project")) {
      await json(route, { location: {}, data: [{ id: "p1", name: "Repo" }] });
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      await json(route, {
        data: [
          { id: "ses-1", title: "Chat-Test", projectKey: null },
          { id: "ses-2", title: "Kopie", projectKey: null },
        ],
        cursor: { next: null, previous: null },
      });
      return;
    }
    await json(route, { location: {}, data: [] });
  });
}

test(
  "conversation renders bubbles and centered notes, never raw JSON",
  { tag: ["@feature", "@feature:session-chat"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    const items = page.getByTestId("message-item");
    await expect(items).toHaveCount(6);

    // User right (primary), assistant left (neutral) — German headers, no raw roles.
    const userBubble = page.locator('li[data-role="user"]');
    await expect(userBubble).toHaveClass(/chat-end/);
    await expect(userBubble).toContainText("Du");
    expect(await userBubble.locator("strong").count()).toBeGreaterThan(0);
    expect(await userBubble.locator("code").count()).toBeGreaterThan(0);
    await expect(userBubble).toContainText("app.ts");

    const assistantBubble = page.locator('li[data-role="assistant"]');
    await expect(assistantBubble).toHaveClass(/chat-start/);
    await expect(assistantBubble).toContainText("Assistent");
    await expect(assistantBubble.getByRole("link", { name: "Link" })).toHaveAttribute(
      "href",
      "https://a.example/x",
    );
    // Tool calls render as collapsible cards with name + status, no raw dump.
    await expect(page.getByTestId("message-tool-m2-2")).toContainText("read");
    await expect(page.getByTestId("message-tool-m2-2")).toContainText("Fertig");
    await expect(page.getByTestId("message-tool-m2-3")).toContainText("bash");
    await expect(page.getByTestId("message-tool-m2-3")).toContainText("Läuft");
    // Reasoning stays collapsed until opened.
    await expect(page.getByTestId("message-reasoning-m2-0")).toContainText("Denken anzeigen");
    await expect(page.getByText("Ich überlege kurz")).toBeHidden();
    // Timestamps render humanized with a machine-readable datetime.
    const userTime = page.locator('li[data-role="user"] time').first();
    await expect(userTime).toHaveAttribute("datetime", "1970-01-01T00:00:01.000Z");
    await expect(userTime).toContainText(/\d\d\.\d\d\./);

    // Notes center subtle text: system, idle, compaction, unknown future type.
    const notes = page.locator('li[data-role="note"]');
    await expect(notes).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      await expect(notes.nth(i).locator(".chat-bubble")).toHaveCount(0);
    }
    await expect(page.getByTestId("message-note-m3")).toContainText("System");
    await expect(page.getByTestId("message-note-m3")).toContainText("Systemhinweis vom Server");
    await expect(page.getByTestId("message-note-m4")).toContainText("Leerlauf");
    await expect(page.getByTestId("message-note-m5")).toContainText("Kompaktierung");
    await expect(page.getByTestId("message-note-m5")).toContainText("Kurzfassung der Session");
    await expect(page.getByTestId("message-note-m6")).toContainText("Unbekannter Inhalt");

    // No trace of the old fallback: no raw roles, no JSON dumps.
    await expect(page.locator('li[data-role="unbekannt"]')).toHaveCount(0);
    await expect(page.locator(".chat-header", { hasText: "unbekannt" })).toHaveCount(0);
    await expect(page.getByTestId("message-list")).not.toContainText('{"type"');
    await expect(page.getByTestId("message-list")).not.toContainText('"messageID"');
  },
);

test(
  "tool calls and reasoning expand to details",
  { tag: ["@feature", "@feature:session-chat"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await expect(page.getByTestId("message-tool-m2-2")).toBeVisible();
    await page.getByTestId("message-tool-m2-2").locator("summary").click();
    await expect(page.getByTestId("message-tool-m2-2")).toContainText("Dateiinhalt");

    await page.getByTestId("message-reasoning-m2-0").locator("summary").click();
    await expect(page.getByText("Ich überlege kurz")).toBeVisible();
  },
);

test(
  "composer sits above the single More disclosure with tabbed panels",
  { tag: ["@feature", "@feature:session-chat-panels"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await expect(page.getByTestId("session-composer")).toBeVisible();
    const order = await page.evaluate(() => {
      const composer = document.querySelector('[data-testid="session-composer"]');
      const panels = document.querySelector('[data-testid="session-panels"]');
      if (composer === null || panels === null) return "missing";
      const position = composer.compareDocumentPosition(panels);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? "composer-first" : "panels-first";
    });
    expect(order).toBe("composer-first");

    // All secondary panels hide behind one "Mehr…" disclosure …
    await expect(page.getByTestId("session-more-toggle")).toBeVisible();
    await expect(page.getByTestId("session-stats-input")).toHaveCount(0);
    await expect(page.getByTestId("revert-message-select")).toHaveCount(0);
    await expect(page.getByTestId("session-export-button")).toHaveCount(0);
    await expect(page.getByTestId("session-command-select")).toHaveCount(0);
    await expect(page.getByTestId("session-inbox-list")).toHaveCount(0);

    // … and open one tab at a time, keeping their functionality.
    await page.getByTestId("session-more-toggle").click();
    await page.getByTestId("session-more-tab-stats").click();
    await expect(page.getByTestId("session-stats-input")).toBeVisible();

    await page.getByTestId("session-more-tab-revert").click();
    await expect(page.getByTestId("revert-message-select")).toBeVisible();
    await expect(page.getByTestId("session-stats-input")).toHaveCount(0);

    await page.getByTestId("session-more-tab-share").click();
    await expect(page.getByTestId("session-export-button")).toBeVisible();

    await page.getByTestId("session-more-tab-inbox").click();
    await expect(page.getByTestId("session-inbox-list")).toBeVisible();

    // Closing "Mehr…" hides every panel again.
    await page.getByTestId("session-more-toggle").click();
    await expect(page.getByTestId("session-inbox-list")).toHaveCount(0);
    await expect(page.getByTestId("session-stats-input")).toHaveCount(0);
  },
);

test(
  "interrupt confirm opens, cancels via Escape and acts on confirm",
  { tag: ["@feature", "@feature:session-confirm"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByRole("button", { name: "Ausführung unterbrechen" }).click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("unterbrochen");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Ausführung unterbrechen" }).click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Ausführung unterbrechen" }).click();
    await page.getByRole("button", { name: "Unterbrechen", exact: true }).click();
    await expect.poll(() => log.interrupts, { timeout: 10_000 }).toContainEqual("ses-1");
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  },
);

test(
  "fork and compact confirms close via backdrop and act on confirm",
  { tag: ["@feature", "@feature:session-confirm"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByRole("button", { name: "Session forken" }).click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("kopiert");
    await page.mouse.click(20, 20);
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Session kompaktieren" }).click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("zusammengefasst");
    await page.mouse.click(20, 20);
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Session kompaktieren" }).click();
    await page.getByRole("button", { name: "Kompaktieren", exact: true }).click();
    await expect.poll(() => log.compacts, { timeout: 10_000 }).toContainEqual("ses-1");
    await expect(page.getByText("Kompaktierung gestartet")).toBeVisible({ timeout: 10_000 });
  },
);

test(
  "forking opens the new session, deleting leaves it",
  { tag: ["@feature", "@feature:session-confirm"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByRole("button", { name: "Session forken" }).click();
    await page.getByRole("button", { name: "Forken", exact: true }).click();
    await expect.poll(() => log.forks, { timeout: 10_000 }).toContainEqual("ses-1");
    await expect(page).toHaveURL(/\/sessions\/ses-2\?server=/, { timeout: 10_000 });

    await page.goto(`/sessions/ses-1?server=${server.id}`);
    await page.getByRole("button", { name: "Session löschen" }).click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("endgültig gelöscht");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Session löschen" }).click();
    await page.getByRole("button", { name: "Löschen", exact: true }).click();
    await expect.poll(() => log.deletes, { timeout: 10_000 }).toContainEqual("ses-1");
    await expect(page).toHaveURL(/\/servers\/chat-server/, { timeout: 10_000 });
  },
);

test(
  "revert commit confirm opens from staged state and closes both ways",
  { tag: ["@feature", "@feature:session-confirm"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByTestId("session-more-toggle").click();
    await page.getByTestId("session-more-tab-revert").click();
    await page.getByTestId("revert-message-select").selectOption("m2");
    await page.getByRole("button", { name: "Revert-Staging starten" }).click();
    await expect.poll(() => log.revertStages, { timeout: 10_000 }).toContainEqual("ses-1");

    await page.getByRole("button", { name: "Revert übernehmen" }).click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("gehen verloren");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Revert übernehmen" }).click();
    await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
    await expect.poll(() => log.revertCommits, { timeout: 10_000 }).toContainEqual("ses-1");
    await expect(page.getByText("Revert übernommen")).toBeVisible({ timeout: 10_000 });
  },
);

test(
  "form reply and inbox delivery open, act and close",
  { tag: ["@feature", "@feature:session-overlays"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByTestId("session-more-toggle").click();
    await page.getByTestId("session-more-tab-forms").click();
    await expect(page.getByTestId("session-form-f-1")).toContainText("Freigabe?");
    await page.getByTestId("session-form-select").selectOption("f-1");
    await page.getByTestId("session-form-answer").fill('{"ok": true}');
    await page.getByTestId("session-form-reply").click();
    await expect.poll(() => log.formReplies, { timeout: 10_000 }).toContainEqual({
      formID: "f-1",
      answer: { ok: true },
    });
    await expect(page.getByTestId("session-form-f-1")).toHaveCount(0);
    await page.getByTestId("session-more-tab-inbox").click();
    await expect(page.getByTestId("session-forms-list")).toHaveCount(0);
    await expect(page.getByTestId("session-inbox-in-1")).toContainText("Nachfrage");
    await page.getByTestId("session-inbox-steer-in-1").click();
    await expect.poll(() => log.inboxUpdates, { timeout: 10_000 }).toContainEqual({
      inboxID: "in-1",
      delivery: "steer",
    });
    await expect(page.getByTestId("session-inbox-delivery-in-1")).toContainText("sofort");
    await page.getByRole("button", { name: "Eintrag in-1 abbrechen" }).click();
    await expect.poll(() => log.inboxCancels, { timeout: 10_000 }).toContainEqual("in-1");
    await expect(page.getByTestId("session-inbox-in-1")).toHaveCount(0);
    await page.getByTestId("session-more-toggle").click();
    await expect(page.getByTestId("session-inbox-list")).toHaveCount(0);
  },
);

test(
  "permission replies act once and on reject",
  { tag: ["@feature", "@feature:session-overlays"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}/tools`);

    await expect(page.getByTestId("permission-row-per-1")).toContainText("Shell ausführen?");
    await page.getByRole("button", { name: "Anfrage per-1 einmalig erlauben" }).click();
    await expect.poll(() => log.permissionReplies, { timeout: 10_000 }).toContainEqual({
      sessionID: "ses-1",
      requestID: "per-1",
      decision: "once",
    });
    await expect(page.getByTestId("permission-row-per-1")).toHaveCount(0);

    await page.getByRole("button", { name: "Anfrage per-2 ablehnen" }).click();
    await expect.poll(() => log.permissionReplies, { timeout: 10_000 }).toContainEqual({
      sessionID: "ses-1",
      requestID: "per-2",
      decision: "reject",
    });
    await expect(page.getByTestId("permission-row-per-2")).toHaveCount(0);
  },
);

test(
  "server detail confirms open and close for shell remove and server delete",
  { tag: ["@feature", "@feature:server-confirm"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}`);

    await page.getByRole("button", { name: "Shell pnpm dev entfernen" }).click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("pnpm dev");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Shell pnpm dev entfernen" }).click();
    await page.getByRole("button", { name: "Entfernen", exact: true }).click();
    await expect.poll(() => log.shellRemoves, { timeout: 10_000 }).toContainEqual("sh-1");
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);

    await page.getByTestId("server-delete-button").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("lokal gespeicherten Daten");
    await page.mouse.click(20, 20);
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await page.getByTestId("server-delete-button").click();
    await page.getByRole("button", { name: "Entfernen", exact: true }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  },
);

test(
  "server rename with one project asks for project rename confirm",
  { tag: ["@feature", "@feature:server-confirm"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/servers/${server.id}`);

    await page.getByTestId("server-rename-button").click();
    await page.getByTestId("server-rename-input").fill("Neuer Name");
    await page.getByTestId("server-rename-save").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("umbenannt werden", {
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  },
);
