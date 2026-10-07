import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Parity wave W5:
 *  - offline-server behaviour (owner requirement): an unreachable server is
 *    never removed, its sessions are badged and disabled, no delete prompt.
 *  - agent/model picker for a session.
 *  - shell output tail-poll with a live indicator.
 *  - per-server notification toggle, persisted.
 */

const server = {
  id: "e2e-server",
  name: "E2E-Server",
  baseUrl: "http://e2e.local",
  username: "",
  password: "",
};

const agents = [
  { id: "build", name: "Build-Agent", mode: "primary", hidden: false },
  { id: "plan", name: "Plan-Agent", mode: "primary", hidden: false },
  { id: "intern", name: "Intern", mode: "all", hidden: true },
];

const models = [
  {
    id: "anthropic/claude-sonnet-4",
    modelID: "claude-sonnet-4",
    providerID: "anthropic",
    name: "Claude Sonnet 4",
    variants: [{ id: "high" }, { id: "low" }],
  },
  { id: "gpt-5", modelID: "gpt-5", providerID: "openai", name: "GPT-5" },
];

const sessions = [
  { id: "ses-1", title: "Alpha bauen", agent: "build", projectID: "p1" },
  { id: "ses-2", title: "Beta prüfen", agent: "plan", projectID: "p2" },
];

interface CallLog {
  interrupts: string[];
  deletedSessions: string[];
  deletedShells: string[];
  createdShells: string[];
  switchedAgents: string[];
  switchedModels: Array<{ id: string; providerID: string; variant?: string }>;
}

interface MockState {
  /** Flipped to false mid-test to simulate the server going away. */
  online: boolean;
  /** Cursor the tail has already consumed. */
  cursor: number;
}

function freshLog(): CallLog {
  return {
    interrupts: [],
    deletedSessions: [],
    deletedShells: [],
    createdShells: [],
    switchedAgents: [],
    switchedModels: [],
  };
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/**
 * Mock the whole API surface. `state.online === false` makes every `/api/**`
 * request fail with a connection error — the situation the offline policy is
 * about.
 */
async function mockApi(page: Page, log: CallLog, state: MockState) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (!state.online) {
      await route.abort("connectionrefused");
      return;
    }

    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }

    // --- shell output tail (cursor-paged) ---------------------------------
    if (url.includes("/api/shell/") && url.includes("/output")) {
      const from = Number(new URL(url).searchParams.get("cursor") ?? "0");
      const chunks: Record<number, { output: string; cursor: number }> = {
        0: { output: "zeile eins\n", cursor: 11 },
        11: { output: "zeile zwei\n", cursor: 21 },
      };
      const chunk = chunks[from] ?? { output: "", cursor: state.cursor };
      state.cursor = chunk.cursor;
      await json(route, {
        location: {},
        data: { output: chunk.output, cursor: chunk.cursor, size: chunk.cursor, truncated: false },
      });
      return;
    }

    if (url.includes("/api/shell") && method === "POST") {
      const body = request.postDataJSON() as { command?: unknown } | null;
      log.createdShells.push(typeof body?.command === "string" ? body.command : "");
      await json(route, {
        location: {},
        data: { id: `sh-${log.createdShells.length}`, command: body?.command ?? "", status: "running" },
      });
      return;
    }

    if (url.includes("/api/shell") && method === "GET") {
      await json(route, {
        location: {},
        data: [{ id: "sh-1", command: "sleep 60", status: "running" }].filter(
          (s) => !log.deletedShells.includes(s.id),
        ),
      });
      return;
    }

    if (method === "DELETE" && /\/api\/shell\/[^/?]+$/.test(url)) {
      log.deletedShells.push(url.split("/api/shell/")[1]?.split("?")[0] ?? "");
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    // --- session agent / model switching ----------------------------------
    if (/\/api\/session\/[^/?]+\/agent$/.test(url) && method === "POST") {
      const body = request.postDataJSON() as { agent?: unknown } | null;
      log.switchedAgents.push(typeof body?.agent === "string" ? body.agent : "");
      await json(route, {});
      return;
    }

    if (/\/api\/session\/[^/?]+\/model$/.test(url) && method === "POST") {
      const body = request.postDataJSON() as { model?: unknown } | null;
      const model = body?.model as
        | { id: unknown; providerID: unknown; variant?: unknown }
        | null
        | undefined;
      log.switchedModels.push({
        id: typeof model?.id === "string" ? model.id : "",
        providerID: typeof model?.providerID === "string" ? model.providerID : "",
        ...(typeof model?.variant === "string" ? { variant: model.variant } : {}),
      });
      await json(route, {});
      return;
    }

    if (url.includes("/api/session/") && url.includes("/message")) {
      await json(route, { data: [{ id: "msg-1", role: "assistant", text: "Hallo" }], cursor: {} });
      return;
    }

    // GET /api/session/{id} -> one session (the picker's current agent/model).
    // Verified against the installed client: `session.get()` unwraps `.data`,
    // whereas `agent.list()` / `model.list()` return the `{location, data}`
    // envelope verbatim — hence the different mock shapes here.
    if (/\/api\/session\/[^/?]+$/.test(url) && method === "GET") {
      const id = url.split("/api/session/")[1]?.split("?")[0] ?? "";
      const row = sessions.find((s) => s.id === id);
      await json(route, {
        location: { directory: "/repo", vcs: "git" },
        data: {
          id,
          projectID: row?.projectID ?? "p1",
          agent: row?.agent ?? null,
          model: { id: "claude-sonnet-4", providerID: "anthropic", variant: "high" },
          title: row?.title ?? "",
        },
      });
      return;
    }

    if (url.includes("/api/session") && method === "GET") {
      await json(route, { data: sessions, cursor: { next: null, previous: null } });
      return;
    }

    if (/\/api\/session\/[^/?]+\/interrupt$/.test(url) && method === "POST") {
      log.interrupts.push(url.split("/api/session/")[1]?.split("/")[0] ?? "");
      await json(route, {});
      return;
    }

    if (method === "DELETE" && /\/api\/session\/[^/?]+$/.test(url)) {
      log.deletedSessions.push(url.split("/api/session/")[1]?.split("?")[0] ?? "");
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (url.includes("/api/pty")) {
      await json(route, { location: {}, data: [{ id: "pty-1", title: "Terminal 1" }] });
      return;
    }

    if (url.includes("/api/project")) {
      await json(route, { data: [{ id: "p1", name: "Projekt Eins" }, { id: "p2", name: "Projekt Zwei" }] });
      return;
    }

    if (url.includes("/api/agent")) {
      await json(route, { location: {}, data: agents });
      return;
    }

    if (url.includes("/api/model")) {
      await json(route, { location: {}, data: models });
      return;
    }

    if (url.includes("/api/info")) {
      await json(route, { version: "9.9.9", pid: 4242 });
      return;
    }

    await json(route, {});
  });
}

