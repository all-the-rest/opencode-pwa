import { expect, test, type Page } from "@playwright/test";

const server = {
  id: "e2e-server",
  name: "E2E-Server",
  baseUrl: "http://localhost:5173",
  username: "",
  password: "",
};

const SESSION_ID = "stream-cache-session";
const MESSAGE_COUNT = 60;
const PAGE_SIZE = 25;

function messagePayload() {
  return {
    data: Array.from({ length: MESSAGE_COUNT }, (_, index) => ({
      id: `msg-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
      text: `Nachricht ${index + 1}`,
    })),
    cursor: {},
  };
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

async function mockApi(page: Page, online: { current: boolean }) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }
    if (url.includes("/message")) {
      if (!online.current) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(messagePayload()),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function waitForCache(page: Page, count: number) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const open = indexedDB.open("opencode-pwa-message-cache");
              open.onsuccess = () => {
                const db = open.result;
                const tx = db.transaction("messages", "readonly");
                const request = tx.objectStore("messages").count();
                request.onsuccess = () => {
                  resolve(request.result);
                };
                request.onerror = () => {
                  resolve(-1);
                };
              };
              open.onerror = () => {
                resolve(-1);
              };
            }),
        ),
      { timeout: 10_000 },
    )
    .toBe(count);
}

async function loadAll(page: Page) {
  const items = page.getByTestId("message-item");
  const moreButton = page.getByRole("button", { name: "Ältere Nachrichten laden" });
  await page.getByTestId("load-more-sentinel").scrollIntoViewIfNeeded();
  // The button is replaced while the IntersectionObserver auto-loads, so a
  // fixed click loop flakes (~1/8): a detached click throws and the loop
  // times out. Poll the loaded count instead and treat a replaced button as
  // "auto-load in progress, try again on the next poll".
  await expect
    .poll(
      async () => {
        try {
          if (await moreButton.isVisible()) {
            await moreButton.click({ timeout: 1000 });
          }
        } catch {
          // Detached during auto-load — the count below shows the progress.
        }
        return items.count();
      },
      { timeout: 15_000 },
    )
    .toBe(MESSAGE_COUNT);
}

test(
  "aelteste oben, neueste unten, aeltere per Infinite Scroll nach oben nachladen",
  { tag: ["@feature", "@feature:stream-cache"] },
  async ({ page }) => {
    const online = { current: true };
    await seedServer(page);
    await mockApi(page, online);
    await page.goto(`/sessions/${SESSION_ID}?server=${server.id}`);

    await expect(page.getByTestId("cache-status")).toContainText("live");
    const items = page.getByTestId("message-item");
    // Chat-Stil: Fenster der neuesten 25, älteste oben, neueste unten.
    await expect(items).toHaveCount(PAGE_SIZE);
    await expect(items.first()).toContainText("Nachricht 36");
    await expect(items.last()).toContainText("Nachricht 60");

    await loadAll(page);
    await expect(items.first()).toContainText("Nachricht 1");
    await expect(items.last()).toContainText("Nachricht 60");
  },
);

test(
  "offline Cache, reconnect live",
  { tag: ["@feature", "@feature:stream-cache"] },
  async ({ page }) => {
    const online = { current: true };
    await seedServer(page);
    await mockApi(page, online);
    await page.goto(`/sessions/${SESSION_ID}?server=${server.id}`);

    const items = page.getByTestId("message-item");
    await expect(items.first()).toContainText("Nachricht 36");
    await expect(items.last()).toContainText("Nachricht 60");
    await waitForCache(page, MESSAGE_COUNT);

    online.current = false;
    await page.reload();
    await expect(page.getByTestId("cache-status")).toContainText("offline aus Zwischenspeicher");
    await expect(page.getByText("Offline: zwischengespeicherte Nachrichten")).toBeVisible();
    await expect(items.first()).toContainText("Nachricht 36");
    await expect(items.last()).toContainText("Nachricht 60");

    online.current = true;
    await page.reload();
    await expect(page.getByTestId("cache-status")).toContainText("live");
    await expect(items.first()).toContainText("Nachricht 36");
    await expect(items.last()).toContainText("Nachricht 60");
  },
);
