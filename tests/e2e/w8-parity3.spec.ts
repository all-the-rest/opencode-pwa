import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * W8 (parity batch 3):
 *  - SessionDetail: staged revert flow (stage → commit with German confirm),
 *    slash-command run in the session.
 *  - ServerTools: websearch providers + search box with results list.
 */

const server = {
  id: "parity3-server",
  name: "Parity-Server",
  baseUrl: "http://parity3.local",
  username: "",
};

interface CommandCall {
  sessionID: string;
  name: string;
  text: string;
}

interface CallLog {
  commands: CommandCall[];
  revertStages: string[];
  revertCommits: string[];
  revertClears: string[];
  searches: Array<{ query: string; providerID: string | null }>;
  inboxCancels: string[];
  inboxUpdates: Array<{ inboxID: string; delivery: string }>;
  formReplies: Array<{ formID: string; answer: unknown }>;
  formCancels: string[];
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedServer(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, server);
}

function freshLog(): CallLog {
  return {
    commands: [],
    revertStages: [],
    revertCommits: [],
    revertClears: [],
    searches: [],
    inboxCancels: [],
    inboxUpdates: [],
    formReplies: [],
    formCancels: [],
  };
}

const sessionInfo = {
  data: {
    id: "ses-1",
    agent: "coder",
    model: { id: "claude-sonnet-4", providerID: "anthropic" },
    tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0.01,
  },
};

