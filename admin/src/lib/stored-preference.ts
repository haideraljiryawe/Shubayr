"use client";

import { useCallback, useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
 * A small per-browser preference (which sidebar groups are open, a hidden
 * setup strip) kept in localStorage. Reading goes through
 * useSyncExternalStore, so the server render and the first client render use
 * the fallback and the stored value follows without a mismatch. Storage that
 * is blocked or full simply means the preference is not remembered.
 * ------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The stored string for `key` ("" before hydration and when unset), and a setter. */
export function useStoredPreference(key: string, serverValue = ""): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key) ?? "",
    () => serverValue,
  );
  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Not remembered; the change still applies for this visit below.
      }
      memory.set(key, next);
      for (const listener of listeners) listener();
    },
    [key],
  );
  return [memory.get(key) ?? value, set];
}

/** Values set during this visit, for when storage is unavailable. */
const memory = new Map<string, string>();
