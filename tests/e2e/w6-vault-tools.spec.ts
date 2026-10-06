import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W6:
 *  - credential vault: a plaintext password from an older app version is
 *    migrated into IndexedDB and wiped from `localStorage`, while the requests
 *    keep working (Basic auth is sent from the decrypted vault copy).
 *  - server tools: file browser (read-only), VCS status, worktrees, MCP
 *    servers and the pending-permission list with allow/deny.
 */

const legacyServer = {
  id: "vault-server",
  name: "Tresor-Server",
  baseUrl: "http://vault.local",
  username: "heim",
  password: "legacy-geheim",
};

interface ToolsCallLog {
  authHeaders: Array<string | undefined>;
  permissionReplies: Array<{ sessionID: string; requestID: string; decision: string }>;
  repliesAnswered: Set<string>;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Seed a `localStorage` entry the way the pre-vault app version wrote it. */
async function seedLegacyServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, legacyServer);
}

async function readStoredServers(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("opencode-pwa:servers");
    return raw === null ? [] : (JSON.parse(raw) as Array<Record<string, unknown>>);
  });
}

/**
 * Sealed rows of the vault's object store, read straight from the page's
 * IndexedDB. Only call this after the app booted: opening a database that does
 * not exist yet would create it at version 1 without the `entries` store.
 */
async function readVaultRows(
  page: Page,
): Promise<{ ids: string[]; ciphertextLooksEncrypted: boolean }> {
  return page.evaluate(
    () =>
      new Promise<{ ids: string[]; ciphertextLooksEncrypted: boolean }>((resolve, reject) => {
        const request = indexedDB.open("opencode-pwa-credential-vault");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("entries")) {
            resolve({ ids: [], ciphertextLooksEncrypted: false });
            return;
          }
          const tx = db.transaction("entries", "readonly");
          const rows = tx.objectStore("entries").getAll();
          rows.onsuccess = () => {
            const list = rows.result as Array<Record<string, unknown>>;
            const secrets = list.filter((row) => String(row["id"]).startsWith("secret:"));
            const ciphertext = new Uint8Array(secrets[0]?.["ciphertext"] as ArrayBuffer);
            const printable = [...ciphertext].every(
              (byte) => byte > 31 && byte < 127,
            );
            resolve({
              ids: list.map((row) => String(row["id"])),
              // The stored bytes must not be the ASCII of the password.
              ciphertextLooksEncrypted: secrets.length > 0 && !printable,
            });
          };
          rows.onerror = () => reject(rows.error);
        };
      }),
  );
}

async function mockToolsResponse(route: Route, log: ToolsCallLog) {
  const request = route.request();
  const url = request.url();
  const method = request.method();

  if (/\/api\/session\/[^/]+\/permission\/[^/]+\/reply$/.test(url) && method === "POST") {
    const match = url.match(/\/api\/session\/([^/]+)\/permission\/([^/]+)\/reply/);
    const body = request.postDataJSON() as { decision?: unknown } | null;
    const requestID = match?.[2] ?? "";
    const decision = typeof body?.decision === "string" ? body.decision : "";
    log.permissionReplies.push({ sessionID: match?.[1] ?? "", requestID, decision });
    log.repliesAnswered.add(requestID);
    await route.fulfill({ status: 204, body: "" });
    return;
  }

  if (url.includes("/api/permission/request")) {
    const pending = [
      {
        id: "per-1",
        sessionID: "ses-1",
        action: "bash",
        resources: ["rm -rf /tmp/build"],
        message: "Shell-Befehl ausführen?",
      },
      {
        id: "per-2",
        sessionID: "ses-2",
        action: "edit",
        resources: ["src/app.ts"],
      },
    ].filter((row) => !log.repliesAnswered.has(row.id));
    await json(route, { location: {}, data: pending });
    return;
  }

  if (url.includes("/api/vcs/status")) {
    await json(route, {
      location: {},
      data: [
        { file: "src/app.ts", additions: 12, deletions: 3, status: "modified" },
        { file: "src/neu.ts", additions: 40, deletions: 0, status: "added" },
        { file: "src/weg.ts", additions: 0, deletions: 21, status: "deleted" },
      ],
    });
    return;
  }

  if (url.includes("/api/fs/read/")) {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: 'export const hallo = "welt";\n',
    });
    return;
  }

  if (url.includes("/api/fs/list")) {
    const requested = new URL(url).searchParams.get("path") ?? "";
    if (requested === "") {
      await json(route, {
        location: {},
        data: [
          { path: "README.md", type: "file" },
          { path: "src", type: "directory" },
        ],
      });
      return;
    }
    if (requested === "src") {
      await json(route, {
        location: {},
        data: [
          { path: "src/app.ts", type: "file" },
          { path: "src/neu.ts", type: "file" },
        ],
      });
      return;
    }
    await json(route, { location: {}, data: [] });
    return;
  }

  if (url.includes("/api/worktree")) {
    await json(route, {
      location: {},
      data: [
        { directory: "/repo", strategy: "main" },
        { directory: "/repo-feature", strategy: "worktree" },
      ],
    });
    return;
  }

  if (url.includes("/api/mcp")) {
    await json(route, {
      location: {},
      data: [
        { name: "filesystem", status: { status: "connected" } },
        { name: "github", status: { status: "failed", error: "401 unauthorized" } },
      ],
    });
    return;
  }

  if (url.includes("/api/project")) {
    await json(route, {
      location: {},
      data: [{ id: "p1", canonical: "/repo", name: "Repo" }],
    });
    return;
  }

  if (url.includes("/api/session")) {
    await json(route, { data: [], cursor: { next: null, previous: null } });
    return;
  }

  await json(route, {});
}

