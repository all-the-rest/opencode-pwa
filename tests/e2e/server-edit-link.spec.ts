import { expect, test, type Page, type Route } from "@playwright/test";

const server = {
  id: "srv-edit",
  name: "Edit Server",
  baseUrl: "http://e2e-edit.local",
  username: "e2e",
  color: "#3b82f6",
};

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify(value));
  }, [server]);
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
    if (url.includes("/api/session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], cursor: { next: null, previous: null } }),
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

async function mockDeniedApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "text/plain; charset=utf-8",
      body: "401 Unauthorized",
    });
  });
}

test(
  "edit action deep-links to the settings edit form",
  { tag: ["@feature", "@feature:server-edit"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page);
    await page.goto(`/servers/${server.id}`);

    const editButton = page.getByTestId("server-edit-button");
    await expect(editButton).toBeVisible();
    await expect(editButton).toHaveText("Server bearbeiten");
    await editButton.click();

    await expect(page).toHaveURL(`/settings?edit=${server.id}`);
    await expect(page.getByRole("heading", { name: "Server bearbeiten" })).toBeVisible();
    await expect(page.getByLabel("Servername")).toHaveValue(server.name);
    await expect(page.getByLabel("Basis-URL")).toHaveValue(server.baseUrl);
  },
);

test(
  "settings edit query preselects the server without clicking",
  { tag: ["@feature", "@feature:server-edit"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page);
    await page.goto(`/settings?edit=${server.id}`);

    await expect(page.getByRole("heading", { name: "Server bearbeiten" })).toBeVisible();
    await expect(page.getByLabel("Servername")).toHaveValue(server.name);
  },
);

test(
  "auth-failure banner links to the server edit form",
  { tag: ["@feature", "@feature:server-edit"] },
  async ({ page }) => {
    await seedServer(page);
    await mockDeniedApi(page);
    await page.goto(`/servers/${server.id}`);

    const banner = page.getByTestId("offline-alert");
    await expect(banner.getByText(/Anmeldung fehlgeschlagen/)).toBeVisible();
    const editLink = banner.getByTestId("offline-alert-edit-link");
    await expect(editLink).toBeVisible();
    await expect(editLink).toHaveText("Server bearbeiten");
    await editLink.click();

    await expect(page).toHaveURL(`/settings?edit=${server.id}`);
    await expect(page.getByRole("heading", { name: "Server bearbeiten" })).toBeVisible();
    await expect(page.getByLabel("Servername")).toHaveValue(server.name);
  },
);
