import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * WAVE 6 (messenger chat + running strip + Basic/Experte + picker/offline):
 *  - day separators ("Heute"/"Gestern"/date) and consecutive-message grouping
 *    (one meta line per group, a tail on the last bubble);
 *  - the running strip lists shells, PTYs and the server's other live sessions
 *    with a ticking runtime and a tap target that opens the session;
 *  - the persisted Einfach/Experte mode hides the pickers, the attachment
 *    extras and the "Mehr…" disclosure in simple mode;
 *  - the picker shows "Lädt…" while loading and recovers via retry + toast;
 *  - offline answers with one status line and blocks sending.
 */

const server = {
  id: "wave6-server",
  name: "Welle-6-Server",
  baseUrl: "http://wave6.local",
  username: "",
};

const SESSION = "ses-1";
const OTHER_SESSION = "ses-2";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page, mode?: "expert") {
  await page.addInitScript(
    ({ value, sessionMode }) => {
      localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
      if (sessionMode !== null) {
        localStorage.setItem("opencode-pwa:session-mode", sessionMode);
      }
    },
    { value: server, sessionMode: mode ?? null },
  );
}

/** Yesterday 09:00 / today 11:00 / today 11:02 / today 11:40 (local time). */
function chatTimes(now: number) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const today = startOfDay.getTime();
  const at = (dayOffset: number, hour: number, minute: number) => {
    const date = new Date(today + dayOffset * 86_400_000);
    date.setHours(hour, minute, 0, 0);
    return date.getTime();
  };
  return {
    yesterday: at(-1, 9, 0),
    first: at(0, 11, 0),
    second: at(0, 11, 2),
    third: at(0, 11, 40),
  };
}

function messagePayload(now: number) {
  const t = chatTimes(now);
  return {
    data: [
      { type: "user", id: "m1", text: "Frage von gestern", time: { created: t.yesterday } },
      {
        type: "assistant",
        id: "m2",
        agent: "coder",
        content: [{ type: "text", text: "Antwort von gestern" }],
        time: { created: t.yesterday + 60_000, completed: t.yesterday + 90_000 },
      },
      { type: "user", id: "m3", text: "Erste Frage heute", time: { created: t.first } },
      { type: "user", id: "m4", text: "Zweite Frage direkt danach", time: { created: t.second } },
      {
        type: "assistant",
        id: "m5",
        agent: "coder",
        content: [{ type: "text", text: "Antwort auf beide" }],
        time: { created: t.second + 30_000, completed: t.second + 60_000 },
      },
      { type: "user", id: "m6", text: "Späte Frage", time: { created: t.third } },
    ],
    cursor: {},
  };
}

interface MockOptions {
  /** Delay the agent list so the picker stays in its loading state. */
  agentDelayMs?: number;
  /** Fail the agent list for as long as the flag says so (picker recovery). */
  agentFailure?: { failing: boolean };
  /** Abort the message endpoint (drives the offline state). */
  offlineMessages?: boolean;
  /** Running work the strip lists. */
  runningWork?: boolean;
}

async function mockApi(page: Page, options: MockOptions = {}) {
  const now = Date.now();
  await page.route("**/api/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }
    if (/\/message/.test(url)) {
      if (options.offlineMessages === true) {
        await route.abort("internetdisconnected");
        return;
      }
      await json(route, messagePayload(now));
      return;
    }
    if (url.includes("/api/agent")) {
      if (options.agentFailure?.failing === true) {
        await json(route, { message: "Agentliste weg" }, 500);
        return;
      }
      if (options.agentDelayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, options.agentDelayMs));
      }
      await json(route, { location: {}, data: [{ id: "coder", name: "Coder", mode: "primary" }] });
      return;
    }
    if (url.includes("/api/model")) {
      await json(route, {
        data: [{ id: "p1/m1", modelID: "m1", providerID: "p1", name: "Modell Eins" }],
      });
      return;
    }
    if (url.includes("/api/session/active")) {
      await json(
        route,
        options.runningWork === true
          ? { data: { [SESSION]: { type: "running" }, [OTHER_SESSION]: { type: "running" } } }
          : {},
      );
      return;
    }
    if (url.includes("/api/shell") && !url.includes("/output")) {
      await json(
        route,
        options.runningWork === true
          ? {
              location: {},
              data: [
                { id: "sh-1", command: "sleep 60", status: "running", time: { created: now - 3000 } },
              ],
            }
          : { location: {}, data: [] },
      );
      return;
    }
    if (url.includes("/api/pty")) {
      await json(route, { location: {}, data: [] });
      return;
    }
    if (new RegExp(`/api/session/${SESSION}$`).test(url)) {
      await json(route, { data: { id: SESSION, agent: "coder" } });
      return;
    }
    if (new RegExp(`/api/session/${OTHER_SESSION}$`).test(url)) {
      await json(
        route,
        options.runningWork === true
          ? { data: { id: OTHER_SESSION, agent: "plan", model: { id: "m9", providerID: "p9" } } }
          : { data: { id: OTHER_SESSION, agent: "plan" } },
      );
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      await json(route, {
        data: [
          { id: SESSION, title: "Welle-6-Chat", agent: "coder", time: { created: now - 60_000 } },
          {
            id: OTHER_SESSION,
            title: "Paralleler Agent",
            agent: "plan",
            time: { created: now - 190_000 },
          },
        ],
        cursor: {},
      });
      return;
    }
    await json(route, { data: [] });
  });
}

