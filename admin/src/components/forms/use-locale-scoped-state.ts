"use client";

import { useCallback, useState, type SetStateAction } from "react";
import { useLocale } from "next-intl";

/**
 * `useState` for a message a form worded itself (a client-side check's
 * "choose a file", "amount too large"): switching the language keeps the
 * page's state (the admin only refreshes), so a message set in the old
 * language would stay in it. This hook drops a value set under another
 * locale and reads as `initial` instead (NOTE-012); the next check words it
 * again in the new language.
 */
export function useLocaleScopedState<T>(initial: T): [T, (next: SetStateAction<T>) => void] {
  const locale = useLocale();
  const [initialValue] = useState(initial);
  const [state, setState] = useState<{ value: T; locale: string }>({ value: initial, locale });

  const value = state.locale === locale ? state.value : initialValue;
  const set = useCallback(
    (next: SetStateAction<T>) =>
      setState((current) => {
        const previous = current.locale === locale ? current.value : initialValue;
        return { value: typeof next === "function" ? (next as (previous: T) => T)(previous) : next, locale };
      }),
    [locale, initialValue],
  );
  return [value, set];
}