async function mockApi(page: Page, log: CallLog) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (url.includes("/api/event")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }

    if (url.includes("/experimental/session/stats")) {
      await json(route, { data: { sessions: 1, prompts: 2, steps: 3 } });
      return;
    }

    const stageMatch = url.match(/\/api\/session\/([^/]+)\/revert\/stage$/) && method === "POST";
    if (stageMatch !== false && stageMatch !== null) {
      const match = url.match(/\/api\/session\/([^/]+)\/revert\/stage/);
      log.revertStages.push(match?.[1] ?? "");
      // The client unwraps `.data` (`SessionRevertStageOutput`), so the mock
      // answers with the envelope the real server sends.
      await json(route, { data: { messageID: "m2", files: [{ file: "src/app.ts" }] } });
      return;
    }

    if (/\/api\/session\/[^/]+\/revert\/commit$/.test(url) && method === "POST") {
      const match = url.match(/\/api\/session\/([^/]+)\/revert\/commit/);
      log.revertCommits.push(match?.[1] ?? "");
      await json(route, {});
      return;
    }

    if (/\/api\/session\/[^/]+\/revert$/.test(url) && method === "DELETE") {
      const match = url.match(/\/api\/session\/([^/]+)\/revert/);
      log.revertClears.push(match?.[1] ?? "");
      await json(route, {});
      return;
    }

    if (/\/api\/session\/[^/]+\/command$/.test(url) && method === "POST") {
      const match = url.match(/\/api\/session\/([^/]+)\/command/);
      const body = (request.postDataJSON() ?? {}) as { name?: unknown; text?: unknown };
      log.commands.push({
        sessionID: match?.[1] ?? "",
        name: typeof body.name === "string" ? body.name : "",
        text: typeof body.text === "string" ? body.text : "",
      });
      await json(route, {});
      return;
    }

    const inboxMatch = url.match(/\/api\/session\/([^/]+)\/inbox(?:\/([^/]+))?$/);
    if (inboxMatch !== null) {
      const inboxID = inboxMatch[2] ?? "";
      if (method === "GET") {
        // `inbox.list` unwraps `.data`, like the real server envelope.
        await json(route, {
          data: [
            {
              id: "in-1",
              sessionID: "ses-1",
              type: "user",
              payload: { text: "Bitte weitermachen" },
              delivery: "queue",
            },
            { id: "in-2", sessionID: "ses-1", type: "compaction", payload: {}, delivery: "queue" },
          ],
        });
        return;
      }
      if (method === "DELETE") {
        log.inboxCancels.push(inboxID);
        await json(route, {});
        return;
      }
      if (method === "PATCH") {
        const body = (request.postDataJSON() ?? {}) as { delivery?: unknown };
        log.inboxUpdates.push({
          inboxID,
          delivery: typeof body.delivery === "string" ? body.delivery : "",
        });
        await json(route, {});
        return;
      }
    }

    const formMatch = url.match(/\/api\/session\/([^/]+)\/form(?:\/([^/]+)(\/reply)?)?$/);
    if (formMatch !== null) {
      const formID = formMatch[2] ?? "";
      const isReply = formMatch[3] === "/reply";
      if (method === "GET" && formID === "") {
        // `form.list` unwraps `.data`, like the real server envelope.
        await json(route, { data: [{ id: "f-1", sessionID: "ses-1", title: "Freigabe?" }] });
        return;
      }
      if (method === "POST" && isReply) {
        const body = (request.postDataJSON() ?? {}) as { answer?: unknown };
        log.formReplies.push({ formID, answer: body.answer ?? null });
        await json(route, {});
        return;
      }
      if (method === "DELETE" && formID !== "" && !isReply) {
        log.formCancels.push(formID);
        await json(route, {});
        return;
      }
    }

    if (url.includes("/api/websearch/provider")) {
      await json(route, { location: {}, data: [{ id: "tavily", name: "Tavily" }] });
      return;
    }

    if (/\/api\/websearch$/.test(url) && method === "POST") {
      const body = (request.postDataJSON() ?? {}) as { query?: unknown; providerID?: unknown };
      log.searches.push({
        query: typeof body.query === "string" ? body.query : "",
        providerID: typeof body.providerID === "string" ? body.providerID : null,
      });
      await json(route, {
        location: {},
        data: {
          providerID: "tavily",
          results: [
            { url: "https://a.example/treffer", title: "Treffer A", content: "Auszug A" },
          ],
        },
      });
      return;
    }

    if (url.includes("/api/session/ses-1/message")) {
      await json(route, {
        data: [
          { id: "m1", role: "user", text: "Hallo" },
          { id: "m2", role: "assistant", text: "Hi!" },
        ],
      });
      return;
    }

    if (url.match(/\/api\/session\/ses-1$/) && method === "GET") {
      await json(route, sessionInfo);
      return;
    }

    if (url.includes("/api/command")) {
      await json(route, {
        location: {},
        data: [{ name: "test", description: "Tests ausführen" }],
      });
      return;
    }

    if (url.includes("/api/skill")) {
      await json(route, {
        location: {},
        data: [{ id: "review", name: "Review", description: "Codereview" }],
      });
      return;
    }

    if (url.includes("/api/agent")) {
      await json(route, {
        location: {},
        data: [{ id: "coder", name: "Coder", mode: "primary" }],
      });
      return;
    }

    if (url.includes("/api/model")) {
      await json(route, {
        location: {},
        data: [{ modelID: "claude-sonnet-4", providerID: "anthropic", name: "Claude Sonnet 4" }],
      });
      return;
    }

    if (url.includes("/api/provider")) {
      await json(route, {
        location: {},
        data: [{ id: "anthropic", name: "Anthropic", activation: "enabled" }],
      });
      return;
    }

    if (url.includes("/api/fs/list")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/vcs/status")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/worktree")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/mcp")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/permission/request")) {
      await json(route, { location: {}, data: [] });
      return;
    }

    if (url.includes("/api/project")) {
      await json(route, { location: {}, data: [{ id: "p1", canonical: "/repo", name: "Repo" }] });
      return;
    }

    if (url.includes("/api/session")) {
      await json(route, { data: [], cursor: { next: null, previous: null } });
      return;
    }

    await json(route, {});
  });
}