async function mockApi(page: Page, log: ToolsCallLog) {
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
    log.authHeaders.push(route.request().headers()["authorization"]);
    await mockToolsResponse(route, log);
  });
}

function freshLog(): ToolsCallLog {
  return { authHeaders: [], permissionReplies: [], repliesAnswered: new Set<string>() };
}

// ---------------------------------------------------------------------------
// Credential vault
// ---------------------------------------------------------------------------

test(
  "plaintext password is migrated into the vault and wiped from localStorage",
  { tag: ["@feature", "@feature:vault-migration"] },
  async ({ page }) => {
    const log = freshLog();
    await seedLegacyServer(page);
    await mockApi(page, log);
    await page.goto("/");

    // The app still works and authenticates with the migrated password.
    await expect(page.getByText("Alle Server (1)")).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => log.authHeaders.filter((value) => value !== undefined).length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    const expected = `Basic ${btoa(`${legacyServer.username}:${legacyServer.password}`)}`;
    expect(log.authHeaders).toContain(expected);

    // localStorage keeps identity + endpoint, but no password any more.
    await expect
      .poll(async () => JSON.stringify(await readStoredServers(page)), { timeout: 20_000 })
      .not.toContain(legacyServer.password);
    const stored = await readStoredServers(page);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: legacyServer.id,
      name: legacyServer.name,
      baseUrl: legacyServer.baseUrl,
      username: legacyServer.username,
    });
    expect(stored[0]).not.toHaveProperty("password");

    // …and the vault holds a sealed row plus the non-extractable DEK.
    const vault = await readVaultRows(page);
    expect(vault.ids).toContain("dek");
    expect(vault.ids).toContain(`secret:${legacyServer.id}`);
    expect(vault.ciphertextLooksEncrypted).toBe(true);
  },
);

test(
  "migrated password survives a reload, still only inside the vault",
  { tag: ["@feature", "@feature:vault-migration"] },
  async ({ page }) => {
    const log = freshLog();
    await seedLegacyServer(page);
    await mockApi(page, log);
    await page.goto("/settings");

    // The edit form never reads the secret back: the field stays blank, and
    // saving it blank keeps the stored credential.
    await page.getByRole("button", { name: "Bearbeiten" }).click();
    await expect(page.getByLabel("Passwort")).toHaveValue("");
    await expect(
      page.getByText("Leer lassen, um das gespeicherte Passwort zu behalten"),
    ).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Bearbeiten" }).click();
    await expect(page.getByLabel("Passwort")).toHaveValue("");

    const stored = await readStoredServers(page);
    expect(stored[0]).not.toHaveProperty("password");
    expect(JSON.stringify(stored)).not.toContain(legacyServer.password);

    // …and requests still authenticate with the stored credential.
    await page.goto("/");
    await expect(page.getByText("Alle Server (1)")).toBeVisible({ timeout: 20_000 });
    const expected = `Basic ${btoa(`${legacyServer.username}:${legacyServer.password}`)}`;
    await expect
      .poll(() => log.authHeaders.filter((value) => value !== undefined), { timeout: 20_000 })
      .toContain(expected);
  },
);

