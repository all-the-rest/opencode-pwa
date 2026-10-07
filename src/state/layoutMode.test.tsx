import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LayoutModeProvider,
  LAYOUT_MODE_STORAGE_KEY,
  useLayoutMode,
} from "./layoutMode.tsx";

function Probe() {
  const { mode, split } = useLayoutMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="split">{split ? "yes" : "no"}</span>
    </div>
  );
}

function Toggler() {
  const { mode, toggleMode } = useLayoutMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={toggleMode}>
        toggle
      </button>
    </div>
  );
}

describe("LayoutModeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to single-column and persists the toggle", async () => {
    const first = render(
      <LayoutModeProvider>
        <Toggler />
      </LayoutModeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("single");

    act(() => {
      screen.getByRole("button", { name: "toggle" }).click();
    });
    expect(screen.getByTestId("mode")).toHaveTextContent("split");
    expect(localStorage.getItem(LAYOUT_MODE_STORAGE_KEY)).toBe("split");

    first.unmount();
    render(
      <LayoutModeProvider>
        <Probe />
      </LayoutModeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("split");
    expect(screen.getByTestId("split")).toHaveTextContent("yes");
  });

  it("toggling twice returns to single-column", () => {
    render(
      <LayoutModeProvider>
        <Toggler />
      </LayoutModeProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "toggle" }).click();
      screen.getByRole("button", { name: "toggle" }).click();
    });
    expect(screen.getByTestId("mode")).toHaveTextContent("single");
    expect(localStorage.getItem(LAYOUT_MODE_STORAGE_KEY)).toBe("single");
  });

  it("falls back to single-column on missing or invalid stored values", () => {
    localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, "dreispaltig");
    const first = render(
      <LayoutModeProvider>
        <Probe />
      </LayoutModeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("single");
    expect(screen.getByTestId("split")).toHaveTextContent("no");
    first.unmount();

    localStorage.removeItem(LAYOUT_MODE_STORAGE_KEY);
    render(
      <LayoutModeProvider>
        <Probe />
      </LayoutModeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("single");
  });
});
