import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_PROJECTS_STORAGE_KEY,
  loadShowEmptyProjects,
  useShowEmptyProjects,
} from "./useShowEmptyProjects.ts";

describe("loadShowEmptyProjects", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hides by default when nothing was stored", () => {
    expect(loadShowEmptyProjects()).toBe(false);
  });

  it('reads back an explicit "0" (the user turned the filter off)', () => {
    localStorage.setItem(EMPTY_PROJECTS_STORAGE_KEY, "0");
    expect(loadShowEmptyProjects()).toBe(true);
  });

  it("ignores a stored value that is not the off switch", () => {
    localStorage.setItem(EMPTY_PROJECTS_STORAGE_KEY, "quatsch");
    expect(loadShowEmptyProjects()).toBe(false);
  });

  it("falls back to hiding when storage cannot be read", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(loadShowEmptyProjects()).toBe(false);
    } finally {
      getItem.mockRestore();
    }
  });
});

describe("useShowEmptyProjects", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts hidden and persists that default", () => {
    const { result } = renderHook(() => useShowEmptyProjects());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(EMPTY_PROJECTS_STORAGE_KEY)).toBe("1");
  });

  it("starts from the persisted value", () => {
    localStorage.setItem(EMPTY_PROJECTS_STORAGE_KEY, "0");
    const { result } = renderHook(() => useShowEmptyProjects());
    expect(result.current[0]).toBe(true);
  });

  it("persists every change so a reload keeps the choice", () => {
    const { result, unmount } = renderHook(() => useShowEmptyProjects());

    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(EMPTY_PROJECTS_STORAGE_KEY)).toBe("0");

    unmount();
    // A fresh mount is what a reload does: the choice is read back.
    const reloaded = renderHook(() => useShowEmptyProjects());
    expect(reloaded.result.current[0]).toBe(true);
  });

  it("keeps working when storage cannot be written", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    try {
      const { result } = renderHook(() => useShowEmptyProjects());
      act(() => {
        result.current[1](true);
      });
      // The toggle stays usable; only the persistence is lost.
      expect(result.current[0]).toBe(true);
    } finally {
      setItem.mockRestore();
    }
  });
});