test(
  "staged revert flow asks for German confirm before commit",
  { tag: ["@feature", "@feature:session-revert"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await expect(page.getByTestId("session-revert-section")).toBeVisible();
    await page.getByRole("button", { name: "Revert anzeigen" }).click();
    await page.getByTestId("revert-message-select").selectOption("m2");
    await page.getByRole("button", { name: "Revert-Staging starten" }).click();

    await expect
      .poll(() => log.revertStages, { timeout: 10_000 })
      .toContainEqual("ses-1");
    await expect(page.getByTestId("revert-staged")).toContainText("m2");
    await expect(page.getByTestId("revert-staged")).toContainText("1 Dateien");

    await page.getByRole("button", { name: "Revert übernehmen" }).click();
    await expect(page.getByText("gehen verloren")).toBeVisible();
    await page.getByRole("button", { name: "Übernehmen", exact: true }).click();

    await expect
      .poll(() => log.revertCommits, { timeout: 10_000 })
      .toContainEqual("ses-1");
    await expect(page.getByText("Revert übernommen")).toBeVisible({ timeout: 10_000 });
  },
);

test(
  "running a slash command posts name and text to the session",
  { tag: ["@feature", "@feature:session-command"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await expect(page.getByTestId("session-command-section")).toBeVisible();
    await page.getByRole("button", { name: "Befehle anzeigen" }).click();
    await page.getByTestId("session-command-select").selectOption("test");
    await page.getByTestId("session-command-text").fill("schnell");
    await page.getByTestId("session-command-run").click();

    await expect
      .poll(() => log.commands, { timeout: 10_000 })
      .toContainEqual({ sessionID: "ses-1", name: "test", text: "schnell" });
    await expect(page.getByText("Befehl", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("gestartet")).toBeVisible({ timeout: 10_000 });
  },
);

test(
  "websearch on ServerTools lists providers and shows hits",
  { tag: ["@feature", "@feature:websearch"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/servers/${server.id}/tools`);

    await expect(page.getByTestId("websearch-card")).toBeVisible();
    await page.getByTestId("websearch-provider").selectOption("tavily");
    await page.getByTestId("websearch-query").fill("opencode pwa");
    await page.getByTestId("websearch-submit").click();

    await expect
      .poll(() => log.searches, { timeout: 10_000 })
      .toContainEqual({ query: "opencode pwa", providerID: "tavily" });
    await expect(page.getByTestId("websearch-result-0")).toContainText("Treffer A");
    await expect(page.getByTestId("websearch-card")).toContainText("Anbieter: tavily");
  },
);

test(
  "commands and skills are listed read-only on ServerTools",
  { tag: ["@feature", "@feature:command-skill-list"] },
  async ({ page }) => {
    await seedServer(page);
    await mockApi(page, freshLog());
    await page.goto(`/servers/${server.id}/tools`);

    await expect(page.getByTestId("command-row-test")).toContainText("Tests ausführen");
    await expect(page.getByTestId("skill-row-review")).toContainText("Codereview");
  },
);

test(
  "inbox entries can be re-delivered or cancelled",
  { tag: ["@feature", "@feature:session-inbox"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await expect(page.getByTestId("session-inbox-section")).toBeVisible();
    await page.getByRole("button", { name: "Eingangsbox anzeigen" }).click();

    await expect(page.getByTestId("session-inbox-in-1")).toContainText("Bitte weitermachen");
    await expect(page.getByTestId("session-inbox-delivery-in-2")).toContainText("Warteschlange");

    await page.getByTestId("session-inbox-steer-in-2").click();
    await expect
      .poll(() => log.inboxUpdates, { timeout: 10_000 })
      .toContainEqual({ inboxID: "in-2", delivery: "steer" });
    await expect(page.getByTestId("session-inbox-delivery-in-2")).toContainText("sofort");

    await page.getByRole("button", { name: "Eintrag in-1 abbrechen" }).click();
    await expect
      .poll(() => log.inboxCancels, { timeout: 10_000 })
      .toContainEqual("in-1");
    await expect(page.getByTestId("session-inbox-in-1")).toHaveCount(0);
  },
);

test(
  "pending forms accept a JSON answer",
  { tag: ["@feature", "@feature:session-form"] },
  async ({ page }) => {
    const log = freshLog();
    await seedServer(page);
    await mockApi(page, log);
    await page.goto(`/sessions/ses-1?server=${server.id}`);

    await expect(page.getByTestId("session-forms-section")).toBeVisible();
    await page.getByRole("button", { name: "Formulare anzeigen" }).click();

    await expect(page.getByTestId("session-form-f-1")).toContainText("Freigabe?");
    await page.getByTestId("session-form-select").selectOption("f-1");
    await page.getByTestId("session-form-answer").fill('{"ok": true}');
    await page.getByTestId("session-form-reply").click();

    await expect
      .poll(() => log.formReplies, { timeout: 10_000 })
      .toContainEqual({ formID: "f-1", answer: { ok: true } });
    await expect(page.getByTestId("session-form-f-1")).toHaveCount(0);
  },
);
