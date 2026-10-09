import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * WAVE 3 (composer + type/density layer, parity with the original's
 * `PromptInputV2`):
 *  - the autogrowing textarea: Enter sends, Shift+Enter inserts a newline, the
 *    editor clamps at its max height and then scrolls;
 *  - Send becomes Stop while a turn runs, and Stop interrupts the session;
 *  - agent/model/variant picks live in the composer as chips (same selects);
 *  - drag & drop and the file picker produce removable attachment cards;
 *  - at 360px the composer and the jump button never overlap.
 */

const server = {
  id: "composer-server",
  name: "Composer-Server",
  baseUrl: "http://composer.local",
  username: "",
};

const SESSION = "ses-composer";

interface PromptCall {
  sessionID: string;
  text: string;
  files: Array<Record<string, unknown>>;
}

interface CallLog {
  prompts: PromptCall[];
  interrupts: string[];
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function sseBody(frames: unknown[]): string {
  return frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("");
}

async function seedServer(page: Page, mode?: "expert") {
  await page.addInitScript(
    ({ value, sessionMode }) => {
      localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
      // Wave 6: the agent/model picks live behind the Experte mode (default is
      // Einfach); specs that exercise them seed it.
      if (sessionMode !== null) localStorage.setItem("opencode-pwa:session-mode", sessionMode);
    },
    { value: server, sessionMode: mode ?? null },
  );
}

const singleUserMessages = {
  // Enough turns to make the page scrollable, so the jump button can appear
  // even at a tall viewport (needed by the 360px overlap test).
  data: [
    ...Array.from({ length: 8 }, (_, index) => [
      { type: "user", id: `u${index}`, text: `Frage ${index}`, time: { created: 1000 + index * 10 } },
      {
        type: "assistant",
        id: `a${index}`,
        agent: "coder",
        model: { id: "m1", providerID: "p1" },
        content: [{ type: "text", text: `Antwort ${index}` }],
        time: { created: 1005 + index * 10, completed: 1400 + index * 10 },
      },
    ]).flat(),
  ],
  cursor: {},
};

/**
 * Mock everything the session page touches. `framesFor` scripts the SSE
 * stream, so a test can keep a turn running (Stop button) or leave the
 * session idle.
 */
async function mockApi(page: Page, log: CallLog, framesFor: () => unknown[]) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sseBody(framesFor()),
      });
      return;
    }
    const promptMatch = url.match(/\/api\/session\/([^/]+)\/prompt$/);
    if (promptMatch !== null && request.method() === "POST") {
      const body = (request.postDataJSON() ?? {}) as { text?: unknown; files?: unknown };
      log.prompts.push({
        sessionID: promptMatch[1] ?? "",
        text: typeof body.text === "string" ? body.text : "",
        files: Array.isArray(body.files) ? (body.files as PromptCall["files"]) : [],
      });
      await json(route, { id: "inbox-1" });
      return;
    }
    const interruptMatch = url.match(/\/api\/session\/([^/]+)\/interrupt$/);
    if (interruptMatch !== null && request.method() === "POST") {
      log.interrupts.push(interruptMatch[1] ?? "");
      await json(route, {});
      return;
    }
    if (/\/message/.test(url)) {
      await json(route, singleUserMessages);
      return;
    }
    if (url.includes("/api/agent")) {
      await json(route, { data: [{ id: "coder", name: "Coder", mode: "primary" }] });
      return;
    }
    if (url.includes("/api/model")) {
      await json(route, {
        data: [{ modelID: "m1", providerID: "p1", name: "Modell Eins", variants: [{ id: "high" }] }],
      });
      return;
    }
    if (new RegExp(`/api/session/${SESSION}$`).test(url)) {
      await json(route, {
        data: { id: SESSION, agent: "coder", model: { id: "m1", providerID: "p1", variant: "high" } },
      });
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      await json(route, { data: [{ id: SESSION, title: "Composer-Test", projectKey: null }], cursor: {} });
      return;
    }
    await json(route, { data: [] });
  });
}

async function openSession(
  page: Page,
  log: CallLog,
  framesFor: () => unknown[] = () => [{ type: "session.idle" }],
  mode?: "expert",
) {
  await seedServer(page, mode);
  await mockApi(page, log, framesFor);
  await page.goto(`/sessions/${SESSION}?server=${server.id}`);
  await expect(page.getByTestId("session-composer")).toBeVisible();
  // Wait until the message list answered (the status line reads "live" even
  // while empty, so key off the rendered rows) so the initial scroll-to-bottom
  // has happened before a test scrolls the window itself.
  await expect(page.getByTestId("message-item").first()).toBeVisible();
}

