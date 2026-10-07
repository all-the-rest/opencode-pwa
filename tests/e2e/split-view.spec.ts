import { expect, test, type Page, type Route } from "@playwright/test";

const serverA = {
  id: "srv-a",
  name: "Server A",
  baseUrl: "http://e2e-a.local",
  username: "",
  color: "#ef4444",
};

const sessionsByHost: Record<string, Array<{ id: string; title: string }>> = {
  "e2e-a.local": [
    { id: "ses-a1", title: "Alpha bauen" },
    { id: "ses-a2", title: "Alpha prüfen" },
  ],
};

async function seedServers(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify(value));
  }, [serverA]);
}

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }
    if (url.includes("/message")) {
      const match = url.match(/\/api\/session\/([^/]+)\/message/);
      const sessionID = match?.[1] ?? "ses";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ id: "msg-1", role: "assistant", text: `Hallo aus ${sessionID}` }],
          cursor: {},
        }),
      });
      return;
    }
    if (url.includes("/api/session") && method === "GET" && !url.includes("/api/session/")) {
      const host = new URL(url).hostname;
      const rows = sessionsByHost[host] ?? [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: rows, cursor: { next: null, previous: null } }),
      });
      return;
    }
    if (url.includes("/api/shell") && method === "GET" && !url.includes("/output")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ location: {}, data: [] }),
      });
      return;
    }
    if (url.includes("/api/pty") && !url.includes("/connect-token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ location: {}, data: [] }),
      });
      return;
    }
    if (url.includes("/api/project")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

/** Resolved grid column count (0 when the element is not a grid). */
async function gridColumns(page: Page, testId: string): Promise<number> {
  const value = await page
    .getByTestId(testId)
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  return value === "none" ? 0 : value.split(" ").length;
}

test(
  "split-view toggle persists and reflows server panels (mocked)",
  { tag: ["@feature", "@feature:split-view"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await seedServers(page);
    await mockApi(page);
    await page.goto(`/servers/${serverA.id}`);
    await expect(page.getByTestId("sessions-card")).toBeVisible();

    const toggle = page.getByTestId("layout-mode-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    // Single mode: 4-column card grid on xl screens.
    expect(await gridColumns(page, "server-panels")).toBe(4);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const stored = await page.evaluate(() => localStorage.getItem("opencode-pwa:layout-mode"));
    expect(stored).toBe("split");
    // Split mode: sessions span two columns, meta cards stack in the third.
    expect(await gridColumns(page, "server-panels")).toBe(3);

    // The mode survives a reload (localStorage persistence).
    await page.reload();
    await expect(page.getByTestId("sessions-card")).toBeVisible();
    await expect(page.getByTestId("layout-mode-toggle")).toHaveAttribute("aria-pressed", "true");
    expect(await gridColumns(page, "server-panels")).toBe(3);

    // Toggling back restores the stacked single-column density.
    await page.getByTestId("layout-mode-toggle").click();
    const storedBack = await page.evaluate(() =>
      localStorage.getItem("opencode-pwa:layout-mode"),
    );
    expect(storedBack).toBe("single");
    expect(await gridColumns(page, "server-panels")).toBe(4);
  },
);

test(
  "session heading shows title and panels tile in split mode (mocked)",
  { tag: ["@feature", "@feature:split-view"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await seedServers(page);
    await mockApi(page);
    await page.goto(`/sessions/ses-a1?server=${serverA.id}`);

    // The heading resolves the real session title (not the raw id).
    await expect(page.getByRole("heading", { name: "Alpha bauen" })).toBeVisible();
    // Single mode: secondary panels stack (flex, no grid).
    expect(await gridColumns(page, "session-panels")).toBe(0);

    await page.getByTestId("layout-mode-toggle").click();
    expect(await gridColumns(page, "session-panels")).toBe(3);
    // The conversation keeps full width above the tiled panels.
    await expect(page.getByTestId("message-list")).toBeVisible();

    // Mobile stays single-column even with split mode active.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await gridColumns(page, "session-panels")).toBe(1);
    await expect(page.getByTestId("message-list")).toBeVisible();
  },
);

test(
  "close-all tabs and mobile drawer auto-close (mocked)",
  { tag: ["@feature", "@feature:split-view"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await seedServers(page);
    await mockApi(page);

    // Open two sessions so the close-all button appears.
    await page.goto(`/servers/${serverA.id}`);
    await page.getByRole("link", { name: "Alpha bauen" }).click();
    await expect(page).toHaveURL(`/sessions/ses-a1?server=${serverA.id}`);
    await page.goto(`/servers/${serverA.id}`);
    await page.getByRole("link", { name: "Alpha prüfen" }).click();
    await expect(page).toHaveURL(`/sessions/ses-a2?server=${serverA.id}`);

    const closeAll = page.getByTestId("session-tabs-close-all");
    await expect(closeAll).toBeVisible();
    await closeAll.click();
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("session-tab-bar")).toHaveCount(0);

    // Mobile regression: the drawer closes itself after navigation.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const menuButton = page.locator("header label[for='app-drawer']");
    const drawerToggle = page.locator("#app-drawer");
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(drawerToggle).toBeChecked();
    await page.locator("aside nav").getByRole("link", { name: "Einstellungen" }).click();
    await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
    await expect(drawerToggle).not.toBeChecked();
  },
);