// ---------------------------------------------------------------------------
// Offline-server behaviour (owner requirement)
// ---------------------------------------------------------------------------

test(
  "offline server stays in the list, sessions are badged and actions disabled",
  { tag: ["@feature", "@feature:offline-server"] },
  async ({ page }) => {
    const log = freshLog();
    const state: MockState = { online: true, cursor: 0 };
    await seedServer(page);
    await mockApi(page, log, state);
    await page.goto(`/servers/${server.id}`);

    // Reachable first: rows and actions are live.
    // Scoped to the sessions card: the sidebar duplicates session links.
    const sessionsCard = page.getByTestId("sessions-card");
    await expect(sessionsCard.getByRole("link", { name: "Alpha bauen" })).toBeVisible();
    await expect(page.getByTestId("offline-badge")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Session Alpha bauen löschen" })).toBeEnabled();

    // Server goes away.
    state.online = false;
    await expect(page.getByTestId("offline-alert")).toBeVisible({ timeout: 20_000 });

    // Still listed, still the same rows — nothing was removed.
    await expect(sessionsCard.getByRole("link", { name: "Alpha bauen" })).toBeVisible();
    await expect(sessionsCard.getByRole("link", { name: "Beta prüfen" })).toBeVisible();

    // Marked offline.
    await expect(page.getByTestId("sessions-offline-badge")).toBeVisible();

    // No actions.
    await expect(page.getByRole("button", { name: "Session Alpha bauen unterbrechen" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Session Alpha bauen löschen" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Shell starten" })).toBeDisabled();
    await expect(page.getByLabel("Neuer Shell-Befehl")).toBeDisabled();

    // No delete prompt appears by itself.
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // Nothing was deleted server-side.
    expect(log.deletedSessions).toEqual([]);
    expect(log.deletedShells).toEqual([]);
    expect(log.interrupts).toEqual([]);
  },
);

test(
  "server survives reachability loss in the dashboard list",
  { tag: ["@feature", "@feature:offline-server"] },
  async ({ page }) => {
    const state: MockState = { online: true, cursor: 0 };
    await seedServer(page);
    await mockApi(page, freshLog(), state);
    await page.goto("/");

    await expect(page.getByText("Alle Server (1)")).toBeVisible();
    await expect(page.getByTestId("badge-sessions")).toContainText("2");

    state.online = false;
    await expect(page.getByTestId("dashboard-offline-badge")).toBeVisible({ timeout: 20_000 });

    // The server entry is still there, and still configured in localStorage.
    await expect(page.getByText("Alle Server (1)")).toBeVisible();
    await expect(page.getByRole("link", { name: "Anzeigen" })).toBeVisible();
    const stored = await page.evaluate(
      () => localStorage.getItem("opencode-pwa:servers") as string | null,
    );
    expect(JSON.parse(stored ?? "[]")).toHaveLength(1);
  },
);

// ---------------------------------------------------------------------------
// Agent / model picker
// ---------------------------------------------------------------------------

test(
  "agent and model picker reads the current values and switches via the API",
  { tag: ["@feature", "@feature:agent-picker"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log, { online: true, cursor: 0 });
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    const agentSelect = page.getByTestId("session-agent-select");
    const modelSelect = page.getByTestId("session-model-select");

    // Options come from /api/agent (hidden agent dropped) and /api/model.
    await expect(agentSelect.locator("option")).toHaveCount(3); // "" + build + plan
    await expect(agentSelect.locator("option", { hasText: "Intern" })).toHaveCount(0);
    await expect(agentSelect).toHaveValue("build");
    await expect(modelSelect).toHaveValue("anthropic/claude-sonnet-4#high");
    await expect(modelSelect.locator("option")).toHaveCount(4); // "" + 2 variants + gpt-5

    await agentSelect.selectOption("plan");
    await expect.poll(() => log.switchedAgents, { timeout: 10_000 }).toContain("plan");
    await expect(agentSelect).toHaveValue("plan");

    // The variant travels with the model ref.
    await modelSelect.selectOption("anthropic/claude-sonnet-4#low");
    await expect
      .poll(() => log.switchedModels, { timeout: 10_000 })
      .toContainEqual({ id: "claude-sonnet-4", providerID: "anthropic", variant: "low" });

    await modelSelect.selectOption("openai/gpt-5");
    await expect
      .poll(() => log.switchedModels, { timeout: 10_000 })
      .toContainEqual({ id: "gpt-5", providerID: "openai" });
  },
);

// ---------------------------------------------------------------------------
// Shell: command execution + live tail
// ---------------------------------------------------------------------------

test(
  "shell command runs and its output tails with a live indicator",
  { tag: ["@feature", "@feature:shell-stream"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log, { online: true, cursor: 0 });
    await page.goto(`/servers/${server.id}`);

    await expect(page.getByText("sleep 60")).toBeVisible();

    // Execute a command directly.
    await page.getByLabel("Neuer Shell-Befehl").fill("echo hallo");
    await page.getByRole("button", { name: "Shell starten" }).click();
    await expect.poll(() => log.createdShells, { timeout: 10_000 }).toContain("echo hallo");

    // Tail: initial chunk, live badge, then the next chunk within the poll.
    await page.getByRole("button", { name: "Ausgabe von sleep 60 anzeigen" }).click();
    await expect(page.getByTestId("shell-output-sh-1")).toContainText("zeile eins");
    await expect(page.getByTestId("shell-live-sh-1")).toBeVisible();
    await expect(page.getByTestId("shell-output-sh-1")).toContainText("zeile zwei", {
      timeout: 10_000,
    });

    // Collapsing stops the tail and drops the live indicator.
    await page.getByRole("button", { name: "Ausgabe von sleep 60 ausblenden" }).click();
    await expect(page.getByTestId("shell-live-sh-1")).toHaveCount(0);
  },
);

// ---------------------------------------------------------------------------
// Per-server notification toggle
// ---------------------------------------------------------------------------

test(
  "per-server notification toggle persists across a reload",
  { tag: ["@feature", "@feature:notifications"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog(), { online: true, cursor: 0 });
    await page.goto("/settings");

    const toggle = page.getByTestId(`server-notifications-${server.id}`);
    await expect(toggle).toBeChecked();

    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("opencode-pwa:server-event-notifications")),
      )
      .toContain(server.id);

    await page.reload();
    await expect(page.getByTestId(`server-notifications-${server.id}`)).not.toBeChecked();
  },
);
