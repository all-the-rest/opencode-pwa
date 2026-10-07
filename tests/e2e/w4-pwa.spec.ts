import { expect, test, type Page } from "@playwright/test";

const mockServer = {
  id: "w4-server",
  name: "W4-Server",
  baseUrl: "http://w4.local",
  username: "",
  password: "",
};

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, mockServer);
}

async function mockApiError(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }
    await route.abort("failed");
  });
}

async function ensureDrawerOpen(page: Page) {
  const menuLabel = page.locator("header label[for='app-drawer']");
  const toggle = page.locator("#app-drawer");
  if ((await menuLabel.isVisible()) && !(await toggle.isChecked())) {
    await menuLabel.click();
  }
}

test(
  "add-server persists after reload (settings form + localStorage)",
  { tag: ["@feature", "@feature:w4-persistence"] },
  async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();

    await page.getByLabel("Servername").fill("Heimserver");
    await page.getByLabel("Basis-URL").fill("http://heim.local:4096");
    await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();

    const entry = page.getByRole("main").getByRole("listitem").filter({ hasText: "Heimserver" });
    await expect(entry).toBeVisible();
    await expect(entry.getByText("http://heim.local:4096")).toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem("opencode-pwa:servers"));
    expect(stored).toContain("Heimserver");

    await page.reload();
    const reloaded = page.getByRole("main").getByRole("listitem").filter({ hasText: "Heimserver" });
    await expect(reloaded).toBeVisible();
    await expect(reloaded.getByText("http://heim.local:4096")).toBeVisible();
  },
);

test(
  "server-detail shows offline banner when API is unreachable (mocked)",
  { tag: ["@feature", "@feature:w4-offline"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApiError(page);
    await page.goto(`/servers/${mockServer.id}`);

    await expect(page.getByText("Server offline oder nicht erreichbar")).toBeVisible();
  },
);

test(
  "drawer nav works on mobile viewport (Pixel 7 project)",
  { tag: ["@regression", "@regression:drawer"] },
  async ({ page }) => {
    await page.goto("/");

    await ensureDrawerOpen(page);
    await page.locator("aside nav").getByRole("link", { name: "Einstellungen" }).click();
    await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();

    await ensureDrawerOpen(page);
    await page.locator("aside nav").getByRole("link", { name: "Übersicht" }).click();
    await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  },
);

test(
  "settings shows the CORS requirement with the current origin (mocked)",
  { tag: ["@feature", "@feature:w4-persistence"] },
  async ({ page }) => {
    await page.goto("/settings");

    // The hint is part of the add-server form and names the exact command.
    const hint = page.getByTestId("cors-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("CORS wird benötigt");
    await expect(hint).toContainText("Failed to fetch");
    await expect(hint).toContainText("opencode serve --cors");
    // The origin is the current PWA origin, shown dynamically.
    const origin = new URL(page.url()).origin;
    await expect(hint).toContainText(`opencode serve --cors ${origin}`);
  },
);
