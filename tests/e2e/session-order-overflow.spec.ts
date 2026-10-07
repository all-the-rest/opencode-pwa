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

test(
  "projects card is first in DOM order in single and split mode (mocked)",
  { tag: ["@feature", "@feature:project-order"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await seedServers(page);
    await mockApi(page);
    await page.goto(`/servers/${serverA.id}`);
    await expect(page.getByTestId("projects-card")).toBeVisible();

    const firstTestId = () =>
      page.getByTestId("server-panels").evaluate((el) => {
        const first = el.querySelector(":scope > section");
        return first?.getAttribute("data-testid") ?? "";
      });

    // Projects-first: the projects card leads in real DOM order (no CSS-order trick).
    await expect.poll(firstTestId).toBe("projects-card");

    // Split mode keeps the same DOM order (projects still on top).
    await page.getByTestId("layout-mode-toggle").click();
    await expect(page.getByTestId("layout-mode-toggle")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(firstTestId).toBe("projects-card");
    await expect(page.getByTestId("projects-card")).toBeVisible();
  },
);

test(
  "tab overflow popup lists all tabs with color dots and navigates (mocked)",
  { tag: ["@feature", "@feature:tabs-overflow"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem(
        "opencode-pwa:servers",
        JSON.stringify([
          { id: "srv-a", name: "Server A", baseUrl: "http://e2e-a.local", username: "", color: "#ef4444" },
        ]),
      );
      localStorage.setItem(
        "opencode-pwa:session-tabs",
        JSON.stringify([
          { serverID: "srv-a", sessionID: "ses-a1", title: "Alpha bauen mit langem Sitzungstitel eins" },
          { serverID: "srv-a", sessionID: "ses-a2", title: "Beta prüfen mit langem Sitzungstitel zwei" },
          { serverID: "srv-a", sessionID: "ses-a3", title: "Gamma testen mit langem Sitzungstitel drei" },
          { serverID: "srv-a", sessionID: "ses-a4", title: "Delta deployen mit langem Sitzungstitel vier" },
          { serverID: "srv-a", sessionID: "ses-a5", title: "Epsilon reviewen mit langem Sitzungstitel fünf" },
          { serverID: "srv-a", sessionID: "ses-a6", title: "Zeta dokumentieren mit langem Sitzungstitel sechs" },
        ]),
      );
    });
    await mockApi(page);
    await page.goto(`/sessions/ses-a1?server=srv-a`);

    // Overflow exists on the narrow viewport: the popup button appears…
    const overflowButton = page.getByTestId("session-tabs-overflow-button");
    await expect(overflowButton).toBeVisible();
    await expect(overflowButton).toContainText("Alle Tabs");
    // …while horizontal scroll still works as before.
    const tabBarNav = page.getByRole("navigation", { name: "Offene Sessions" });
    const scrolls = await tabBarNav.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls).toBe(true);

    // The popup lists every tab with server color dot + title.
    await overflowButton.click();
    const menu = page.getByTestId("session-tabs-overflow-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(6);
    await expect(page.getByTestId("session-tabs-overflow-dot-ses-a1")).toHaveCSS(
      "background-color",
      "rgb(239, 68, 68)",
    );
    await expect(page.getByTestId("session-tabs-overflow-item-ses-a6")).toContainText(
      "Zeta dokumentieren",
    );

    // Clicking an entry navigates to that session.
    await page.getByTestId("session-tabs-overflow-item-ses-a6").click();
    await expect(page).toHaveURL(`/sessions/ses-a6?server=srv-a`);
    await expect(page.getByTestId("session-tabs-overflow-menu")).toHaveCount(0);

    // Reopened popup closes on Escape.
    await overflowButton.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("session-tabs-overflow-menu")).toHaveCount(0);
  },
);

test(
  "no overflow popup without overflow (mocked)",
  { tag: ["@feature", "@feature:tabs-overflow"] },
  async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem(
        "opencode-pwa:servers",
        JSON.stringify([
          { id: "srv-a", name: "Server A", baseUrl: "http://e2e-a.local", username: "", color: "#ef4444" },
        ]),
      );
      localStorage.setItem(
        "opencode-pwa:session-tabs",
        JSON.stringify([{ serverID: "srv-a", sessionID: "ses-a1", title: "Alpha bauen" }]),
      );
    });
    await mockApi(page);
    await page.goto(`/sessions/ses-a1?server=srv-a`);
    await expect(page.getByTestId("session-tab-bar")).toBeVisible();
    await expect(page.getByTestId("session-tabs-overflow-button")).toHaveCount(0);
  },
);
