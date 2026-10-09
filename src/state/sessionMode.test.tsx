import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SessionModeProvider,
  SESSION_MODE_STORAGE_KEY,
  useSessionMode,
} from "./sessionMode.tsx";

function Probe() {
  const { mode, expert } = useSessionMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="expert">{expert ? "yes" : "no"}</span>
    </div>
  );
}

function Toggler() {
  const { mode, toggleMode } = useSessionMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={toggleMode}>
        toggle
      </button>
    </div>
  );
}

describe("SessionModeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts EINFACH and persists the expert choice", async () => {
    const first = render(
      <SessionModeProvider>
        <Toggler />
      </SessionModeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("basic");
    expect(localStorage.getItem(SESSION_MODE_STORAGE_KEY)).toBe("basic");

    act(() => {
      screen.getByRole("button", { name: "toggle" }).click();
    });
    expect(screen.getByTestId("mode")).toHaveTextContent("expert");
    expect(localStorage.getItem(SESSION_MODE_STORAGE_KEY)).toBe("expert");

    // A reload (fresh provider) keeps the expert surface.
    first.unmount();
    render(
      <SessionModeProvider>
        <Probe />
      </SessionModeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("expert");
    expect(screen.getByTestId("expert")).toHaveTextContent("yes");
  });

  it("toggling twice returns to basic", () => {
    render(
      <SessionModeProvider>
        <Toggler />
      </SessionModeProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "toggle" }).click();
      screen.getByRole("button", { name: "toggle" }).click();
    });
    expect(screen.getByTestId("mode")).toHaveTextContent("basic");
    expect(localStorage.getItem(SESSION_MODE_STORAGE_KEY)).toBe("basic");
  });

  it("falls back to basic on missing or invalid stored values", () => {
    localStorage.setItem(SESSION_MODE_STORAGE_KEY, "profi");
    const first = render(
      <SessionModeProvider>
        <Probe />
      </SessionModeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("basic");
    expect(screen.getByTestId("expert")).toHaveTextContent("no");
    first.unmount();

    localStorage.removeItem(SESSION_MODE_STORAGE_KEY);
    render(
      <SessionModeProvider>
        <Probe />
      </SessionModeProvider>,
    );
    expect(screen.getByTestId("mode")).toHaveTextContent("basic");
  });
});
