import { expect, test, type Page } from "@playwright/test";

/**
 * Settings: connection test before save + deep-URL paste normalization.
 * No live server — `/api/info` is mocked per test.
 */

async function gotoSettings(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
}

function baseUrlField(page: Page) {
  return page.getByLabel("Basis-URL");
}

/** Dispatch a real `paste` event with `text` on the base-URL field. */
async function pasteIntoBaseUrl(page: Page, text: string) {
  await baseUrlField(page).evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

async function fillForm(page: Page, baseUrl: string) {
  await page.getByLabel("Servername").fill("Testserver");
  await baseUrlField(page).fill(baseUrl);
  await page.getByLabel("Benutzer").fill("e2e");
  await page.getByLabel("Passwort").fill("secret");
}

async function storedServerCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("opencode-pwa:servers");
    if (raw === null || raw === "") return 0;
    return (JSON.parse(raw) as unknown[]).length;
  });
}

test(
  "pasting a deep URL normalizes once to the origin, typing stays untouched",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    await gotoSettings(page);
    // Focus first, like a real user pasting with the keyboard.
    await baseUrlField(page).focus();
    await pasteIntoBaseUrl(page, "https://host.example/sessions/abc-123?x=1");
    await expect(baseUrlField(page)).toHaveValue("https://host.example");

    // Manual typing is never normalized: appending a path keeps it.
    await baseUrlField(page).pressSequentially("/sessions/abc");
    await expect(baseUrlField(page)).toHaveValue("https://host.example/sessions/abc");
  },
);

test(
  "successful connection test shows the version and the tested URL without saving",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    await page.route("**/api/info", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "9.9.9", pid: 1, urls: [], paths: {} }),
      });
    });
    await gotoSettings(page);
    await fillForm(page, "http://conn-test.local");

    await page.getByRole("button", { name: "Verbindung testen" }).click();
    const result = page.getByTestId("connection-test-result");
    await expect(result).toContainText("Verbindung erfolgreich");
    await expect(result).toContainText("9.9.9");
    await expect(page.getByTestId("connection-test-url")).toHaveText(
      "http://conn-test.local/api/info",
    );
    // The test never persists: no server was saved.
    expect(await storedServerCount(page)).toBe(0);
    await expect(page.getByText("Noch keine Server vorhanden.")).toBeVisible();
  },
);

test(
  "401 shows the shared credentials message and still saves nothing",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    await page.route("**/api/info", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "text/plain; charset=utf-8",
        body: "401 Unauthorized",
      });
    });
    await gotoSettings(page);
    await fillForm(page, "http://conn-test.local");

    await page.getByRole("button", { name: "Verbindung testen" }).click();
    const result = page.getByTestId("connection-test-result");
    await expect(result).toContainText("Anmeldung fehlgeschlagen");
    await expect(page.getByTestId("connection-test-url")).toHaveText(
      "http://conn-test.local/api/info",
    );
    expect(await storedServerCount(page)).toBe(0);
  },
);

test(
  "unreachable server shows the reachability hint with --cors",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    await page.route("**/api/info", async (route) => {
      await route.abort("failed");
    });
    await gotoSettings(page);
    await fillForm(page, "http://conn-test.local");

    await page.getByRole("button", { name: "Verbindung testen" }).click();
    const result = page.getByTestId("connection-test-result");
    await expect(result).toContainText("nicht erreichbar");
    await expect(result).toContainText("--cors");
    expect(await storedServerCount(page)).toBe(0);
  },
);

test(
  "login page instead of JSON shows the gate hint",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    await page.route("**/api/info", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<html><body>login</body></html>",
      });
    });
    await gotoSettings(page);
    await fillForm(page, "http://conn-test.local");

    await page.getByRole("button", { name: "Verbindung testen" }).click();
    const result = page.getByTestId("connection-test-result");
    await expect(result).toContainText("einloggen");
    expect(await storedServerCount(page)).toBe(0);
  },
);
