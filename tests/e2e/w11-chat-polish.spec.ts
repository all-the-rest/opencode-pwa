import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W11 (chat polish wave against the built-in web UI):
 *  - the "Neueste" jump button floats centered above the composer and never
 *    overlaps the attach row or the composer at 360px width;
 *  - long tool/file lists collapse after five entries ("N weitere anzeigen");
 *  - code walls are capped with internal scroll and carry a copy button;
 *  - idle/compaction status notes stay bare centered lines (no "unknown"
 *    fallback — reserved for truly foreign types).
 */

const server = {
  id: "polish-server",
  name: "Polish-Server",
  baseUrl: "http://polish.local",
  username: "",
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

const codeLines = Array.from({ length: 60 }, (_, i) => `const row${i} = ${i};`).join("\n");

function messagePayload() {
  const at = (created: number) => ({ created });
  const files = Array.from({ length: 8 }, (_, i) => ({
    uri: `file:///src/file-${i + 1}.ts`,
    name: `file-${i + 1}.ts`,
  }));
  return {
    data: [
      { type: "user", id: "m1", text: "Liste alle Dateien", files, time: at(1000) },
      {
        type: "assistant",
        id: "m2",
        agent: "coder",
        content: [{ type: "text", text: `Hier der Code:\n\`\`\`ts\n${codeLines}\n\`\`\`` }],
        time: at(2000),
      },
      { type: "idle", id: "m3", outcome: "succeeded", time: at(3000) },
      { type: "future-thing", id: "m4", payload: { deep: [1] }, time: at(4000) },
    ],
    cursor: { next: null, previous: null },
  };
}

async function mockApi(page: Page) {
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
    if (/\/api\/session\/ses-9\/message/.test(url)) {
      await json(route, messagePayload());
      return;
    }
    if (/\/api\/session\/ses-9$/.test(url) && route.request().method() === "GET") {
      await json(route, { data: { id: "ses-9", agent: "coder" } });
      return;
    }
    if (url.includes("/api/agent")) {
      await json(route, {
        location: {},
        data: [{ id: "coder", name: "Coder", mode: "primary" }],
      });
      return;
    }
    if (url.match(/\/api\/session(\?|$)/)) {
      await json(route, {
        data: [{ id: "ses-9", title: "Polish-Test", projectKey: null }],
        cursor: { next: null, previous: null },
      });
      return;
    }
    await json(route, { location: {}, data: [] });
  });
}

async function openSession(page: Page) {
  await seedServer(page);
  await mockApi(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/sessions/ses-9?server=${server.id}`);
  await expect(page.getByTestId("message-list")).toBeVisible();
  await expect(page.getByTestId("session-composer")).toBeVisible();
}

test(
  "jump button floats centered above the composer without overlap",
  { tag: ["@feature", "@feature:chat-polish"] },
  async ({ page }) => {
    await openSession(page);
    // Leave the bottom so the jump button appears (it auto-hides at bottom).
    await page.evaluate(() => window.scrollTo(0, 0));
    const jump = page.getByTestId("jump-to-newest");
    await expect(jump).toBeVisible();

    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => {
        const node = document.querySelector(selector);
        if (node === null) return null;
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        jump: rect('[data-testid="jump-to-newest"]'),
        attach: rect('[data-testid="prompt-attachment-input"]'),
        composer: rect('[data-testid="session-composer"]'),
        viewportWidth: window.innerWidth,
      };
    });
    expect(boxes.jump).not.toBeNull();
    expect(boxes.attach).not.toBeNull();
    expect(boxes.composer).not.toBeNull();
    if (boxes.jump === null || boxes.attach === null || boxes.composer === null) return;

    const intersects = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    expect(intersects(boxes.jump, boxes.attach)).toBe(false);
    expect(intersects(boxes.jump, boxes.composer)).toBe(false);

    // Centered horizontally and fully above the composer.
    const jumpCenter = boxes.jump.x + boxes.jump.width / 2;
    expect(Math.abs(jumpCenter - boxes.viewportWidth / 2)).toBeLessThan(60);
    expect(boxes.jump.y + boxes.jump.height).toBeLessThanOrEqual(boxes.composer.y + 1);
  },
);

test(
  "long file lists collapse after five entries",
  { tag: ["@feature", "@feature:chat-polish"] },
  async ({ page }) => {
    await openSession(page);
    const list = page.getByTestId("message-files-m1-1");
    await expect(list).toBeVisible();
    await expect(list).toContainText("file-5.ts");
    await expect(list).toContainText("3 weitere anzeigen");
    await expect(list.getByText("file-8.ts")).toBeHidden();

    await list.locator("summary").click();
    await expect(list.getByText("file-8.ts")).toBeVisible();
  },
);

test(
  "code walls are capped and copyable, status notes stay bare",
  { tag: ["@feature", "@feature:chat-polish"] },
  async ({ page }) => {
    await openSession(page);

    const cap = await page.evaluate(() => {
      const pre = document.querySelector('[data-testid^="markdown-code-"] pre');
      if (pre === null) return null;
      const style = window.getComputedStyle(pre);
      return { maxHeight: style.maxHeight, overflowY: style.overflowY };
    });
    expect(cap).not.toBeNull();
    expect(cap?.maxHeight).not.toBe("none");
    expect(["auto", "scroll"]).toContain(cap?.overflowY);
    await expect(page.locator('[data-testid^="markdown-copy-"]').first()).toBeVisible();
    await expect(page.getByTestId("message-copy-m2")).toBeVisible();

    // Idle renders as a bare centered status note — never "unknown".
    await expect(page.getByTestId("message-note-m3")).toContainText("Leerlauf");
    await expect(page.getByTestId("message-note-m3")).not.toContainText("Unbekannter Inhalt");
    // Truly foreign types keep the fallback.
    await expect(page.getByTestId("message-note-m4")).toContainText("Unbekannter Inhalt");
  },
);
