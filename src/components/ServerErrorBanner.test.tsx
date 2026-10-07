import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ServerErrorBanner from "./ServerErrorBanner.tsx";

function renderBanner(error: string) {
  return render(
    <I18nProvider i18n={i18n}>
      <ServerErrorBanner error={error} testId="offline-alert" />
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
});