async function openSession(
  page: Page,
  options: MockOptions = {},
  mode?: "expert",
  expectMessages = true,
) {
  await seedServer(page, mode);
  await mockApi(page, options);
  await page.goto(`/sessions/${SESSION}?server=${server.id}`);
  if (!expectMessages) {
    // Offline without cache: no message list, the composer still answers.
    await expect(page.getByTestId("session-composer")).toBeVisible();
    return;
  }
  await expect(page.getByTestId("message-list")).toBeVisible();
  await expect(page.getByTestId("message-item").first()).toBeVisible();
}

test.describe("messenger chat", () => {
  test(
    "day separators split the chat and consecutive messages group",
    { tag: ["@feature", "@feature:messenger-chat"] },
    async ({ page }) => {
      await openSession(page);

      // Two days → two separators: "Gestern" and "Heute".
      const separators = page.getByTestId("message-day-separator");
      await expect(separators).toHaveCount(2);
      await expect(separators.nth(0)).toHaveAttribute("data-day", "yesterday");
      await expect(separators.nth(0)).toContainText("Gestern");
      await expect(separators.nth(1)).toHaveAttribute("data-day", "today");
      await expect(separators.nth(1)).toContainText("Heute");

      // m3 + m4 (same role, two minutes apart) share ONE group: one meta line
      // and one timestamp for both messages.
      const userRows = page.locator('[data-role="user"]');
      await expect(userRows).toHaveCount(4); // m1, m3, m4, m6
      await expect(page.getByTestId("message-meta-m3")).toHaveCount(1);
      await expect(page.getByTestId("message-meta-m4")).toHaveCount(0);
      await expect(page.getByTestId("message-time-m3")).toHaveCount(1);
      await expect(page.getByTestId("message-time-m4")).toHaveCount(0);
      await expect(userRows.nth(1)).toHaveAttribute("data-group-start", "true");
      await expect(userRows.nth(2)).toHaveAttribute("data-group-start", "false");

      // m6 comes 38 minutes later: a new group, so it carries its own header.
      await expect(userRows.nth(3)).toHaveAttribute("data-group-start", "true");
      await expect(page.getByTestId("message-time-m6")).toHaveCount(1);

      // Assistant text is its own bubble, tool cards would stay cards.
      await expect(page.getByText("Antwort von gestern")).toBeVisible();
    },
  );

  test(
    "quick actions reveal on hover (desktop)",
    { tag: ["@feature", "@feature:messenger-chat"] },
    async ({ page, isMobile }) => {
      // Hover is a desktop affordance; mobile reveals via long-press below.
      test.skip(isMobile === true, "hover needs a mouse pointer");
      await openSession(page);
      const copy = page.getByTestId("message-copy-m2");
      await expect(copy).toHaveCount(1);
      // Hidden by opacity until hover (desktop pointer), then visible.
      const actionsOpacity = async () =>
        Number(
          await copy.evaluate((node) => getComputedStyle(node.parentElement as HTMLElement).opacity),
        );
      expect(await actionsOpacity()).toBeLessThan(1);
      await copy.hover();
      await expect.poll(actionsOpacity).toBe(1);
    },
  );

  test(
    "quick actions reveal on long-press (touch)",
    { tag: ["@feature", "@feature:messenger-chat"] },
    async ({ page }) => {
      await openSession(page);
      const actions = page.getByTestId("message-actions-m2");
      const copy = page.getByTestId("message-copy-m2");
      await expect(actions).toHaveAttribute("data-shown", "false");

      // A short touch does not reveal anything (the 450 ms timer is cancelled).
      await copy.dispatchEvent("pointerdown", { pointerType: "touch" });
      await copy.dispatchEvent("pointerup", { pointerType: "touch" });
      await page.waitForTimeout(700);
      await expect(actions).toHaveAttribute("data-shown", "false");

      // A long-press reveals the actions — and keeps them (so the button can
      // actually be hit, like every messenger).
      await copy.dispatchEvent("pointerdown", { pointerType: "touch" });
      await expect(actions).toHaveAttribute("data-shown", "true", { timeout: 3000 });
      await copy.dispatchEvent("pointerup", { pointerType: "touch" });
      await expect(actions).toHaveAttribute("data-shown", "true");
      await expect(page.getByTestId("message-revert-m2")).toBeVisible();
    },
  );

  test(
    "the revert quick action opens the Revert panel with that message",
    { tag: ["@feature", "@feature:messenger-chat"] },
    async ({ page }) => {
      await openSession(page);
      // Simple mode has no Revert panel yet — the quick action reveals it and
      // preselects the message (never a dead end).
      await page.getByTestId("message-revert-m2").click();
      await expect(page.getByTestId("session-mode-expert")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("session-more-panel-revert")).toBeVisible();
      await expect(page.getByTestId("revert-message-select")).toHaveValue("m2");
    },
  );

  test(
    "the chat fits 360px without overflow",
    { tag: ["@feature", "@feature:messenger-chat"] },
    async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await openSession(page);
      const overflow = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-testid="message-item"]')];
        const worst = Math.max(...rows.map((node) => node.getBoundingClientRect().right));
        return { worst, viewport: window.innerWidth };
      });
      expect(overflow.worst).toBeLessThanOrEqual(overflow.viewport + 1);
    },
  );
});