test(
  "Settings warns when no persistent vault is available",
  { tag: ["@feature", "@feature:vault-fallback"] },
  async ({ page }) => {
    // Hide IndexedDB before the app boots: the vault has to fall back to the
    // session and say so in German.
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, "indexedDB", {
        value: undefined,
        configurable: true,
      });
    });
    await seedLegacyServer(page);
    await mockApi(page, freshLog());
    await page.goto("/settings");

    await expect(page.getByTestId("vault-fallback-notice")).toBeVisible();
    await expect(
      page.getByTestId("vault-fallback-notice").getByText("nur für diese Sitzung"),
    ).toBeVisible();
  },
);

// ---------------------------------------------------------------------------
// Server tools (parity)
// ---------------------------------------------------------------------------

test(
  "server tools show files, VCS status, worktrees, MCP servers and permissions",
  { tag: ["@feature", "@feature:server-tools"] },
  async ({ page }) => {
    const log = freshLog();
    await seedLegacyServer(page);
    await mockApi(page, log);

    await page.goto(`/servers/${legacyServer.id}`);
    await page.getByRole("link", { name: "Server-Werkzeuge" }).first().click();
    await expect(
      page.getByRole("heading", { name: `Server-Werkzeuge: ${legacyServer.name}` }),
    ).toBeVisible();

    // File browser: root listing, directory navigation, file preview.
    await expect(page.getByTestId("file-entry-src")).toContainText("Ordner");
    await page.getByTestId("file-entry-src").getByRole("button").click();
    await expect(page.getByTestId("file-entry-src/app.ts")).toBeVisible();
    await page.getByTestId("file-entry-src/app.ts").getByRole("button").click();
    await expect(page.getByTestId("file-preview")).toContainText('export const hallo = "welt";');

    // Git status.
    await expect(page.getByTestId("vcs-row-src/app.ts")).toContainText("geändert");
    await expect(page.getByTestId("vcs-row-src/neu.ts")).toContainText("neu");
    await expect(page.getByTestId("vcs-row-src/weg.ts")).toContainText("gelöscht");
    await expect(page.getByTestId("vcs-row-src/app.ts")).toContainText("+12 −3");

    // Worktrees (first project is preselected).
    await expect(page.getByTestId("worktree-row-/repo")).toBeVisible();
    await expect(page.getByTestId("worktree-row-/repo-feature")).toContainText("worktree");

    // MCP servers.
    await expect(page.getByTestId("mcp-row-filesystem")).toContainText("verbunden");
    await expect(page.getByTestId("mcp-row-github")).toContainText("401 unauthorized");

    // Pending permissions.
    await expect(page.getByTestId("permission-row-per-1")).toContainText(
      "Shell-Befehl ausführen?",
    );
    await expect(page.getByTestId("permission-row-per-2")).toContainText("edit");
  },
);

test(
  "a permission request can be answered with allow or deny",
  { tag: ["@feature", "@feature:server-tools"] },
  async ({ page }) => {
    const log = freshLog();
    await seedLegacyServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${legacyServer.id}/tools`);

    await expect(page.getByTestId("permission-row-per-1")).toBeVisible();
    await page.getByRole("button", { name: "Anfrage per-1 einmalig erlauben" }).click();
    await expect
      .poll(() => log.permissionReplies, { timeout: 10_000 })
      .toContainEqual({ sessionID: "ses-1", requestID: "per-1", decision: "once" });

    await expect(page.getByTestId("permission-row-per-2")).toBeVisible();
    await page.getByRole("button", { name: "Anfrage per-2 ablehnen" }).click();
    await expect
      .poll(() => log.permissionReplies, { timeout: 10_000 })
      .toContainEqual({ sessionID: "ses-2", requestID: "per-2", decision: "reject" });
  },
);

test(
  "an offline server keeps the tools page usable and disables the actions",
  { tag: ["@feature", "@feature:server-tools"] },
  async ({ page }) => {
    const log = freshLog();
    const state = { online: true };
    await seedLegacyServer(page);
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
      log.authHeaders.push(url);
      if (!state.online) {
        await route.abort("connectionrefused");
        return;
      }
      await mockToolsResponse(route, log);
    });

    await page.goto(`/servers/${legacyServer.id}/tools`);
    await expect(page.getByTestId("permission-row-per-1")).toBeVisible();

    // Server goes away: the rows stay, every round-trip action is disabled.
    state.online = false;
    await expect(page.getByTestId("tools-offline-alert")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Pfad im Projekt")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Anfrage per-1 einmalig erlauben" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Anfrage per-1 ablehnen" })).toBeDisabled();

    // Nothing was answered against the unreachable server.
    expect(log.permissionReplies).toEqual([]);
  },
);