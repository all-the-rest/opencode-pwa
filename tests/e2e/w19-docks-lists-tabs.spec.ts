import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * WAVE 5 (docks + session lists + tab bar):
 *
 * Docks — while a session runs, everything the agent needs answered appears
 * INSIDE the session, directly above the composer, instead of a detour through
 * the tools page:
 *   - permission requests (deny / allow once)
 *   - open questions/forms as native option controls
 *   - queued inbox/follow-up entries (send now / queue / edit)
 *   - a staged revert (restore with confirm / discard)
 * Session lists — skeleton rows while loading plus a server-side search overlay
 * with keyboard navigation and per-row open-tab/unread markers.
 * Tab bar — middle-click close, inline rename on double click, Cmd/Ctrl+1…9.
 *
 * `decision: "always"` is deliberately NOT offered (documented product
 * decision, `features/05-parity.md`) — the dock proves exactly that.
 */

const server = {
  id: "wave5-server",
  name: "Wave-5-Server",
  baseUrl: "http://wave5.local",
  username: "",
};

interface CallLog {
  permissionReplies: Array<{ sessionID: string; requestID: string; decision: string }>;
  formReplies: Array<{ formID: string; answer: unknown }>;
  inboxUpdates: Array<{ inboxID: string; delivery: string }>;
  revertCommits: string[];
  revertClears: string[];
  sessionSearches: string[];
}

function freshLog(): CallLog {
  return {
    permissionReplies: [],
    formReplies: [],
    inboxUpdates: [],
    revertCommits: [],
    revertClears: [],
    sessionSearches: [],
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
    // Wave 6: the "Mehr…" panels live behind the Experte mode (default is
    // Einfach), so this spec seeds it — the panels stay under test.
    localStorage.setItem("opencode-pwa:session-mode", "expert");
  }, server);
}

async function seedTabs(page: Page, tabs: Array<{ serverID: string; sessionID: string; title: string }>) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:session-tabs", JSON.stringify(value));
  }, tabs);
}

const sessionInfo = {
  data: {
    id: "ses-1",
    agent: "coder",
    model: { id: "claude-sonnet-4", providerID: "anthropic" },
    tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0.0001,
  },
};

function messagePayload() {
  return {
    data: [
      { type: "user", id: "m1", text: "Baue die Docks", time: { created: 1000 } },
      { type: "assistant", id: "m2", agent: "coder", model: { id: "s", providerID: "a" }, content: [{ type: "text", text: "Alles klar." }], time: { created: 2000 } },
    ],
    cursor: { next: null, previous: null },
  };
}

/** A pending form with a closed choice, a number and a boolean field. */
const formPayload = {
  data: [
    {
      id: "f-1",
      sessionID: "ses-1",
      title: "Freigabe?",
      fields: [
        {
          key: "bereich",
          title: "Bereich",
          type: "string",
          required: true,
          options: [
            { value: "web", label: "Web" },
            { value: "fs", label: "Dateisystem" },
          ],
        },
        { key: "anzahl", title: "Anzahl", type: "integer" },
        { key: "vertraulich", title: "Vertraulich", type: "boolean" },
      ],
    },
  ],
};

const sessionList = {
  data: [
    { id: "ses-1", title: "Chat-Test", projectKey: null },
    { id: "ses-2", title: "Kopie", projectKey: null },
    { id: "ses-3", title: "Suchergebnis", projectKey: null },
  ],
  cursor: { next: null, previous: null },
};

/**
 * Mock API for the session view. Every dock endpoint is one branch:
 *   - GET  /api/session/ses-1/permission   → pending requests of ONE session
 *   - GET  /api/session/ses-1/form         → pending form with native fields
 *   - GET  /api/session/ses-1/inbox        → queued follow-up
 * `pending` toggles the per-session permission answer (the dock drops the row
 * optimistically, the mock keeps serving the rest).
 */