test.describe("composer", () => {
  test("Enter sends the draft, Shift+Enter inserts a newline", { tag: ["@feature", "@feature:composer"] }, async ({
    page,
  }) => {
    const log: CallLog = { prompts: [], interrupts: [] };
    await openSession(page, log);

    const draft = page.getByTestId("prompt-draft-input");
    await draft.click();
    await draft.pressSequentially("Zeile eins");
    // Shift+Enter must not send — it adds a line break instead.
    await draft.press("Shift+Enter");
    await draft.pressSequentially("Zeile zwei");
    expect(await draft.inputValue()).toBe("Zeile eins\nZeile zwei");
    expect(log.prompts).toHaveLength(0);

    // The send button (accessible name unchanged) submits the draft.
    await page.getByRole("button", { name: "Nachricht senden" }).click();
    await expect.poll(() => log.prompts.length, { timeout: 10_000 }).toBe(1);
    expect(log.prompts[0]).toMatchObject({ sessionID: SESSION, text: "Zeile eins\nZeile zwei", files: [] });
    // The composer clears after sending.
    await expect(draft).toHaveValue("");
  });

  test("Enter alone also sends", { tag: ["@feature", "@feature:composer"] }, async ({ page }) => {
    const log: CallLog = { prompts: [], interrupts: [] };
    await openSession(page, log);

    const draft = page.getByTestId("prompt-draft-input");
    await draft.click();
    await draft.pressSequentially("Hallo");
    await draft.press("Enter");
    await expect.poll(() => log.prompts.map((p) => p.text), { timeout: 10_000 }).toEqual(["Hallo"]);
  });

  test("the editor autogrows and clamps at its max height", { tag: ["@feature", "@feature:composer"] }, async ({
    page,
  }) => {
    await openSession(page, { prompts: [], interrupts: [] });
    const draft = page.getByTestId("prompt-draft-input");
    const start = await draft.boundingBox();

    await draft.click();
    for (let line = 0; line < 20; line += 1) {
      await draft.press(line === 0 ? "End" : "Shift+Enter");
      await draft.pressSequentially(`Zeile ${line}`);
    }

    const clamped = await draft.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return {
        height: node.getBoundingClientRect().height,
        maxHeight: Number.parseFloat(style.maxHeight),
        overflowY: style.overflowY,
        scrolls: node.scrollHeight > node.clientHeight,
      };
    });
    const grown = await draft.boundingBox();
    expect(grown?.height ?? 0).toBeGreaterThan(start?.height ?? 0);
    // Clamped: the box stops growing, caps at ~180px and scrolls instead.
    expect(clamped.height).toBeLessThanOrEqual(181);
    expect(clamped.scrolls).toBe(true);
    expect(["auto", "scroll"]).toContain(clamped.overflowY);
  });

  test("the primary button becomes Stop while a turn runs and interrupts it", { tag: ["@feature", "@feature:composer"] }, async ({
    page,
  }) => {
    const log: CallLog = { prompts: [], interrupts: [] };
    await openSession(page, log, () => [{ type: "session.execution.started", data: { sessionID: SESSION } }]);

    // Send retires, Stop takes its place.
    await expect(page.getByTestId("prompt-stop")).toBeVisible();
    await expect(page.getByTestId("prompt-send")).toHaveCount(0);

    await page.getByTestId("prompt-stop").click();
    await expect.poll(() => log.interrupts, { timeout: 10_000 }).toEqual([SESSION]);
    // The toast confirms the interrupt.
    await expect(page.getByText("Ausführung unterbrochen").first()).toBeVisible();
  });

  test("agent and model picks are reachable inside the composer", { tag: ["@feature", "@feature:composer"] }, async ({
    page,
  }) => {
    // Wave 6: the picks hide in Einfach mode — this spec runs in Experte.
    await openSession(page, { prompts: [], interrupts: [] }, undefined, "expert");
    const composer = page.getByTestId("session-composer");
    const agent = composer.getByTestId("session-agent-select");
    const model = composer.getByTestId("session-model-select");
    await expect(agent).toBeVisible();
    await expect(model).toBeVisible();
    // Same options as the previous selects above the chat.
    await expect(agent.locator("option")).toHaveCount(2); // "Keiner" + Coder
    await expect(agent).toHaveValue("coder");
    await expect(model.locator("option")).toHaveCount(2); // "Keines" + one variant
    await expect(model).toHaveValue("p1/m1#high");
  });

  test("the file picker attaches a removable card", { tag: ["@feature", "@feature:composer"] }, async ({ page }) => {
    const log: CallLog = { prompts: [], interrupts: [] };
    await openSession(page, log);

    await page.getByTestId("prompt-attachment-file-input").setInputFiles({
      name: "notizen.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hallo welt"),
    });

    const card = page.getByTestId("prompt-attachments").locator("li").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("notizen.txt");
    // 160px card, two lines (name + type).
    const box = await card.boundingBox();
    expect(box?.width).toBeGreaterThan(150);
    expect(box?.width).toBeLessThan(180);

    // Removing the card leaves the composer empty again.
    await page.getByRole("button", { name: "Anhang notizen.txt entfernen" }).click();
    await expect(page.getByTestId("prompt-attachments")).toHaveCount(0);
  });

  test("dropping files onto the composer attaches them", { tag: ["@feature", "@feature:composer"] }, async ({
    page,
  }) => {
    const log: CallLog = { prompts: [], interrupts: [] };
    await openSession(page, log);

    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(["bildbytes"], "shot.png", { type: "image/png" }));
      return data;
    });
    await page.getByTestId("session-composer").dispatchEvent("drop", { dataTransfer: transfer });

    const card = page.getByTestId("prompt-attachments").locator("li").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("shot.png");
    // Image data allows an inline preview.
    await expect(card.locator("img")).toBeVisible();
  });

  test("dropped files travel as inline base64 attachments", { tag: ["@feature", "@feature:composer"] }, async ({
    page,
  }) => {
    const log: CallLog = { prompts: [], interrupts: [] };
    await openSession(page, log);

    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(["hallo"], "notizen.txt", { type: "text/plain" }));
      return data;
    });
    await page.getByTestId("session-composer").dispatchEvent("drop", { dataTransfer: transfer });
    await expect(page.getByTestId("prompt-attachments")).toBeVisible();

    await page.getByTestId("prompt-draft-input").fill("Erkläre den Anhang");
    await page.getByRole("button", { name: "Nachricht senden" }).click();

    await expect.poll(() => log.prompts.length, { timeout: 10_000 }).toBe(1);
    expect(log.prompts[0]?.files).toEqual([
      { data: "aGFsbG8=", mime: "text/plain", source: { type: "inline" }, name: "notizen.txt" },
    ]);
  });

  test("workspace path chips keep working and send a file:// uri source", { tag: ["@feature", "@feature:composer"] }, async ({
    page,
  }) => {
    const log: CallLog = { prompts: [], interrupts: [] };
    // Wave 6: the path-attach field hides in Einfach mode — run in Experte.
    await openSession(page, log, undefined, "expert");

    await page.getByTestId("prompt-attachment-input").fill("src/app.ts");
    await page.getByRole("button", { name: "Datei anhängen" }).click();
    await expect(page.getByTestId("prompt-attachment-src/app.ts")).toBeVisible();

    await page.getByTestId("prompt-draft-input").fill("Erkläre diese Datei");
    await page.getByRole("button", { name: "Nachricht senden" }).click();
    await expect.poll(() => log.prompts.length, { timeout: 10_000 }).toBe(1);
    expect(log.prompts[0]?.files).toEqual([
      { data: "", mime: "", source: { type: "uri", uri: "file:///src/app.ts" }, name: "app.ts" },
    ]);
  });
});

