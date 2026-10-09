import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * WAVE 7 (live delta folding): the reasoning must grow *during* a run.
 *
 * A live server was measured over one active turn: the stream carried
 * `session.reasoning.delta` in high frequency (92 frames in 12 seconds) while
 * `session.message.content.updated` did not appear at all — so the UI showed the
 * working row and then the finished message, but never the live text. These
 * tests script exactly that stream (deltas only, no snapshot) and prove:
 *
 *   1. the reasoning text grows on screen as the frames arrive, open and with a
 *      caret — never hidden behind "Denken anzeigen";
 *   2. the authoritative snapshot replaces the streamed row wholesale, so the
 *      caret and every delta marker disappear;
 *   3. a reload mid-run shows no half-streamed row: deltas never reach the cache.
 *
 * Payload shapes verified in the installed client
 * (`@opencode/client/dist/promise/generated/types.d.ts`):
 *   `session.text.delta`       (lines 1506-1520): { sessionID, assistantMessageID, ordinal, delta }
 *   `session.reasoning.delta`  (lines 1521-1535): { sessionID, assistantMessageID, ordinal, delta }
 *   `session.tool.input.delta` (lines 1536-1550): { sessionID, assistantMessageID, id, delta }
 */

const server = {
  id: "delta-server",
  name: "Delta-Server",
  baseUrl: "http://localhost:5173",
  username: "",
};

const SESSION = "ses-delta";
const MESSAGE = "a-1";

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

/** Only a single user message: the assistant turn exists purely as deltas. */
function singleUserMessages() {
  return {
    data: [{ type: "user", id: "u1", text: "Denk laut nach", time: { created: 1000 } }],
    cursor: {},
  };
}

const started = { type: "session.execution.started", data: { sessionID: SESSION } };

function reasoningDelta(ordinal: number, delta: string) {
  return {
    type: "session.reasoning.delta",
    created: 5000,
    data: { sessionID: SESSION, assistantMessageID: MESSAGE, ordinal, delta },
  };
}

function textDelta(ordinal: number, delta: string) {
  return {
    type: "session.text.delta",
    created: 5000,
    data: { sessionID: SESSION, assistantMessageID: MESSAGE, ordinal, delta },
  };
}

/** The authoritative refresh for the same assistant message. */
function contentSnapshot(reasoning: string, answer: string) {
  return {
    type: "session.message.content.updated",
    created: 6000,
    data: {
      sessionID: SESSION,
      messageID: MESSAGE,
      content: [
        { type: "reasoning", text: reasoning },
        { type: "text", text: answer },
      ],
    },
  };
}

/**
 * Mock every non-event route the session page touches and drive `/api/event`
 * through `framesFor(requestIndex)`. `online` gates `message.list`, so a test can
 * force the offline-cache path on reload.
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
      // A per-connection counter: each reconnect is a fresh request, advancing
      // the script. The last batch repeats for the rest of the test.
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
      await json(route, { data: [{ id: SESSION, title: "Delta-Test", projectKey: null }], cursor: {} });
      return;
    }
    await json(route, { data: [] });
  });
}

// One counter shared across the module-level mock installation; reset per test
// by re-installing the route (Playwright replaces the handler per `route`).
let eventCounter = { value: 0 };

async function openDeltaSession(page: Page, options: Parameters<typeof mockApi>[1]) {
  eventCounter = { value: 0 };
  await seedServer(page);
  await mockApi(page, options);
  await page.goto(`/sessions/${SESSION}?server=${server.id}`);
  await expect(page.getByTestId("cache-status")).toContainText("live");
}

/** Message ids currently in the IndexedDB message cache. */
function cachedMessageIDs(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("opencode-pwa-message-cache");
        open.onsuccess = () => {
          const request = open.result
            .transaction("messages", "readonly")
            .objectStore("messages")
            .getAllKeys();
          request.onsuccess = () => {
            const keys = (request.result as IDBValidKey[]).map(String);
            resolve(keys.map((key) => key.split(":").pop() ?? key));
          };
          request.onerror = () => resolve([]);
        };
        open.onerror = () => resolve([]);
      }),
  );
}

