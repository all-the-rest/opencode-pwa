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
  "pasting a base64-embedded server link resolves to the decoded origin",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    await gotoSettings(page);
    await baseUrlField(page).focus();
    await pasteIntoBaseUrl(
      page,
      "https://app.example/server/aHR0cHM6Ly9yZW1vdGUtY29kZS5hbGwtdGhlLnJlc3Q/session/abc-123",
    );
    await expect(baseUrlField(page)).toHaveValue("https://remote-code.all-the.rest");
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
  "a redirect to the gate login page shows the gate hint",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    // The real cookie gate answers `302 → /login.html`; the browser follows it,
    // so the HTML login page arrives with `redirected === true`. Same-origin,
    // redirected to the dev server's own HTML document to model that exactly.
    await gotoSettings(page);
    const origin = new URL(page.url()).origin;
    await page.route("**/api/info", async (route) => {
      await route.fulfill({
        status: 302,
        headers: { location: "/index.html" },
      });
    });
    await fillForm(page, origin);

    await page.getByRole("button", { name: "Verbindung testen" }).click();
    const result = page.getByTestId("connection-test-result");
    await expect(result).toContainText("einloggen");
    expect(await storedServerCount(page)).toBe(0);
  },
);

test(
  "HTML served directly at /api/info shows the no-API hint, not the gate hint",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    // A foreign origin (no opencode API) answers /api/info with its own page
    // and no redirect — this must not masquerade as a cookie-gate login page.
    await page.route("**/api/info", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<html><body>willkommen</body></html>",
      });
    });
    await gotoSettings(page);
    await fillForm(page, "http://foreign.local");

    await page.getByRole("button", { name: "Verbindung testen" }).click();
    const result = page.getByTestId("connection-test-result");
    await expect(result).toContainText("keine Opencode-API");
    await expect(result).not.toContainText("einloggen");
    expect(await storedServerCount(page)).toBe(0);
  },
);

test(
  "a hanging connection test aborts after the timeout with a German message",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    test.setTimeout(15_000);
    // Same-origin so the fetch cannot be blocked by CORS before it hangs; a
    // server that never answers must be given up on by the client itself.
    await gotoSettings(page);
    const origin = new URL(page.url()).origin;
    await page.route("**/api/info", async () => {
      await new Promise<void>(() => {});
    });
    await fillForm(page, origin);

    await page.getByRole("button", { name: "Verbindung testen" }).click();
    // Visible waiting state while the test runs: spinner, busy flag, disabled.
    const testingButton = page.getByRole("button", { name: "Teste …" });
    await expect(testingButton).toBeDisabled();
    await expect(testingButton).toHaveAttribute("aria-busy", "true");
    await expect(testingButton.locator(".loading-spinner")).toBeVisible();
    const result = page.getByTestId("connection-test-result");
    await expect(result).toContainText("Zeitüberschreitung", { timeout: 10_000 });
    await expect(result).toContainText("erreichbar");
    // The waiting state clears once the timeout resolves.
    await expect(page.getByRole("button", { name: "Verbindung testen" })).toBeEnabled();
    expect(await storedServerCount(page)).toBe(0);
  },
);

test(
  "pasting a URL with a reverse-proxy subpath keeps the subpath, drops only the deep tail",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    await gotoSettings(page);
    await baseUrlField(page).focus();
    await pasteIntoBaseUrl(page, "https://proxy.local/opencode/sessions/abc?x=1");
    await expect(baseUrlField(page)).toHaveValue("https://proxy.local/opencode");
  },
);

test(
  "saving a typed subpath URL stores origin + subpath and the test requests it",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    const requested: string[] = [];
    await page.route("**/api/info", async (route) => {
      requested.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "1.0.0", pid: 1, urls: [], paths: {} }),
      });
    });
    await gotoSettings(page);
    await fillForm(page, "http://subpath.local/opencode/sessions/abc?tab=1");

    await page.getByRole("button", { name: "Verbindung testen" }).click();
    const result = page.getByTestId("connection-test-result");
    await expect(result).toContainText("Verbindung erfolgreich");
    await expect(page.getByTestId("connection-test-url")).toHaveText(
      "http://subpath.local/opencode/api/info",
    );
    expect(requested).toEqual(["http://subpath.local/opencode/api/info"]);

    await page.getByRole("button", { name: "Hinzufügen" }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("opencode-pwa:servers");
          if (raw === null || raw === "") return null;
          return (JSON.parse(raw) as Array<{ baseUrl: string }>)[0]?.baseUrl ?? null;
        }),
      )
      .toBe("http://subpath.local/opencode");
  },
);

test(
  "typing a deep URL and saving stores the origin (no paste needed)",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    await gotoSettings(page);
    // fill() sets the value via onChange, NOT via paste — a typed/autofilled
    // deep URL must still end in a working entry.
    await fillForm(page, "http://typed-deep.local/api/info?x=1");
    await page.getByRole("button", { name: "Hinzufügen" }).click();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("opencode-pwa:servers");
          if (raw === null || raw === "") return null;
          return (JSON.parse(raw) as Array<{ baseUrl: string }>)[0]?.baseUrl ?? null;
        }),
      )
      .toBe("http://typed-deep.local");
    await expect(page.getByText("http://typed-deep.local", { exact: true })).toBeVisible();
  },
);

test(
  "connection test normalizes a typed deep URL before requesting",
  { tag: ["@feature", "@feature:settings-connection"] },
  async ({ page }) => {
    const requested: string[] = [];
    await page.route("**/api/info", async (route) => {
      requested.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "1.0.0", pid: 1, urls: [], paths: {} }),
      });
    });
    await gotoSettings(page);
    await fillForm(page, "http://typed-deep.local/sessions/abc?tab=1");

    await page.getByRole("button", { name: "Verbindung testen" }).click();
    const result = page.getByTestId("connection-test-result");
    await expect(result).toContainText("Verbindung erfolgreich");
    await expect(page.getByTestId("connection-test-url")).toHaveText(
      "http://typed-deep.local/api/info",
    );
    expect(requested).toEqual(["http://typed-deep.local/api/info"]);
  },
);
