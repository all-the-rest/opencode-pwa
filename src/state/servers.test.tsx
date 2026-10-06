import { act, render, screen, waitFor, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readCredential,
  setVaultStorageForTests,
  type VaultState,
  type VaultStorage,
} from "../lib/credentialVault.ts";
import {
  SERVER_EVENT_PREFS_KEY,
  ServerProvider,
  STORAGE_KEY,
  useServers,
  type ServerInput,
} from "./servers.tsx";

/**
 * The provider settles the credential vault asynchronously, so mounting is
 * wrapped in `act` — otherwise React warns about an unwrapped state update.
 */
async function mountProvider(ui: ReactNode): Promise<RenderResult> {
  let handle: RenderResult | null = null;
  await act(async () => {
    handle = render(ui);
  });
  if (handle === null) throw new Error("render() returned no handle");
  return handle;
}

/** Injected vault backend, so the sealed passwords are observable in tests. */
function vaultBackend(): VaultStorage & { rows: VaultState } {
  const rows: VaultState = { key: null, secrets: new Map() };
  const clone = (): VaultState => ({ key: rows.key, secrets: new Map(rows.secrets) });
  return {
    rows,
    load: async () => clone(),
    save: async (state) => {
      rows.key = state.key;
      rows.secrets = new Map(state.secrets);
    },
    clear: async () => {
      rows.key = null;
      rows.secrets = new Map();
    },
  };
}

function readStoredServers(): Array<Record<string, unknown>> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null || raw === "") return [];
  return JSON.parse(raw) as Array<Record<string, unknown>>;
}

function Probe() {
  const { servers } = useServers();
  return <div data-testid="count">{servers.length}</div>;
}

function StorageProbe() {
  const { credentialStorage } = useServers();
  return <span data-testid="mode">{String(credentialStorage)}</span>;
}