test.describe("running strip", () => {
  test(
    "lists running work with a ticking runtime and opens the session",
    { tag: ["@feature", "@feature:running-strip"] },
    async ({ page }) => {
      await openSession(page, { runningWork: true });

      const strip = page.getByTestId("session-run-strip");
      await expect(strip).toBeVisible();
      await expect(strip).toHaveAttribute("data-running-count", "2");
      // The shell and the server's OTHER session (the open one is excluded).
      await expect(page.getByTestId("run-strip-shell-sh-1")).toContainText("sleep 60");
      const agentRow = page.getByTestId(`run-strip-agent-${OTHER_SESSION}`);
      await expect(agentRow).toContainText("Paralleler Agent");
      await expect(agentRow).toContainText("p9/m9");

      // The runtime ticks (1 Hz).
      const runtime = page.getByTestId(`run-strip-runtime-${OTHER_SESSION}`);
      await expect(runtime).toHaveText(/^\d+:\d{2}$/);
      const first = await runtime.textContent();
      await expect.poll(async () => (await runtime.textContent()) !== first, { timeout: 5000 }).toBe(true);

      // Tapping the row opens the other session through the tab mechanism.
      await agentRow.click();
      await expect(page).toHaveURL(new RegExp(`/sessions/${OTHER_SESSION}\\?server=${server.id}`), {
        timeout: 10_000,
      });
    },
  );

  test(
    "renders nothing while no work runs",
    { tag: ["@feature", "@feature:running-strip"] },
    async ({ page }) => {
      await openSession(page);
      await expect(page.getByTestId("session-run-strip")).toHaveCount(0);
    },
  );
});

