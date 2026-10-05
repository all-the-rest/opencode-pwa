import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SERVER_EVENT_PREFS_KEY, ServerProvider, STORAGE_KEY, useServers } from "./servers.tsx";

function Probe() {
  const { servers } = useServers();
  return <div data-testid="count">{servers.length}</div>;
}

function Adder({ input }: { input: { name: string; baseUrl: string; username: string; password: string } }) {
  const { addServer, servers } = useServers();
  return (
    <div>
      <span data-testid="count">{servers.length}</span>
      <button type="button" onClick={() => addServer(input)}>
        add
      </button>
    </div>
  );
}

function Editor() {
  const { addServer, updateServer, removeServer, servers } = useServers();
  return (
    <div>
      <span data-testid="count">{servers.length}</span>
      <span data-testid="names">{servers.map((s) => s.name).join(",")}</span>
      <button type="button" onClick={() => addServer({ name: "A", baseUrl: "http://a.local", username: "", password: "" })}>
        add-a
      </button>
      <button
        type="button"
        onClick={() => {
          const first = servers[0];
          if (first) updateServer(first.id, { name: "B", baseUrl: "http://b.local", username: "u", password: "p" });
        }}
      >
        rename
      </button>
      <button
        type="button"
        onClick={() => {
          const first = servers[0];
          if (first) removeServer(first.id);
        }}
      >
        remove
      </button>
    </div>
  );
}

describe("ServerProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders with empty server list by default", () => {
    localStorage.clear();
    render(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("persists added servers to localStorage (roundtrip across remount)", () => {
    const { unmount } = render(
      <ServerProvider>
        <Adder input={{ name: "Heimserver", baseUrl: "http://heim.local", username: "u", password: "p" }} />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");

    act(() => {
      screen.getByRole("button", { name: "add" }).click();
    });
    expect(screen.getByTestId("count")).toHaveTextContent("1");

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as Array<{ name: string; baseUrl: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toBe("Heimserver");
    expect(parsed[0]?.baseUrl).toBe("http://heim.local");

    unmount();
    render(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("update + remove roundtrip through localStorage", () => {
    render(
      <ServerProvider>
        <Editor />
      </ServerProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "add-a" }).click();
    });
    expect(screen.getByTestId("names")).toHaveTextContent("A");

    act(() => {
      screen.getByRole("button", { name: "rename" }).click();
    });
    expect(screen.getByTestId("names")).toHaveTextContent("B");
    expect(localStorage.getItem(STORAGE_KEY)).toContain("http://b.local");

    act(() => {
      screen.getByRole("button", { name: "remove" }).click();
    });
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("[]");
  });

  it("ignores invalid stored entries on load", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "ok-1", name: "Gut", baseUrl: "http://gut.local" },
        { id: 42, name: "Kaputt" },
        "nur-ein-string",
        null,
      ]),
    );
    render(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("falls back to empty list on corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{kein-json");
    render(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});

describe("serverEventPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function ToggleProbe() {
    const { servers, serverEventPrefs, toggleServerEventNotifications } = useServers();
    const first = servers[0];
    return (
      <div>
        <span data-testid="count">{servers.length}</span>
        <span data-testid="pref">
          {first === undefined ? "kein-server" : String(serverEventPrefs[first.id] ?? true)}
        </span>
        <button
          type="button"
          onClick={() => {
            if (first !== undefined) toggleServerEventNotifications(first.id);
          }}
        >
          toggle
        </button>
      </div>
    );
  }

  it("defaults to on when no pref is stored", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "server-1", name: "Lokal", baseUrl: "http://lokal.local" }]),
    );
    render(
      <ServerProvider>
        <ToggleProbe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("pref")).toHaveTextContent("true");
    expect(localStorage.getItem(SERVER_EVENT_PREFS_KEY)).toBe("{}");
  });

  it("flips the pref and persists it (roundtrip across remount)", () => {
    const { unmount: unmountAdder } = render(
      <ServerProvider>
        <Adder input={{ name: "Heimserver", baseUrl: "http://heim.local", username: "", password: "" }} />
      </ServerProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "add" }).click();
    });
    unmountAdder();

    const { unmount: unmountFirst } = render(
      <ServerProvider>
        <ToggleProbe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("pref")).toHaveTextContent("true");

    act(() => {
      screen.getByRole("button", { name: "toggle" }).click();
    });
    expect(screen.getByTestId("pref")).toHaveTextContent("false");
    const raw = localStorage.getItem(SERVER_EVENT_PREFS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as Record<string, boolean>;
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as Array<{ id: string }>;
    expect(parsed[stored[0]?.id ?? ""]).toBe(false);

    unmountFirst();
    render(
      <ServerProvider>
        <ToggleProbe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("pref")).toHaveTextContent("false");
  });

  it("ignores non-boolean stored values on load", () => {
    localStorage.setItem(SERVER_EVENT_PREFS_KEY, JSON.stringify({ "server-1": "nein" }));
    render(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    // The provider still mounts; the invalid entry is dropped on load.
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});
