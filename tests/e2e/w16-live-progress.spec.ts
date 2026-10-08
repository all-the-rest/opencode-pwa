import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * WAVE 2 (live turn progress):
 *  - a "Denkt…" working row while a turn is active and no assistant parts have
 *    arrived yet;
 *  - assistant text landing in the chat as `session.message.content.updated`
 *    streams it in;
 *  - an interrupted divider once `session.execution.interrupted` fires;
 *  - a provider-retry card (attempt, countdown, provider message) once
 *    `session.retry.scheduled` fires;
 *  - no stale "Läuft" tool state surviving a reload mid-run — in-flight tool
 *    parts are downgraded on cache write.
 *
 * All turn state is derived from lifecycle events on `GET /api/event` (SSE).
 * The hub reconnects when the mocked stream closes, so a request-scoped
 * counter can script a sequence of frames without any real server.
 */

const server = {
  id: "live-server",
  name: "Live-Server",
  baseUrl: "http://localhost:5173",
  username: "",
};

const SESSION = "ses-live";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** One SSE body from a batch of raw event objects. */
function sseBody(frames: unknown[]): string {
  return frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("");
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

/** Only a single user message — no assistant content — so the run has a turn but no parts. */
function singleUserMessages() {
  return { data: [{ type: "user", id: "u1", text: "Sag mir etwas", time: { created: 1000 } }], cursor: {} };
}

/**
 * Mock every non-event route the session page touches and drive `/api/event`
 * through `framesFor(requestIndex)`. `online` gates `message.list` so a test
 * can force the offline-cache path on reload.
 */
async function mockApi(
  page: Page,
  options: {
    messages: () => unknown;
    framesFor: (requestIndex: number) => unknown[];
    online: { current: boolean };
  },
) {
  await page.route("**/api/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/api/event")) {
      // A per-connection counter (closure per connection) — each reconnect is a
      // fresh request, advancing the script. The last frame repeats forever.
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sseBody(options.framesFor(eventCounter.value++)),
      });
      return;
    }
    if (/\/message/.test(url)) {
      if (!options.online.current) {
        await route.abort("failed");
        return;
      }
      await json(route, options.messages());
      return;
    }
    if (url.includes("/experimental/session/stats")) {
      await json(route, { data: { sessions: 0, prompts: 0, steps: 0 } });
      return;
    }
    if (new RegExp(`/api/session/${SESSION}$`).test(url)) {
      await json(route, { data: { id: SESSION, agent: "coder" } });
      return;
    }
    if (url.includes("/api/agent")) {
      await json(route, { data: [{ id: "coder", name: "Coder", mode: "primary" }] });
      return;
    }
    if (url.includes("/api/model")) {
      await json(route, { data: [{ modelID: "m1", providerID: "p1", name: "Model" }] });
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      await json(route, { data: [{ id: SESSION, title: "Live-Test", projectKey: null }], cursor: {} });
      return;
    }
    await json(route, { data: [] });
  });
}

// One counter shared across the module-level mock installation; reset per test
// by re-installing the route (Playwright replaces the handler per `route`).
let eventCounter = { value: 0 };

async function openLiveSession(
  page: Page,
  options: Parameters<typeof mockApi>[1],
) {
  eventCounter = { value: 0 };
  await seedServer(page);
  await mockApi(page, options);
  await page.goto(`/sessions/${SESSION}?server=${server.id}`);
  await expect(page.getByTestId("cache-status")).toContainText("live");
}

test(
  "a working 'Denkt…' row shows while a turn runs with no assistant parts yet",
  { tag: ["@feature", "@feature:live-progress"] },
  async ({ page }) => {
    const online = { current: true };
    await openLiveSession(page, {
      messages: singleUserMessages,
      // Repeated execution.started keeps the run active with no content, so the
      // working row persists across reconnects.
      framesFor: () => [{ type: "session.execution.started", data: { sessionID: SESSION } }],
      online,
    });

    const working = page.getByTestId("run-working");
    await expect(working).toBeVisible();
    await expect(working).toContainText("Denkt");
    // Shimmer (wave 1's tool-title shimmer) drives the animated text.
    await expect(working.locator(".tool-title-shimmer")).toBeVisible();
  },
);