test.describe("basic/expert mode", () => {
  test(
    "starts EINFACH, reveals everything in EXPERTE and persists the choice",
    { tag: ["@feature", "@feature:session-mode"] },
    async ({ page }) => {
      await openSession(page);

      // Simple: pickers, attachment extras and the Mehr… disclosure are hidden.
      await expect(page.getByTestId("session-mode-basic")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("session-agent-select")).toHaveCount(0);
      await expect(page.getByTestId("session-model-select")).toHaveCount(0);
      await expect(page.getByTestId("prompt-attachment-picker")).toHaveCount(0);
      await expect(page.getByTestId("session-more-toggle")).toHaveCount(0);
      // The chat itself stays fully usable.
      await expect(page.getByTestId("prompt-draft-input")).toBeVisible();
      await expect(page.getByTestId("prompt-send")).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("opencode-pwa:session-mode"))).toBe("basic");

      // Experte reveals every surface that exists today.
      await page.getByTestId("session-mode-expert").click();
      await expect(page.getByTestId("session-agent-select")).toBeVisible();
      await expect(page.getByTestId("session-model-select")).toBeVisible();
      await expect(page.getByTestId("prompt-attachment-picker")).toBeVisible();
      await expect(page.getByTestId("session-more-toggle")).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("opencode-pwa:session-mode"))).toBe("expert");

      // Persisted: a reload stays in Experte.
      await page.reload();
      await expect(page.getByTestId("session-more-toggle")).toBeVisible();
      await expect(page.getByTestId("session-agent-select")).toBeVisible();
      await expect(page.getByTestId("session-mode-expert")).toHaveAttribute("aria-pressed", "true");

      // And one tap back to Einfach hides them again — nothing is gone.
      await page.getByTestId("session-mode-basic").click();
      await expect(page.getByTestId("session-more-toggle")).toHaveCount(0);
      await expect(page.getByTestId("session-agent-select")).toHaveCount(0);
    },
  );
});

test.describe("picker robustness", () => {
  test(
    "shows Lädt… instead of the placeholders and fills in after the load",
    { tag: ["@feature", "@feature:picker-loading"] },
    async ({ page }) => {
      await openSession(page, { agentDelayMs: 4000 }, "expert");
      const agent = page.getByTestId("session-agent-select");
      // Loading state: one "Lädt…" option, the select disabled.
      await expect(agent).toBeDisabled();
      await expect(agent.locator("option")).toHaveCount(1);
      await expect(agent.locator("option")).toHaveText("Lädt…");
      await expect(agent).not.toHaveText("Keiner");

      // After the load: the real option replaces the placeholder.
      await expect(agent).toBeEnabled({ timeout: 10_000 });
      await expect(agent.locator("option")).toHaveCount(2);
      await expect(agent).toHaveValue("coder");
    },
  );

  test(
    "a failed first load answers with a toast and a retry, never a sticky banner",
    { tag: ["@feature", "@feature:picker-loading"] },
    async ({ page }) => {
      // The agent list stays broken until the test lets it through.
      const agentFailure = { failing: true };
      await openSession(page, { agentFailure }, "expert");

      // The old sticky red banner text is gone from the page …
      await expect(page.getByText("Agent/Modell konnte nicht gewechselt werden")).toHaveCount(0);
      // … a toast answers instead (error toasts use the alert styling) …
      await expect(page.getByText("Agent/Modell konnte nicht geladen werden").first()).toBeVisible({
        timeout: 10_000,
      });
      // … plus the one-tap retry.
      await expect(page.getByTestId("session-picker-retry")).toBeVisible();
      await expect(page.getByTestId("session-picker-retry-button")).toBeVisible();

      // The retry fills the selects once the server answers again.
      agentFailure.failing = false;
      await page.getByTestId("session-picker-retry-button").click();
      await expect(page.getByTestId("session-agent-select")).toBeEnabled({ timeout: 10_000 });
      await expect(page.getByTestId("session-agent-select")).toHaveValue("coder");
      await expect(page.getByTestId("session-picker-retry")).toHaveCount(0);
    },
  );
});

test.describe("offline", () => {
  test(
    "offline answers with one status line and blocks sending",
    { tag: ["@feature", "@feature:offline-send"] },
    async ({ page }) => {
      // No cache in a fresh context: the message list never renders, but the
      // composer and the status line must answer.
      await openSession(page, { offlineMessages: true }, undefined, false);

      // Exactly one status line, no stacked alerts.
      const status = page.getByTestId("cache-status");
      await expect(status).toContainText("Offline");
      await expect(page.locator(".alert-warning, .alert-error")).toHaveCount(0);

      // Sending is blocked: the button stays disabled …
      await page.getByTestId("prompt-draft-input").fill("Hallo, bist du da?");
      await expect(page.getByTestId("prompt-send")).toBeDisabled();
      // … Enter does not send …
      await page.getByTestId("prompt-draft-input").press("Enter");
      await page.waitForTimeout(500);
      // … and the attempt explains itself with a toast.
      await expect(
        page.getByText("Offline – Senden ist erst wieder möglich").first(),
      ).toBeVisible();
    },
  );
});
