import { expect, test, type Page } from "@playwright/test";

async function ensureDrawerOpen(page: Page) {
  const menuLabel = page.locator("header label[for='app-drawer']");
  const toggle = page.locator("#app-drawer");
  if ((await menuLabel.isVisible()) && !(await toggle.isChecked())) {
    await menuLabel.click();
  }
}

async function gotoViaNav(page: Page, name: "Übersicht" | "Einstellungen") {
  await ensureDrawerOpen(page);
  await page.locator("aside nav").getByRole("link", { name }).click();
}

test("app loads and nav works (mock, no live server)", { tag: ["@smoke"] }, async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Web PWA for Opencode" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();

  await gotoViaNav(page, "Einstellungen");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  await expect(page.getByLabel("Servername")).toBeVisible();

  await gotoViaNav(page, "Übersicht");
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
});
