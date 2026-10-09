// Generic manifest-driven screenshot spec for the ui-review skill.
//
// Captures every route x state x viewport combo as a full-page PNG plus a
// viewport-height section capture (`<name>-sec0.png`). Pages in this app are
// short (no inner scroll container), so a single section suffices; the
// section file still exists so reviewers never rely on a downscaled
// full-page render alone.
//
// This set never asserts behavior — it only captures pixels. It is excluded
// from the normal E2E suite via the dedicated screenshots config.
import { expect, test, type Page, type Route } from "@playwright/test";
import path from "node:path";
import {
  EXPECTED_TITLE,
  SCREENSHOT_OUTPUT_DIR,
  routes,
  type UiReviewMock,
  type UiReviewRoute,
  type UiReviewState,
  type UiReviewViewport,
} from "./ui-review.config.ts";
import {
  ACTIVE_SESSIONS,
  AGENTS_SESSION_ROWS,
  CHAT_MESSAGES,
  CHAT_RUNNING_ACTIVE,
  CHAT_RUNNING_MESSAGES,
  CHAT_RUNNING_SESSION_ROWS,
  FILE_ENTRIES,
  FORM_ROWS,
  INBOX_ROWS,
  MCP_SERVERS,
  PERMISSIONS,
  PROJECTS,
  RUNNING_PTYS,
  RUNNING_SHELLS,
  SESSION_DIFF_ROWS,
  SESSION_ROWS,
} from "./mockFixtures.ts";

const demoServer = {
  id: "e2e-server",
  name: "Demo-Server",
  baseUrl: "http://demo.local",
  username: "",
  password: "",
};

const out = (state: UiReviewState, viewport: UiReviewViewport, file: string) =>
  path.resolve(process.cwd(), SCREENSHOT_OUTPUT_DIR, state, viewport, file);

function viewportForProject(projectName: string): UiReviewViewport {
  return projectName.toLowerCase().includes("mobile") ? "mobile" : "desktop";
}

async function seed(page: Page, route: UiReviewRoute, state: UiReviewState) {
  // Dashboard empty: no server at all (shows the "Kein Server" empty state).
  // Settings empty: no server (shows "Noch keine Server vorhanden").
  // All other combos seed one demo server; filled vs empty differs only in
  // the mocked API payloads.
  const clear =
    (route.name === "dashboard" && state === "empty") ||
    (route.name === "settings" && state === "empty");
  if (clear) {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    return;
  }
  await page.addInitScript((value) => {
    localStorage.setItem("opencode-pwa:servers", JSON.stringify([value]));
  }, demoServer);
}

function payload(data: unknown) {
  return JSON.stringify(data);
}

function json(routeReq: Route, data: unknown) {
  return routeReq.fulfill({ status: 200, contentType: "application/json", body: payload(data) });
}