test.describe("composer at 360px", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("the composer and the jump button never overlap", { tag: ["@feature", "@feature:composer"] }, async ({ page }) => {
    const log: CallLog = { prompts: [], interrupts: [] };
    await openSession(page, log);
    // Scroll away from the bottom so the jump button shows.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("scroll"));
    });
    await expect(page.getByTestId("jump-to-newest")).toBeVisible();

    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => {
        const node = document.querySelector(selector);
        if (node === null) return null;
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        jump: rect('[data-testid="jump-to-newest"]'),
        composer: rect('[data-testid="session-composer"]'),
        draft: rect('[data-testid="prompt-draft-input"]'),
        // Wave 6: the agent/model picks hide in Einfach mode, so the layout
        // check uses the send button (always present) as the control row.
        controls: rect('[data-testid="prompt-send"]'),
        viewportWidth: window.innerWidth,
      };
    });
    expect(boxes.jump).not.toBeNull();
    expect(boxes.composer).not.toBeNull();
    if (boxes.jump === null || boxes.composer === null || boxes.draft === null || boxes.controls === null) return;

    const intersects = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

    expect(intersects(boxes.jump, boxes.composer)).toBe(false);
    expect(intersects(boxes.jump, boxes.draft)).toBe(false);
    expect(intersects(boxes.jump, boxes.controls)).toBe(false);
    // Nothing overflows the 360px viewport.
    for (const box of [boxes.composer, boxes.draft, boxes.controls]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(boxes.viewportWidth + 1);
    }
    // The jump button stays fully above the composer.
    expect(boxes.jump.y + boxes.jump.height).toBeLessThanOrEqual(boxes.composer.y + 1);
  });
});
