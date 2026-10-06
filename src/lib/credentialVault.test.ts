import { afterEach, describe, expect, it } from "vitest";
import {
  adoptPlaintextCredentials,
  credentialRevision,
  cryptoAvailable,
  decryptText,
  encryptText,
  generateDek,
  initVault,
  migratePlaintextCredentials,
  plaintextMigrationResult,
  readCredential,
  removeCredential,
  setVaultStorageForTests,
  storeCredential,
  vaultMode,
  whenVaultReady,
  type EncryptedSecret,
  type VaultState,
  type VaultStorage,
} from "./credentialVault.ts";

/**
 * The vault. jsdom has no IndexedDB, so the persistent path is exercised with
 * an injected in-memory backend — the real IndexedDB implementation shares the
 * same `VaultStorage` contract.
 */
function newBackend(): VaultStorage & { rows: VaultState } {
  const state: VaultState = { key: null, secrets: new Map() };
  const clone = (): VaultState => ({ key: state.key, secrets: new Map(state.secrets) });
  return {
    rows: state,
    load: async () => clone(),
    save: async (next) => {
      state.key = next.key;
      state.secrets = new Map(next.secrets);
    },
    clear: async () => {
      state.key = null;
      state.secrets = new Map();
    },
  };
}

afterEach(() => {
  setVaultStorageForTests(null);
});

describe("crypto primitives", () => {
  it("has WebCrypto available (the vault hard requirement)", () => {
    expect(cryptoAvailable()).toBe(true);
  });

  it("creates a non-extractable AES-GCM key", async () => {
    const key = await generateDek();
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
  });

  it("round-trips a password through encrypt/decrypt", async () => {
    const key = await generateDek();
    const secret = await encryptText(key, "geheim-42");
    expect(await decryptText(key, secret)).toBe("geheim-42");
  });

  it("uses a fresh IV per entry, so equal plaintexts differ", async () => {
    const key = await generateDek();
    const first = await encryptText(key, "gleiches-passwort");
    const second = await encryptText(key, "gleiches-passwort");
    expect(Array.from(first.iv)).not.toEqual(Array.from(second.iv));
    expect(Array.from(first.ciphertext)).not.toEqual(Array.from(second.ciphertext));
    expect(await decryptText(key, first)).toBe("gleiches-passwort");
    expect(await decryptText(key, second)).toBe("gleiches-passwort");
  });

  it("does not leak the plaintext into the ciphertext", async () => {
    const key = await generateDek();
    const secret = await encryptText(key, "geheim-42");
    expect(new TextDecoder().decode(secret.ciphertext)).not.toContain("geheim-42");
  });

  it("refuses a tampered ciphertext", async () => {
    const key = await generateDek();
    const secret = await encryptText(key, "geheim-42");
    const tampered: EncryptedSecret = {
      iv: secret.iv,
      ciphertext: new Uint8Array([...secret.ciphertext].map((byte, index) => (index === 0 ? byte ^ 0xff : byte))),
    };
    await expect(decryptText(key, tampered)).rejects.toThrow();
  });

  it("refuses a ciphertext sealed with another key", async () => {
    const secret = await encryptText(await generateDek(), "geheim-42");
    await expect(decryptText(await generateDek(), secret)).rejects.toThrow();
  });
});