async function mockSessionApi(page: Page, log: CallLog) {
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

    if (/\/api\/session\/[^/]+\/permission\/[^/]+\/reply$/.test(url) && method === "POST") {
      const match = url.match(/\/api\/session\/([^/]+)\/permission\/([^/]+)\/reply/);
      const body = (request.postDataJSON() ?? {}) as { decision?: unknown };
      log.permissionReplies.push({
        sessionID: match?.[1] ?? "",
        requestID: match?.[2] ?? "",
        decision: typeof body.decision === "string" ? body.decision : "",
      });
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    // Per-session pending permissions (the dock's source). Answered rows drop
    // out of the mock, so a reload shows the remaining ones. The endpoint
    // answers `PermissionRequestListOutput` = `{ location, data }`, which the
    // generated client unwraps — so the mock carries the envelope.
    if (/\/api\/session\/[^/]+\/permission$/.test(url) && method === "GET") {
      const answered = log.permissionReplies.map((row) => row.requestID);
      const rows = [
        {
          id: "per-1",
          sessionID: "ses-1",
          action: "bash",
          resources: ["ls -la"],
          message: "Shell ausführen?",
        },
        { id: "per-2", sessionID: "ses-1", action: "read", resources: ["src/app.ts"], message: null },
      ].filter((row) => !answered.includes(row.id));
      await json(route, { location: {}, data: rows });
      return;
    }

    const formMatch = url.match(/\/api\/session\/([^/]+)\/form(?:\/([^/]+)(?:\/reply)?)?$/);
    if (formMatch !== null) {
      const formID = formMatch[2] ?? "";
      if (method === "GET" && formID === "") {
        await json(route, formPayload);
        return;
      }
      if (method === "DELETE") {
        await json(route, {});
        return;
      }
      if (method === "POST") {
        const body = (request.postDataJSON() ?? {}) as { answer?: unknown };
        log.formReplies.push({ formID, answer: body.answer ?? null });
        await json(route, {});
        return;
      }
    }

    const inboxMatch = url.match(/\/api\/session\/([^/]+)\/inbox(?:\/([^/]+))?$/);
    if (inboxMatch !== null) {
      const inboxID = inboxMatch[2] ?? "";
      if (method === "GET") {
        await json(route, {
          data: [
            {
              id: "in-1",
              sessionID: "ses-1",
              type: "user",
              payload: { text: "Bitte auch die Tests prüfen" },
              delivery: "queue",
            },
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
        await json(route, {});
        return;
      }
    }

    if (/\/api\/session\/[^/]+\/revert\/stage$/.test(url) && method === "POST") {
      await json(route, { data: { messageID: "m2", files: [{ file: "a.ts" }, { file: "b.ts" }] } });
      return;
    }
    if (/\/api\/session\/[^/]+\/revert\/commit$/.test(url) && method === "POST") {
      log.revertCommits.push("ses-1");
      await json(route, {});
      return;
    }
    if (/\/api\/session\/[^/]+\/revert$/.test(url) && method === "DELETE") {
      log.revertClears.push("ses-1");
      await json(route, {});
      return;
    }
    if (/\/api\/session\/[^/]+\/message/.test(url)) {
      await json(route, messagePayload());
      return;
    }
    if (/\/api\/session\/ses-1$/.test(url) && method === "PATCH") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (/\/api\/session\/[^/]+$/.test(url) && method === "GET") {
      await json(route, sessionInfo);
      return;
    }
    // Server-side session search (`?search=`) and the plain list share the call.
    if (url.includes("/api/session")) {
      const search = new URL(url).searchParams.get("search");
      if (search !== null && search !== "") {
        log.sessionSearches.push(search);
        // Slow on purpose: the overlay's spinner must be observable.
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      await json(route, sessionList);
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
    if (url.includes("/api/shell") || url.includes("/api/pty")) {
      await json(route, { location: {}, data: [] });
      return;
    }
    await json(route, { location: {}, data: [] });
  });
}

test(
  "permission dock answers once and deny inside the session",
  { tag: ["@feature", "@feature:dock-permission"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockSessionApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    // The dock appears directly above the composer — no detour to the tools page.
    const dock = page.getByTestId("session-dock-permission-per-1");
    await expect(dock).toBeVisible();
    await expect(dock).toContainText("Shell ausführen?");
    await expect(page.getByTestId("session-dock-permission-resources-per-1")).toContainText("ls -la");
    await expect(page.getByTestId("session-dock-permission-per-2")).toBeVisible();
    // The documented product decision: no "always" button exists.
    await expect(page.getByRole("button", { name: /immer|dauerhaft/i })).toHaveCount(0);

    // The dock really sits above the composer in the DOM.
    const order = await page.evaluate(() => {
      const docks = document.querySelector('[data-testid="session-docks"]');
      const composer = document.querySelector('[data-testid="session-composer"]');
      if (docks === null || composer === null) return "missing";
      const position = docks.compareDocumentPosition(composer);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? "docks-first" : "composer-first";
    });
    expect(order).toBe("docks-first");

    await page.getByRole("button", { name: "Anfrage per-1 einmalig erlauben" }).click();
    await expect
      .poll(() => log.permissionReplies, { timeout: 10_000 })
      .toContainEqual({ sessionID: "ses-1", requestID: "per-1", decision: "once" });
    await expect(page.getByText("Berechtigung „bash“ einmalig erteilt.")).toBeVisible({ timeout: 10_000 });
    // The answered request leaves the dock; the other one stays.
    await expect(page.getByTestId("session-dock-permission-per-1")).toHaveCount(0);
    await expect(page.getByTestId("session-dock-permission-per-2")).toBeVisible();

    await page.getByRole("button", { name: "Anfrage per-2 ablehnen" }).click();
    await expect
      .poll(() => log.permissionReplies, { timeout: 10_000 })
      .toContainEqual({ sessionID: "ses-1", requestID: "per-2", decision: "reject" });
    await expect(page.getByTestId("session-dock-permission-per-2")).toHaveCount(0);
    // The inbox queue remains in the stack (it is part of the same mock).
    await expect(page.getByTestId("session-dock-inbox")).toBeVisible();
  },
);

test(
  "question dock renders native option controls",
  { tag: ["@feature", "@feature:dock-question"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockSessionApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    const dock = page.getByTestId("session-dock-question-f-1");
    await expect(dock).toBeVisible();
    await expect(dock).toContainText("Freigabe?");

    // No answer yet → "Antworten" stays disabled (no JSON paste needed either).
    await expect(page.getByTestId("session-dock-question-submit-f-1")).toBeDisabled();

    // A closed choice is a native radio group.
    const web = page.getByTestId("session-dock-form-option-bereich-web");
    await expect(web).toHaveAttribute("role", "radio");
    await expect(web).toHaveAttribute("aria-checked", "false");
    await web.click();
    await expect(web).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("session-dock-form-option-bereich-fs")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(page.getByTestId("session-dock-form-input-anzahl")).toHaveAttribute("type", "number");
    await expect(page.getByTestId("session-dock-form-check-vertraulich")).toHaveAttribute(
      "type",
      "checkbox",
    );

    await page.getByTestId("session-dock-form-check-vertraulich").check();
    await page.getByTestId("session-dock-question-submit-f-1").click();
    await expect
      .poll(() => log.formReplies, { timeout: 10_000 })
      .toContainEqual({
        formID: "f-1",
        answer: { bereich: "web", vertraulich: true },
      });
    await expect(page.getByTestId("session-dock-question-f-1")).toHaveCount(0, { timeout: 10_000 });
  },
);

test(
  "question dock keeps the JSON escape hatch",
  { tag: ["@feature", "@feature:dock-question"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockSessionApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await page.getByText("Als JSON bearbeiten").click();
    const textarea = page.getByTestId("session-dock-question-json-text-f-1");
    await expect(textarea).toBeVisible();
    await textarea.fill('{"bereich":"fs"}');
    await page.getByTestId("session-dock-question-json-submit-f-1").click();
    await expect
      .poll(() => log.formReplies, { timeout: 10_000 })
      .toContainEqual({ formID: "f-1", answer: { bereich: "fs" } });
  },
);

test(
  "inbox dock sends a queued follow-up now and edits it in the composer",
  { tag: ["@feature", "@feature:dock-inbox"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockSessionApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    const row = page.getByTestId("session-dock-inbox-in-1");
    await expect(row).toBeVisible();
    await expect(row).toContainText("Bitte auch die Tests prüfen");
    await expect(page.getByTestId("session-dock-inbox-delivery-in-1")).toContainText("Warteschlange");

    await page.getByTestId("session-dock-inbox-steer-in-1").click();
    await expect
      .poll(() => log.inboxUpdates, { timeout: 10_000 })
      .toContainEqual({ inboxID: "in-1", delivery: "steer" });
    await expect(page.getByText("Eintrag in-1 läuft jetzt.")).toBeVisible({ timeout: 10_000 });

    // "Edit" moves the text into the composer (no update-text endpoint exists).
    await page.getByTestId("session-dock-inbox-edit-in-1").click();
    await expect(page.getByTestId("prompt-draft-input")).toHaveValue("Bitte auch die Tests prüfen");
  },
);

test(
  "revert dock restores with confirm and discards",
  { tag: ["@feature", "@feature:dock-revert"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockSessionApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    // Stage through the Mehr… panel (staging needs a message to reset to).
    await page.getByTestId("session-more-toggle").click();
    await page.getByTestId("session-more-tab-revert").click();
    await page.getByTestId("revert-message-select").selectOption("m2");
    await page.getByRole("button", { name: "Revert-Staging starten" }).click();

    // The dock shows the staged revert with its summary …
    const dock = page.getByTestId("session-dock-revert");
    await expect(dock).toBeVisible();
    await expect(page.getByTestId("session-dock-revert-summary")).toContainText("m2");
    await expect(page.getByTestId("session-dock-revert-summary")).toContainText("2 Dateien");

    // … restore stays behind the same German confirm …
    await page.getByTestId("session-dock-revert-commit").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("gehen verloren");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(dock).toBeVisible();

    // … and discard drops the staging without a confirm.
    await page.getByTestId("session-dock-revert-discard").click();
    await expect.poll(() => log.revertClears, { timeout: 10_000 }).toContainEqual("ses-1");
    await expect(page.getByText("Staging verworfen")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("session-dock-revert")).toHaveCount(0);

    // Restore path: stage again and commit from the dock.
    await page.getByTestId("revert-message-select").selectOption("m2");
    await page.getByRole("button", { name: "Revert-Staging starten" }).click();
    await expect(page.getByTestId("session-dock-revert")).toBeVisible();
    await page.getByTestId("session-dock-revert-commit").click();
    await page.getByRole("button", { name: "Übernehmen", exact: true }).click();
    await expect.poll(() => log.revertCommits, { timeout: 10_000 }).toContainEqual("ses-1");
    await expect(page.getByTestId("session-dock-revert")).toHaveCount(0);
  },
);

test(
  "session list shows skeleton rows while it loads",
  { tag: ["@feature", "@feature:list-skeleton"] },
  async ({ page }) => {
    await seedServer(page);
    await page.route("**/api/**", async (route: Route) => {
      const url = route.request().url();
      // Only the session list is slow — the rest answers at once.
      if (url.includes("/api/session")) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await json(route, sessionList);
        return;
      }
      if (url.includes("/api/shell") || url.includes("/api/pty")) {
        await json(route, { location: {}, data: [] });
        return;
      }
      if (url.includes("/api/project")) {
        await json(route, { location: {}, data: [] });
        return;
      }
      await json(route, { location: {}, data: [] });
    });

    await page.goto(`/servers/${server.id}`);
    // While the list is in flight, the card shows skeleton rows (no bare spinner).
    await expect(page.getByTestId("server-sessions-skeleton")).toBeVisible();
    await expect(page.getByTestId("session-row-ses-1")).toHaveCount(0);
    // … and the real rows replace them once the answer lands.
    await expect(page.getByTestId("session-row-ses-1")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("server-sessions-skeleton")).toHaveCount(0);
  },
);

test(
  "session search overlay navigates with the keyboard",
  { tag: ["@feature", "@feature:list-search"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockSessionApi(page, log);
    await page.goto(`/servers/${server.id}`);
    await expect(page.getByTestId("session-row-ses-1")).toBeVisible();

    const input = page.getByTestId("server-search");
    await input.click();
    // The overlay opens as soon as a query is typed (an empty query would only
    // show a permanent "no results" panel).
    await input.fill("Suche");
    await expect(input).toHaveValue("Suche");

    // The spinner shows while the server-side search is in flight.
    await expect(page.getByTestId("server-session-search-panel")).toContainText("Suche läuft");
    await expect.poll(() => log.sessionSearches, { timeout: 10_000 }).toContainEqual("Suche");

    const first = page.getByTestId("server-session-search-result-ses-1");
    const third = page.getByTestId("server-session-search-result-ses-3");
    await expect(first).toBeVisible();
    // Arrow down moves the highlight; Enter opens the highlighted row. The
    // position lives in the option id (which `aria-activedescendant` points at).
    const option = (index: number) => page.locator(`#server-session-search-option-${index}`);
    await input.press("ArrowDown");
    await expect(option(0)).toHaveAttribute("aria-selected", "true");
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await expect(option(2)).toHaveAttribute("aria-selected", "true");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/sessions\/ses-3\?server=/, { timeout: 10_000 });
    await expect(third).toBeVisible().catch(() => {});
  },
);

test(
  "session search overlay closes on Escape and clears with its button",
  { tag: ["@feature", "@feature:list-search"] },
  async ({ page }) => {
    await seedServer(page);
    await mockSessionApi(page, freshLog());
    await page.goto(`/servers/${server.id}`);
    await expect(page.getByTestId("session-row-ses-1")).toBeVisible();

    const input = page.getByTestId("server-search");
    await input.click();
    await input.fill("Kopie");
    await expect(input).toHaveValue("Kopie");
    await expect(page.getByTestId("server-session-search-panel")).toBeVisible();

    await input.press("Escape");
    await expect(page.getByTestId("server-session-search-panel")).toHaveCount(0);
    // Escape closes *and* resets the query, so a fresh search starts clean.
    await expect(input).toHaveValue("");

    await input.fill("Kopie");
    await expect(input).toHaveValue("Kopie");
    await page.getByTestId("server-session-search-clear").click();
    await expect(input).toHaveValue("");
    await expect(page.getByTestId("server-session-search-panel")).toHaveCount(0);
  },
);

test(
  "session rows mark open tabs",
  { tag: ["@feature", "@feature:list-markers"] },
  async ({ page }) => {
    await seedServer(page);
    await seedTabs(page, [{ serverID: server.id, sessionID: "ses-1", title: "Chat-Test" }]);
    await mockSessionApi(page, freshLog());
    await page.goto(`/servers/${server.id}`);

    const row = page.getByTestId("session-row-ses-1");
    await expect(row).toBeVisible();
    await expect(row.getByTestId("session-row-open")).toContainText("offen");
    // A session without a tab carries no marker.
    await expect(page.getByTestId("session-row-ses-2").getByTestId("session-row-open")).toHaveCount(0);
  },
);

test(
  "tab bar closes on middle click",
  { tag: ["@feature", "@feature:tab-bar"] },
  async ({ page }) => {
    await seedServer(page);
    await seedTabs(page, [
      { serverID: server.id, sessionID: "ses-1", title: "Chat-Test" },
      { serverID: server.id, sessionID: "ses-2", title: "Kopie" },
    ]);
    await mockSessionApi(page, freshLog());
    await page.goto("/");

    const first = page.getByTestId("session-tab-ses-1");
    await expect(first).toBeVisible();
    await first.click({ button: "middle" });
    await expect(page.getByTestId("session-tab-ses-1")).toHaveCount(0);
    await expect(page.getByTestId("session-tab-ses-2")).toBeVisible();
  },
);

test(
  "tab bar renames inline on double click",
  { tag: ["@feature", "@feature:tab-bar"] },
  async ({ page }) => {
    await seedServer(page);
    await seedTabs(page, [{ serverID: server.id, sessionID: "ses-1", title: "Chat-Test" }]);
    await mockSessionApi(page, freshLog());
    await page.goto("/");

    await page.getByTitle("Chat-Test (Wave-5-Server)").dblclick();
    const input = page.getByTestId("session-tab-rename-ses-1");
    await expect(input).toBeVisible();
    await input.fill("Umbenannter Titel");
    await page.getByTestId("session-tab-rename-save-ses-1").click();
    // Optimistic: the tab label switched at once …
    await expect(page.getByTitle("Umbenannter Titel (Wave-5-Server)")).toBeVisible();
    // … and the rename reached the server.
    await expect(page.getByText("Tab umbenannt.")).toBeVisible({ timeout: 10_000 });
    await expect(input).toHaveCount(0);
  },
);

test(
  "nothing degrades at 360px (docks stack, overlay fits, tab bar height holds)",
  { tag: ["@feature", "@feature:narrow-viewport"] },
  async ({ page }) => {
    // A small Android phone in portrait: the narrowest supported width.
    await page.setViewportSize({ width: 360, height: 780 });
    await seedServer(page);
    await mockSessionApi(page, freshLog());
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    // Every open dock is stacked, none is cut off or scrolled sideways.
    const stack = page.getByTestId("session-docks");
    await expect(stack).toBeVisible();
    for (const dock of ["session-dock-question-f-1", "session-dock-permission-per-1", "session-dock-inbox"]) {
      await expect(page.getByTestId(dock)).toBeVisible();
    }
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="session-docks"]');
      if (el === null) return "missing";
      return el.scrollWidth <= el.clientWidth + 1 ? "fits" : `overflows:${el.scrollWidth}>${el.clientWidth}`;
    });
    expect(overflow).toBe("fits");

    // The search overlay stays inside the card at 360px.
    await page.goto(`/servers/${server.id}`);
    const input = page.getByTestId("server-search");
    await input.click();
    await input.fill("Suche");
    await expect(page.getByTestId("server-session-search-result-ses-1")).toBeVisible();
    const panelFits = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="server-session-search-panel"]');
      if (panel === null) return "missing";
      return panel.scrollWidth <= panel.clientWidth + 1 ? "fits" : "overflows";
    });
    expect(panelFits).toBe("fits");

    // The tab bar keeps its height while a tab is renamed inline. The session
    // is opened first, so the active tab (2px top border) is measured in both
    // states — the comparison isolates the rename row itself.
    await seedTabs(page, [
      { serverID: server.id, sessionID: "ses-1", title: "Chat-Test" },
      { serverID: server.id, sessionID: "ses-2", title: "Kopie" },
    ]);
    const barHeight = () =>
      page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Offene Sessions"]');
        return nav === null ? 0 : nav.getBoundingClientRect().height;
      });
    await page.goto(`/sessions/ses-1?server=${server.id}`);
    const before = await barHeight();
    await page.getByTitle("Chat-Test (Wave-5-Server)").dblclick();
    await expect(page.getByTestId("session-tab-rename-ses-1")).toBeVisible();
    expect(await barHeight()).toBe(before);
    await page.keyboard.press("Escape");
  },
);
test(
  "tab bar switches tabs with Cmd/Ctrl+2",
  { tag: ["@feature", "@feature:tab-bar"] },
  async ({ page }) => {
    await seedServer(page);
    await seedTabs(page, [
      { serverID: server.id, sessionID: "ses-1", title: "Chat-Test" },
      { serverID: server.id, sessionID: "ses-2", title: "Kopie" },
    ]);
    await mockSessionApi(page, freshLog());
    await page.goto("/");

    await expect(page.getByTestId("session-tab-ses-1")).toHaveAttribute("aria-selected", "false");
    // `Meta` is the cross-platform "mod": Cmd on macOS, Meta on Linux/Windows
    // (Ctrl is intercepted by the browser as its own tab switcher).
    await page.keyboard.press("Meta+2");
    await expect(page).toHaveURL(/\/sessions\/ses-2\?server=/, { timeout: 10_000 });
    await expect(page.getByTestId("session-tab-ses-2")).toHaveAttribute("aria-selected", "true");
  },
);