test(
  "streamed assistant text lands in the chat as content.updated grows the message",
  { tag: ["@feature", "@feature:live-progress"] },
  async ({ page }) => {
    const online = { current: true };
    await openLiveSession(page, {
      messages: singleUserMessages,
      framesFor: (n) => {
        const started = { type: "session.execution.started", data: { sessionID: SESSION } };
        const snapshot = (text: string) => ({
          type: "session.message.content.updated",
          created: 2000 + n,
          data: { sessionID: SESSION, messageID: "a-1", content: [{ type: "text", text }] },
        });
        // First connection: a partial sentence. Reconnects: the grown answer.
        if (n === 0) return [started, snapshot("Hallo, ich")];
        return [started, snapshot("Hallo, ich helfe dir gerne.")];
      },
      online,
    });

    // The assistant message appears and carries the streamed text.
    const assistant = page.locator('li[data-role="assistant"]');
    await expect(assistant).toBeVisible();
    await expect(assistant).toContainText("ich helfe dir gerne");
    // Once text has arrived, the working row retires.
    await expect(page.getByTestId("run-working")).toHaveCount(0);
  },
);

test(
  "an interrupted divider appears after session.execution.interrupted",
  { tag: ["@feature", "@feature:live-progress"] },
  async ({ page }) => {
    const online = { current: true };
    await openLiveSession(page, {
      messages: singleUserMessages,
      framesFor: () => [{ type: "session.execution.interrupted", data: { sessionID: SESSION, reason: "user" } }],
      online,
    });

    const divider = page.getByTestId("run-interrupted");
    await expect(divider).toBeVisible();
    await expect(divider).toContainText("Ausführung unterbrochen");
  },
);

test(
  "a provider-retry card shows attempt, countdown and provider message",
  { tag: ["@feature", "@feature:live-progress"] },
  async ({ page }) => {
    const online = { current: true };
    const nextAttemptAt = Date.now() + 600_000; // ~10 min → countdown stays stable
    await openLiveSession(page, {
      messages: singleUserMessages,
      framesFor: () => [
        {
          type: "session.retry.scheduled",
          data: {
            sessionID: SESSION,
            assistantMessageID: "a-1",
            attempt: 2,
            at: nextAttemptAt,
            error: { type: "TooManyRequests", message: "rate limited, slow down" },
          },
        },
      ],
      online,
    });

    const retry = page.getByTestId("run-retry");
    await expect(retry).toBeVisible();
    await expect(retry).toContainText("Neuer Versuch");
    await expect(page.getByTestId("run-retry-attempt")).toContainText("Versuch 2");
    await expect(page.getByTestId("run-retry-message")).toContainText("rate limited, slow down");
    // Countdown derives from `at` minus now.
    await expect(page.getByTestId("run-retry-countdown")).toContainText(/\d+\s*s/);
  },
);

test(
  "a running tool part does not resurrect 'Läuft' after a reload mid-run",
  { tag: ["@feature", "@feature:live-progress"] },
  async ({ page }) => {
    const online = { current: true };
    const messages = {
      data: [
        { type: "user", id: "u1", text: "Führ das aus", time: { created: 1000 } },
        {
          type: "assistant",
          id: "a-run",
          content: [
            { type: "tool", id: "t0", name: "bash", state: { status: "running", input: { command: "pnpm test" } } },
          ],
          time: { created: 2000 },
        },
      ],
      cursor: {},
    };

    await openLiveSession(page, {
      messages: () => messages,
      // No lifecycle transition needed: the tool part's own `running` status
      // (from message.list) is independent of run state, so a session-less
      // idle no-op keeps the run idle while the live card reads "Läuft".
      framesFor: () => [{ type: "session.idle" }],
      online,
    });

    // Online (mid-run): the tool card is live and reads "Läuft".
    const tool = page.getByTestId("message-tool-a-run-0");
    await expect(tool).toHaveAttribute("data-status", "running");
    await expect(tool).toContainText("Läuft");
    // Give the app a moment to persist the downgraded row.
    await expect(tool).toBeVisible();

    // Reload while "mid-run" and OFFLINE so the view comes only from the cache.
    online.current = false;
    await page.reload();

    await expect(page.getByTestId("cache-status")).toContainText("offline aus Zwischenspeicher");
    const cached = page.getByTestId("message-tool-a-run-0");
    await expect(cached).toBeVisible();
    // The in-flight state was downgraded on write: never "Läuft" again.
    await expect(cached).toHaveAttribute("data-status", "unknown");
    await expect(cached).not.toContainText("Läuft");
  },
);