function Adder({ input }: { input: ServerInput }) {
  const { addServer, servers, credentialStorage } = useServers();
  return (
    <div>
      <span data-testid="count">{servers.length}</span>
      <span data-testid="storage">{String(credentialStorage)}</span>
      <button type="button" onClick={() => void addServer(input)}>
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
      <button
        type="button"
        onClick={() => void addServer({ name: "A", baseUrl: "http://a.local", username: "", password: "" })}
      >
        add-a
      </button>
      <button
        type="button"
        onClick={() => {
          const first = servers[0];
          if (first) void updateServer(first.id, { name: "B", baseUrl: "http://b.local", username: "u", password: "p" });
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
    setVaultStorageForTests(null);
  });

  afterEach(() => {
    setVaultStorageForTests(null);
  });

  it("renders with empty server list by default", async () => {
    localStorage.clear();
    await mountProvider(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("persists added servers to localStorage (roundtrip across remount)", async () => {
    const { unmount } = await mountProvider(
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
    await mountProvider(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("update + remove roundtrip through localStorage", async () => {
    await mountProvider(
      <ServerProvider>
        <Editor />
      </ServerProvider>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "add-a" }).click();
    });
    expect(screen.getByTestId("names")).toHaveTextContent("A");

    await act(async () => {
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

  it("ignores invalid stored entries on load", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "ok-1", name: "Gut", baseUrl: "http://gut.local" },
        { id: 42, name: "Kaputt" },
        "nur-ein-string",
        null,
      ]),
    );
    await mountProvider(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("falls back to empty list on corrupt JSON", async () => {
    localStorage.setItem(STORAGE_KEY, "{kein-json");
    await mountProvider(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});

describe("credential vault", () => {
  beforeEach(() => {
    localStorage.clear();
    setVaultStorageForTests(null);
  });

  afterEach(() => {
    setVaultStorageForTests(null);
  });

  it("never writes a password into localStorage when a server is added", async () => {
    setVaultStorageForTests(vaultBackend());
    await mountProvider(
      <ServerProvider>
        <Adder
          input={{ name: "Heimserver", baseUrl: "http://heim.local", username: "u", password: "geheim" }}
        />
      </ServerProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "add" }).click();
    });

    await waitFor(async () => {
      const stored = readStoredServers();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ name: "Heimserver", username: "u" });
      expect(await readCredential(stored[0]?.id as string)).toBe("geheim");
    });
    // The persisted entry carries identity and endpoint only.
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("geheim");
    expect(readStoredServers()[0]).not.toHaveProperty("password");
  });

  it("keeps the stored credential when updating with a blank password", async () => {
    setVaultStorageForTests(vaultBackend());
    function UpdateFlow() {
      const { addServer, updateServer, servers } = useServers();
      return (
        <div>
          <button
            type="button"
            onClick={() =>
              void addServer({
                name: "Heimserver",
                baseUrl: "http://heim.local",
                username: "u",
                password: "geheim",
              })
            }
          >
            add
          </button>
          <button
            type="button"
            onClick={() => {
              const first = servers[0];
              if (first !== undefined) {
                void updateServer(first.id, {
                  name: "Neu",
                  baseUrl: "http://neu.local",
                  username: "u",
                  password: "",
                });
              }
            }}
          >
            update-blank
          </button>
          <button
            type="button"
            onClick={() => {
              const first = servers[0];
              if (first !== undefined) {
                void updateServer(first.id, {
                  name: "Neu",
                  baseUrl: "http://neu.local",
                  username: "u",
                  password: "neu-geheim",
                });
              }
            }}
          >
            update-new
          </button>
        </div>
      );
    }
    await mountProvider(
      <ServerProvider>
        <UpdateFlow />
      </ServerProvider>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "add" }).click();
    });
    await waitFor(async () => {
      expect(readStoredServers()).toHaveLength(1);
    });
    const id = readStoredServers()[0]?.["id"] as string;
    await waitFor(async () => {
      expect(await readCredential(id)).toBe("geheim");
    });

    // Blank keeps the stored secret; only the identity fields change.
    await act(async () => {
      screen.getByRole("button", { name: "update-blank" }).click();
    });
    expect(await readCredential(id)).toBe("geheim");
    expect(readStoredServers()[0]).toMatchObject({ name: "Neu" });

    // A non-blank password overwrites the stored credential.
    await act(async () => {
      screen.getByRole("button", { name: "update-new" }).click();
    });
    await waitFor(async () => {
      expect(await readCredential(id)).toBe("neu-geheim");
    });
  });

  it("migrates a plaintext password on load and wipes it from localStorage", async () => {
    setVaultStorageForTests(vaultBackend());
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "alt-1",
          name: "Alt",
          baseUrl: "http://alt.local",
          username: "u",
          password: "legacy-geheim",
        },
      ]),
    );

    await mountProvider(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );

    // The password-free state replaced the legacy entry (persisted on render).
    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).not.toContain("legacy-geheim");
    });
    const stored = readStoredServers();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: "alt-1",
      name: "Alt",
      baseUrl: "http://alt.local",
      username: "u",
    });
    expect(stored[0]).not.toHaveProperty("password");

    // …and the migration put the password into the vault instead.
    await waitFor(async () => {
      expect(await readCredential("alt-1")).toBe("legacy-geheim");
    });
  });

  it("survives a remount: the vault still holds the migrated password", async () => {
    const backend = vaultBackend();
    setVaultStorageForTests(backend);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "alt-1",
          name: "Alt",
          baseUrl: "http://alt.local",
          username: "u",
          password: "legacy-geheim",
        },
      ]),
    );
    const first = await mountProvider(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    await waitFor(async () => {
      expect(await readCredential("alt-1")).toBe("legacy-geheim");
    });
    first.unmount();

    // Only the vault survives the "reload"; localStorage is already wiped.
    await mountProvider(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(readStoredServers()[0]).not.toHaveProperty("password");
    expect(backend.rows.secrets.has("alt-1")).toBe(true);
  });

  it("reports the session-only fallback when no persistent vault is available", async () => {
    // jsdom has no IndexedDB, so autodetection lands in the fallback.
    await mountProvider(
      <ServerProvider>
        <Adder
          input={{ name: "Ohne Tresor", baseUrl: "http://x.local", username: "u", password: "p" }}
        />
      </ServerProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "add" }).click();
    });
    await waitFor(() => {
      expect(screen.getByTestId("storage")).toHaveTextContent("memory");
    });
  });

  it("reports the persistent vault when a working backend is available", async () => {
    setVaultStorageForTests(vaultBackend());
    await mountProvider(
      <ServerProvider>
        <StorageProbe />
      </ServerProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("mode")).toHaveTextContent("persistent");
    });
  });
});

describe("serverEventPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
    setVaultStorageForTests(null);
  });

  afterEach(() => {
    setVaultStorageForTests(null);
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

  it("defaults to on when no pref is stored", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "server-1", name: "Lokal", baseUrl: "http://lokal.local" }]),
    );
    await mountProvider(
      <ServerProvider>
        <ToggleProbe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("pref")).toHaveTextContent("true");
    expect(localStorage.getItem(SERVER_EVENT_PREFS_KEY)).toBe("{}");
  });

  it("flips the pref and persists it (roundtrip across remount)", async () => {
    const { unmount: unmountAdder } = await mountProvider(
      <ServerProvider>
        <Adder input={{ name: "Heimserver", baseUrl: "http://heim.local", username: "", password: "" }} />
      </ServerProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "add" }).click();
    });
    unmountAdder();

    const { unmount: unmountFirst } = await mountProvider(
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
    await mountProvider(
      <ServerProvider>
        <ToggleProbe />
      </ServerProvider>,
    );
    expect(screen.getByTestId("pref")).toHaveTextContent("false");
  });

  it("ignores non-boolean stored values on load", async () => {
    localStorage.setItem(SERVER_EVENT_PREFS_KEY, JSON.stringify({ "server-1": "nein" }));
    await mountProvider(
      <ServerProvider>
        <Probe />
      </ServerProvider>,
    );
    // The provider still mounts; the invalid entry is dropped on load.
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});
