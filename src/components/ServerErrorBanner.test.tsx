import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ServerErrorBanner from "./ServerErrorBanner.tsx";

function renderBanner(error: string, serverId?: string) {
  return render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter>
        <ServerErrorBanner error={error} testId="offline-alert" serverId={serverId} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("ServerErrorBanner", () => {
  it("shows the friendly message for a 401 page and hides the technical detail", () => {
    renderBanner("UnsupportedContentType: text/plain; charset=utf-8");
    expect(screen.getByText(/Anmeldung fehlgeschlagen/)).toBeVisible();
    expect(screen.queryByText(/Server offline oder nicht erreichbar/)).toBeNull();
    // Technical detail stays available but collapsed.
    expect(screen.getByText("Technische Details")).toBeVisible();
    expect(screen.getByText("UnsupportedContentType: text/plain; charset=utf-8")).not.toBeVisible();
  });

  it("keeps the offline text for network failures", () => {
    renderBanner("Failed to fetch");
    expect(screen.getByText(/Server offline oder nicht erreichbar/)).toBeVisible();
    expect(screen.queryByText(/Anmeldung fehlgeschlagen/)).toBeNull();
    expect(screen.queryByText("Technische Details")).toBeNull();
  });

  it("links to the server edit form on auth failure", () => {
    renderBanner("UnsupportedContentType: text/plain; charset=utf-8", "srv-1");
    const link = screen.getByTestId("offline-alert-edit-link");
    expect(link).toBeVisible();
    expect(link).toHaveTextContent("Server bearbeiten");
    expect(link.getAttribute("href")).toBe("/settings?edit=srv-1");
  });

  it("falls back to plain settings without a server id", () => {
    renderBanner("UnexpectedStatus: 401");
    const link = screen.getByTestId("offline-alert-edit-link");
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("shows no edit link for network failures", () => {
    renderBanner("Failed to fetch", "srv-1");
    expect(screen.queryByTestId("offline-alert-edit-link")).toBeNull();
  });
});
