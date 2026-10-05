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

async function mockApi(page: Page, route: UiReviewRoute, state: UiReviewState) {
  const mock: UiReviewMock = state === "empty" ? emptyMockFor(route.mock) : route.mock;
  await page.route("**/api/**", async (routeReq: Route) => {
    const url = routeReq.request().url();
    if (url.includes("/api/event")) {
      await routeReq.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `data: {"type":"session.idle"}\n\n`,
      });
      return;
    }
    if (mock === "none") {
      await routeReq.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    if (url.includes("/api/session/") && url.includes("/message")) {
      const messages =
        mock === "session-empty"
          ? []
          : [
              { id: "msg-1", role: "user", text: "Baue bitte das Feature" },
              { id: "msg-2", role: "assistant", text: "Verstanden, ich lege los." },
            ];
      await routeReq.fulfill({ status: 200, contentType: "application/json", body: payload({ data: messages, cursor: {} }) });
      return;
    }
    if (url.includes("/api/session") && routeReq.request().method() === "GET") {
      const hasData = state !== "empty" && (mock === "server" || mock === "dashboard");
      const sessions = hasData
        ? [{ id: "ses-1", title: "Alpha bauen", agent: "coder", projectID: "p1" }]
        : [];
      await routeReq.fulfill({ status: 200, contentType: "application/json", body: payload({ data: sessions, cursor: { next: null, previous: null } }) });
      return;
    }
    if (url.includes("/api/shell") && !url.includes("/output")) {
      const hasData = state !== "empty" && (mock === "server" || mock === "dashboard");
      const shells = hasData ? [{ id: "sh-1", command: "sleep 60" }] : [];
      await routeReq.fulfill({ status: 200, contentType: "application/json", body: payload({ location: {}, data: shells }) });
      return;
    }
    if (url.includes("/api/shell/") && url.includes("/output")) {
      await routeReq.fulfill({
        status: 200,
        contentType: "application/json",
        body: payload({ location: {}, data: { output: "hallo ausgabe\n", cursor: 14, size: 14, truncated: false } }),
      });
      return;
    }
    if (url.includes("/api/pty")) {
      await routeReq.fulfill({ status: 200, contentType: "application/json", body: payload({ location: {}, data: [] }) });
      return;
    }
    if (url.includes("/api/project")) {
      const hasData = state !== "empty" && (mock === "server" || mock === "dashboard");
      const projects = hasData ? [{ id: "p1", name: "Projekt Eins" }] : [];
      await routeReq.fulfill({ status: 200, contentType: "application/json", body: payload({ data: projects }) });
      return;
    }
    if (url.includes("/api/agent")) {
      await routeReq.fulfill({ status: 200, contentType: "application/json", body: payload({ location: {}, data: [{ id: "coder" }] }) });
      return;
    }
    if (url.includes("/api/info")) {
      await routeReq.fulfill({ status: 200, contentType: "application/json", body: payload({ version: "9.9.9", pid: 4242 }) });
      return;
    }
    await routeReq.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

function emptyMockFor(mock: UiReviewMock): UiReviewMock {
  if (mock === "session") return "session-empty";
  if (mock === "server" || mock === "dashboard") return mock;
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
        await page.screenshot({ path: out(state, viewport, `${route.name}.png`), fullPage: true });
        await page.screenshot({ path: out(state, viewport, `${route.name}-sec0.png`), fullPage: false });
      });
    }
  }
}
