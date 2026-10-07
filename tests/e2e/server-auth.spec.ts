import { expect, test, type Page } from "@playwright/test";

const server = {
  id: "srv-auth",
  name: "Auth Server",
  baseUrl: "http://e2e-auth.local",
  username: "e2e",
  color: "#ef4444",
};

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify(value));
  }, [server]);
}

/**
 * Caddy Basic-gate with wrong credentials: every API call answers 401 with
 * a text/plain body. The generated client surfaces this as
 * `UnsupportedContentType: text/plain; charset=utf-8`.
 */
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
  "wrong credentials show a friendly message instead of the raw error",
  { tag: ["@feature", "@feature:server-auth"] },
  async ({ page }) => {
    await seedServer(page);
    await mockDeniedApi(page);
    await page.goto(`/servers/${server.id}`);

    const banner = page.getByTestId("offline-alert");
    await expect(
      banner.getByText(
        "Anmeldung fehlgeschlagen. Bitte Benutzername und Server-Passwort in den Einstellungen prüfen.",
      ),
    ).toBeVisible();
    // The technical detail stays available but collapsed — never visible raw.
    await expect(banner.getByText(/UnsupportedContentType/)).toBeHidden();
    await expect(banner.getByText("Technische Details")).toBeVisible();
  },
);
