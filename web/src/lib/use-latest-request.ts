"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
 * Fetch-as-the-filters-change, where only the newest answer may land.
 *
 * Two guards, because either alone leaves a gap:
 *
 *  1. Every change aborts the request the previous filters started, so a
 *     burst of keystrokes costs the server one live query, not ten.
 *  2. Every response is checked against a sequence number before it is
 *     applied. An abort only helps while the request is still in flight — a
 *     response that already arrived and is being parsed cannot be recalled —
 *     so without this an older, slower answer could still overwrite a newer
 *     one.
 *
 * While the next answer is on its way the previous one stays on screen
 * (`stale` is true), so the list dims rather than blanking on every filter.
 * ------------------------------------------------------------------------- */

export interface LatestRequest<T> {
  data: T | null;
  /** True until the first answer — success or failure — for any key. */
  loading: boolean;
  /** Showing an answer for older filters while the current ones load. */
  stale: boolean;
  failed: boolean;
  reload: () => void;
}

export function useLatestRequest<T>(
  /** Identifies the filters; a new key starts a new request. */
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  { enabled = true }: { enabled?: boolean } = {},
): LatestRequest<T> {
  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    failed: boolean;
  }>({ key: null, data: null, failed: false });
  const [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const ticket = ++sequence.current;
    load(controller.signal).then(
      (data) => {
        if (ticket === sequence.current) setState({ key, data, failed: false });
      },
      () => {
        // An aborted request was superseded on purpose; it is not a failure.
        if (ticket !== sequence.current || controller.signal.aborted) return;
        setState((current) => ({ ...current, key, failed: true }));
      },
    );
    return () => controller.abort();
    // `load` is a fresh closure every render; `key` is what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, enabled]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    data: state.data,
    loading: state.data === null && !state.failed,
    stale: enabled && state.data !== null && state.key !== key,
    failed: state.failed && state.key === key,
    reload,
  };
}
