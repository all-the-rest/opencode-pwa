import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, render, screen, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ServerProvider } from "../state/servers.tsx";
import Settings from "./Settings.tsx";

async function mountSettings(): Promise<RenderResult> {
  let handle: RenderResult | null = null;
  await act(async () => {
    handle = render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <ServerProvider>
            <Settings />
          </ServerProvider>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  if (handle === null) throw new Error("render() returned no handle");
  return handle;
}

describe("Settings CORS hint (mobile layout)", () => {
  it("stacks hint text above the command and keeps the command scrollable", async () => {
    await mountSettings();
    const hint = screen.getByTestId("cors-hint");
    // Mobile-first: stacked (flex-col), side-by-side only on sm+.
    expect(hint.className).toContain("flex-col");
    expect(hint.className).toContain("sm:flex-row");

    const command = screen.getByTestId("cors-command");
    expect(command).toHaveTextContent("opencode serve --cors");
    expect(command).toHaveTextContent(window.location.origin);
    // Scrollable single line instead of per-character wrapping (no break-all).
    expect(command.className).toContain("overflow-x-auto");
    expect(command.className).toContain("whitespace-nowrap");
    expect(command.className).not.toContain("break-all");
  });
});