test(
  "the reasoning grows live from delta frames — open, with a caret, no working row",
  { tag: ["@feature", "@feature:live-delta"] },
  async ({ page }) => {
    const online = { current: true };
    await openDeltaSession(page, {
      messages: singleUserMessages,
      // Every connection streams fragments only. No `content.updated` anywhere:
      // exactly the measured live stream. The last batch repeats forever.
      framesFor: (n) => {
        if (n === 0) return [started, reasoningDelta(0, "Ich ")];
        if (n === 1) return [started, reasoningDelta(0, "überlege "), reasoningDelta(0, "mir das")];
        if (n === 2) return [started, textDelta(1, "Fertig")];
        return [started];
      },
      online,
    });

    const reasoning = page.getByTestId(`message-reasoning-${MESSAGE}-0`);
    await expect(reasoning).toBeVisible();
    // "Ich möchte das denken sehen": the block is force-open while the stream
    // appends to it, otherwise the text hides behind "Denken anzeigen".
    await expect(reasoning).toHaveJSProperty("open", true);
    await expect(reasoning).toHaveAttribute("data-live", "true");
    // All three fragments landed, in order, in one part — nothing else could
    // produce this string, because no snapshot was ever sent.
    await expect(reasoning).toContainText("Ich überlege mir das", { timeout: 15_000 });
    // The caret marks the part as live, not as finished text.
    await expect(page.getByTestId(`stream-caret-${MESSAGE}-0`)).toBeVisible();

    // The answer text arrives in its own bubble, also live.
    const assistant = page.locator('li[data-role="assistant"]');
    await expect(assistant).toContainText("Fertig", { timeout: 15_000 });
    await expect(page.getByTestId(`stream-caret-${MESSAGE}-1`)).toBeVisible();

    // No "Denkt…" working row anymore: the message id came from the delta.
    await expect(page.getByTestId("run-working")).toHaveCount(0);
    // The settled user message is untouched above it.
    await expect(page.locator('li[data-role="user"]')).toContainText("Denk laut nach");
  },
);

test(
  "an authoritative snapshot replaces the streamed row wholesale",
  { tag: ["@feature", "@feature:live-delta"] },
  async ({ page }) => {
    const online = { current: true };
    await openDeltaSession(page, {
      messages: singleUserMessages,
      framesFor: (n) =>
        n === 0
          ? [started, reasoningDelta(0, "ungefäh"), textDelta(1, "Halb fer")]
          : [started, contentSnapshot("ungefähre Überlegung", "Fertig.")],
      online,
    });

    const reasoning = page.getByTestId(`message-reasoning-${MESSAGE}-0`);
    await expect(reasoning).toContainText("ungefähre Überlegung", { timeout: 15_000 });
    // The row is now the server's own text, exactly — no delta text merged in.
    await expect(reasoning).toHaveText("Denken anzeigenungefähre Überlegung");

    const assistant = page.locator('li[data-role="assistant"]');
    await expect(assistant).toContainText("Fertig.", { timeout: 15_000 });
    // Every live marker is gone: no caret, and the reasoning collapsed again.
    await expect(page.getByTestId(`stream-caret-${MESSAGE}-0`)).toHaveCount(0);
    await expect(page.getByTestId(`stream-caret-${MESSAGE}-1`)).toHaveCount(0);
    await expect(reasoning).toHaveJSProperty("open", false);
    expect(await assistant.textContent()).not.toContain("Halb fer");
  },
);

test(
  "a reload mid-run shows no half-streamed row",
  { tag: ["@feature", "@feature:live-delta"] },
  async ({ page }) => {
    const online = { current: true };
    await openDeltaSession(page, {
      messages: singleUserMessages,
      // Only the very first connection carries delta frames; every later one
      // (including the one after the reload) keeps the run active but streams
      // nothing.
      framesFor: (n) =>
        n === 0
          ? [
              started,
              reasoningDelta(0, "Ich denke "),
              reasoningDelta(0, "laut nach"),
              textDelta(1, "Halb fertige"),
            ]
          : [started],
      online,
    });

    const reasoning = page.getByTestId(`message-reasoning-${MESSAGE}-0`);
    await expect(reasoning).toContainText("Ich denke laut nach");
    await expect(page.locator('li[data-role="assistant"]')).toContainText("Halb fertige");
    await expect(page.getByTestId(`stream-caret-${MESSAGE}-0`)).toBeVisible();

    // Only the settled user message reached the cache — the streamed assistant
    // row is nowhere in it, so there is nothing to resurrect.
    await expect.poll(() => cachedMessageIDs(page), { timeout: 10_000 }).toEqual(["u1"]);

    // Reload while the turn is still running and OFFLINE, so the view comes
    // only from the cache.
    online.current = false;
    await page.reload();

    await expect(page.getByTestId("cache-status")).toContainText("Offline");
    await expect(page.locator('li[data-role="user"]')).toContainText("Denk laut nach");
    // Nothing half-streamed survived.
    await expect(page.getByTestId(`message-reasoning-${MESSAGE}-0`)).toHaveCount(0);
    await expect(page.locator('li[data-role="assistant"]')).toHaveCount(0);
    await expect(page.getByTestId("stream-caret")).toHaveCount(0);
  },
);