describe("persistent vault", () => {
  it("creates a DEK on first use and stores sealed secrets", async () => {
    const backend = newBackend();
    setVaultStorageForTests(backend);

    expect(await initVault()).toBe("persistent");
    // Nothing is written before a password exists — no wasted keygen.
    expect(backend.rows.key).toBeNull();
    expect(await readCredential("server-1")).toBe("");
    expect(backend.rows.key).toBeNull();

    expect(await storeCredential("server-1", "top-secret")).toBe("persistent");
    expect(backend.rows.key).not.toBeNull();
    expect(backend.rows.key?.extractable).toBe(false);
    expect(backend.rows.secrets.size).toBe(1);
    expect(await readCredential("server-1")).toBe("top-secret");

    // Only ciphertext + IV are persisted, never the plaintext.
    const stored = backend.rows.secrets.get("server-1");
    expect(stored).toBeDefined();
    expect(new TextDecoder().decode(stored?.ciphertext ?? new Uint8Array())).not.toContain(
      "top-secret",
    );
    expect(stored?.iv.byteLength).toBe(12);
  });

  it("survives a restart: a fresh module state reads the sealed password back", async () => {
    const backend = newBackend();
    setVaultStorageForTests(backend);
    await storeCredential("server-1", "top-secret");

    // Simulate a page reload: only the persisted backend stays.
    setVaultStorageForTests(backend);
    expect(vaultMode()).toBeNull();
    expect(await readCredential("server-1")).toBe("top-secret");
  });

  it("keeps one password per server and drops it on removal", async () => {
    setVaultStorageForTests(newBackend());
    await storeCredential("server-1", "eins");
    await storeCredential("server-2", "zwei");
    expect(await readCredential("server-1")).toBe("eins");
    expect(await readCredential("server-2")).toBe("zwei");

    await removeCredential("server-1");
    expect(await readCredential("server-1")).toBe("");
    expect(await readCredential("server-2")).toBe("zwei");
  });

  it("overwrites a changed password instead of keeping the old one", async () => {
    const backend = newBackend();
    setVaultStorageForTests(backend);
    await storeCredential("server-1", "alt");
    await storeCredential("server-1", "neu");

    setVaultStorageForTests(backend);
    expect(await readCredential("server-1")).toBe("neu");
    expect(backend.rows.secrets.size).toBe(1);
  });

  it("bumps the credential revision so consumers notice a new password", async () => {
    setVaultStorageForTests(newBackend());
    expect(credentialRevision("server-1")).toBe(0);
    await storeCredential("server-1", "a");
    const afterStore = credentialRevision("server-1");
    expect(afterStore).toBeGreaterThan(0);
    await removeCredential("server-1");
    expect(credentialRevision("server-1")).toBeGreaterThan(afterStore);
  });

  it("returns an empty password for a server without one", async () => {
    setVaultStorageForTests(newBackend());
    expect(await readCredential("unbekannt")).toBe("");
    await storeCredential("server-1", "");
    expect(await readCredential("server-1")).toBe("");
  });

  it("degrades to session-only when the backend throws", async () => {
    setVaultStorageForTests({
      load: async () => {
        throw new Error("IndexedDB kaputt");
      },
      save: async () => undefined,
      clear: async () => undefined,
    });
    expect(await initVault()).toBe("memory");
    expect(await storeCredential("server-1", "top-secret")).toBe("memory");
    expect(await readCredential("server-1")).toBe("top-secret");
  });

  it("degrades to session-only when a later write fails", async () => {
    const backend = newBackend();
    let saves = 0;
    setVaultStorageForTests({
      load: () => backend.load(),
      save: async (state) => {
        saves += 1;
        if (saves > 1) throw new Error("Quota exhausted");
        await backend.save(state);
      },
      clear: () => backend.clear(),
    });

    await storeCredential("server-1", "erste");
    expect(saves).toBe(1);

    // The second write (a changed password) fails: session-only from now on.
    expect(await storeCredential("server-1", "top-secret")).toBe("memory");
    expect(vaultMode()).toBe("memory");
    // The session copy keeps the server reachable; nothing new was persisted.
    expect(await readCredential("server-1")).toBe("top-secret");
    expect(backend.rows.secrets.size).toBe(1);
  });
});

describe("fallback without IndexedDB", () => {
  it("keeps credentials in memory only, never persisted", async () => {
    // jsdom has no IndexedDB, so autodetection lands in the fallback.
    expect(await initVault()).toBe("memory");
    expect(vaultMode()).toBe("memory");

    expect(await storeCredential("server-1", "nur-session")).toBe("memory");
    expect(await readCredential("server-1")).toBe("nur-session");

    // A reload drops the session copy: nothing was written anywhere.
    setVaultStorageForTests(null);
    expect(await readCredential("server-1")).toBe("");
  });
});

describe("plaintext migration", () => {
  it("hands every non-empty password to the vault and reports it", async () => {
    const stored: Array<[string, string]> = [];
    const result = await migratePlaintextCredentials(
      [
        { id: "server-1", password: "eins" },
        { id: "server-2", password: "" },
        { id: "", password: "ohne-id" },
        { id: "server-3", password: "drei" },
      ],
      async (id, password) => {
        stored.push([id, password]);
      },
    );
    expect(stored).toEqual([
      ["server-1", "eins"],
      ["server-3", "drei"],
    ]);
    expect(result).toEqual({ migrated: ["server-1", "server-3"], failed: [] });
  });

  it("collects failures instead of aborting the migration", async () => {
    const result = await migratePlaintextCredentials(
      [
        { id: "server-1", password: "eins" },
        { id: "server-2", password: "zwei" },
      ],
      async (id) => {
        if (id === "server-1") throw new Error("WebCrypto weigert sich");
      },
    );
    expect(result).toEqual({ migrated: ["server-2"], failed: ["server-1"] });
  });

  it("writes the migrated passwords into the real vault by default", async () => {
    const backend = newBackend();
    setVaultStorageForTests(backend);
    const result = await migratePlaintextCredentials([{ id: "server-1", password: "eins" }]);
    expect(result.migrated).toEqual(["server-1"]);
    expect(await readCredential("server-1")).toBe("eins");
    expect(new TextDecoder().decode(backend.rows.secrets.get("server-1")?.ciphertext ?? new Uint8Array()))
      .not.toContain("eins");
  });

  it("whenVaultReady resolves after the registered migration ran", async () => {
    const backend = newBackend();
    setVaultStorageForTests(backend);
    adoptPlaintextCredentials([{ id: "server-1", password: "aus-localstorage" }]);

    await whenVaultReady();
    expect(await plaintextMigrationResult()).toEqual({
      migrated: ["server-1"],
      failed: [],
    });
    expect(await readCredential("server-1")).toBe("aus-localstorage");
  });

  it("adopts the same plaintext entry only once per session", async () => {
    setVaultStorageForTests(newBackend());
    adoptPlaintextCredentials([{ id: "server-1", password: "einmal" }]);
    adoptPlaintextCredentials([{ id: "server-1", password: "zweimal" }]);
    await whenVaultReady();
    expect(await readCredential("server-1")).toBe("einmal");
  });
});