import "@testing-library/jest-dom/vitest";
import { i18n } from "@lingui/core";

// Unit tests never render <I18nProvider>: activate the source locale with an
// empty catalog so macro `t` calls fall back to their German source messages.
if (i18n.locale === undefined || i18n.locale === "") {
  i18n.load("de", {});
  i18n.activate("de");
}

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true });
}