async function mockApi(page: Page, route: UiReviewRoute, state: UiReviewState) {
  const mock: UiReviewMock = state === "empty" ? emptyMockFor(route.mock) : route.mock;
  const filled = state !== "empty";
  const failUrls = route.failUrls ?? [];
  await page.route("**/api/**", async (routeReq: Route) => {
    const url = routeReq.request().url();
    // The offline capture comes from a failed round-trip (the app derives its
    // offline state from the last load error, not from `navigator.onLine`).
    if (failUrls.some((needle) => url.includes(needle))) {
      await routeReq.abort("internetdisconnected");
      return;
    }
    if (url.includes("/api/event")) {
      await routeReq.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }
    if (mock === "none") {
      await json(routeReq, {});
      return;
    }

    // --- session scoped -------------------------------------------------
    if (url.includes("/message")) {
      const messages =
        mock === "chat-running"
          ? CHAT_RUNNING_MESSAGES
          : mock === "session-empty" || mock === "session-diff" || mock === "agents"
            ? []
            : CHAT_MESSAGES;
      await json(routeReq, { data: messages, cursor: {} });
      return;
    }
    if (url.includes("/diff")) {
      const rows = mock === "session-diff" && filled ? SESSION_DIFF_ROWS : [];
      await json(routeReq, { location: {}, data: rows });
      return;
    }
    if (url.includes("/api/session/active")) {
      if (mock === "agents" && filled) await json(routeReq, ACTIVE_SESSIONS);
      else if (mock === "chat-running" && filled) await json(routeReq, CHAT_RUNNING_ACTIVE);
      else await json(routeReq, {});
      return;
    }
    // Single-session GET (`/api/session/<id>`, optional trailing slash): the
    // agent/model switch calls it, so it must answer a SessionInfo, not a
    // list — otherwise every capture carries a stale red
    // "could not switch agent/model" banner.
    if (url.includes("/inbox")) {
      await json(routeReq, { location: {}, data: filled && mock !== "session-empty" ? INBOX_ROWS : [] });
      return;
    }
    if (url.includes("/form")) {
      await json(routeReq, { location: {}, data: filled && mock !== "session-empty" ? FORM_ROWS : [] });
      return;
    }
    if (url.includes("/revert")) {
      await json(routeReq, { location: {}, data: { staged: false } });
      return;
    }
    if (/\/api\/session\/[^/?#]+\/?$/.test(url)) {
      await json(routeReq, {
        id: "ses-1",
        title: "ses-1",
        agent: "build",
        model: { providerID: "anthropic", id: "claude-sonnet-4" },
        projectID: "p1",
        time: { created: Date.now() - 900_000, updated: Date.now() - 60_000 },
      });
      return;
    }
    if (url.includes("/api/model")) {
      await json(routeReq, {
        data: [
          { id: "anthropic/claude-sonnet-4", modelID: "claude-sonnet-4", providerID: "anthropic", name: "Claude Sonnet 4" },
          { id: "anthropic/claude-haiku-4", modelID: "claude-haiku-4", providerID: "anthropic", name: "Claude Haiku 4" },
        ],
      });
      return;
    }
    if (url.includes("/api/experimental/session/stats")) {
      await json(routeReq, {
        data: { prompts: 128, sessions: 7, tools: { totals: { calls: 342 } }, cost: 1.42, tokens: 128_400 },
      });
      return;
    }
    if (url.includes("/api/session") && routeReq.request().method() === "GET") {
      // The running-strip and agents captures need recent start times for the
      // elapsed runtime, everything else keeps the fixed `T0` anchors.
      const sessions =
        (mock === "chat-running" || mock === "agents") && filled
          ? mock === "agents"
            ? AGENTS_SESSION_ROWS
            : CHAT_RUNNING_SESSION_ROWS
          : filled && mock !== "session-empty" && mock !== "none" && mock !== "settings"
            ? SESSION_ROWS
            : [];
      await json(routeReq, { data: sessions, cursor: { next: null, previous: null } });
      return;
    }

    // --- server scoped --------------------------------------------------
    if (url.includes("/api/shell") && !url.includes("/output")) {
      const shells =
        filled && (mock === "server" || mock === "dashboard" || mock === "tools" || mock === "chat-running")
          ? RUNNING_SHELLS
          : [];
      await json(routeReq, { location: {}, data: shells });
      return;
    }
    if (url.includes("/api/shell/") && url.includes("/output")) {
      await json(routeReq, { location: {}, data: { output: "hallo ausgabe\n", cursor: 14, size: 14, truncated: false } });
      return;
    }
    if (url.includes("/api/pty")) {
      const ptys = filled && mock === "chat-running" ? RUNNING_PTYS : [];
      await json(routeReq, { location: {}, data: ptys });
      return;
    }
    if (url.includes("/api/project")) {
      const projects = filled && mock !== "none" && mock !== "settings" ? PROJECTS : [];
      await json(routeReq, { data: projects });
      return;
    }
    if (url.includes("/api/agent")) {
      await json(routeReq, { location: {}, data: [{ id: "coder" }, { id: "build" }, { id: "plan" }] });
      return;
    }
    if (url.includes("/api/file")) {
      await json(routeReq, { location: {}, data: filled && mock === "tools" ? FILE_ENTRIES : [] });
      return;
    }
    if (url.includes("/api/mcp")) {
      await json(routeReq, { location: {}, data: filled && mock === "tools" ? MCP_SERVERS : [] });
      return;
    }
    if (url.includes("/api/permission")) {
      await json(routeReq, { location: {}, data: filled && mock === "tools" ? PERMISSIONS : [] });
      return;
    }
    if (url.includes("/api/config")) {
      await json(routeReq, { location: {}, data: filled && mock === "tools" ? { theme: "dark", model: "anthropic/claude-sonnet-4" } : {} });
      return;
    }
    if (url.includes("/api/info")) {
      await json(routeReq, { version: "9.9.9", pid: 4242 });
      return;
    }
    await json(routeReq, {});
  });
}

function emptyMockFor(mock: UiReviewMock): UiReviewMock {
  if (mock === "chat-steps") return "session-empty";
  return mock;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveTitle(EXPECTED_TITLE);
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForTimeout(400);
}

for (const route of routes) {
  for (const state of route.states) {
    for (const viewport of ["desktop", "mobile"] as const) {
      test(`screenshot ${route.name} (${state}, ${viewport})`, { tag: ["@screenshot"] }, async ({ page }, testInfo) => {
        test.skip(
          viewportForProject(testInfo.project.name) !== viewport,
          `project ${testInfo.project.name} renders the ${viewportForProject(testInfo.project.name)} viewport`,
        );
        await seed(page, route, state);
        await mockApi(page, route, state);
        await page.goto(route.path);
        await settle(page);
        for (const testid of route.steps ?? []) {
          await page.getByTestId(testid).first().click();
          await page.waitForTimeout(250);
        }
        await page.screenshot({ path: out(state, viewport, `${route.name}.png`), fullPage: true });
        await page.screenshot({ path: out(state, viewport, `${route.name}-sec0.png`), fullPage: false });
      });
    }
  }
}
