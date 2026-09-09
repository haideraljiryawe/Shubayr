"use client";

import { useCallback, useEffect, useState } from "react";

/* ---------------------------------------------------------------------------
 * Read-one-thing-from-the-API hook.
 *
 * The account pages all do the same three things: fetch on mount, show a
 * skeleton until it lands, offer a retry when it does not. Doing that inline
 * meant five copies of the same effect — and each one set state synchronously
 * inside the effect body, which the React Compiler rightly flags as a cascading
 * render. Here the state only ever moves in the promise continuation.
 * ------------------------------------------------------------------------- */

export interface Resource<T> {
  data: T | null;
  /** True until the first result — success or failure — has arrived. */
  loading: boolean;
  failed: boolean;
  /** Refetch, e.g. from a retry button or after a write. */
  reload: () => void;
}

export function useResource<T>(
  load: () => Promise<T>,
  /** Values the fetch depends on; changing one refetches. */
  deps: readonly unknown[],
): Resource<T> {
  const [state, setState] = useState<{ data: T | null; failed: boolean }>({
    data: null,
    failed: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (data) => {
        if (active) setState({ data, failed: false });
      },
      () => {
        if (active) setState({ data: null, failed: true });
      },
    );
    return () => {
      // A result that arrives after the inputs changed is stale, not current.
      active = false;
    };
    // `load` is a fresh closure on every render, so depending on it would
    // refetch forever; the caller's `deps` describe what the fetch actually
    // reads, and `attempt` is what a retry bumps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => {
    setState({ data: null, failed: false });
    setAttempt((current) => current + 1);
  }, []);

  return {
    data: state.data,
    loading: state.data === null && !state.failed,
    failed: state.failed,
    reload,
  };
}
