"use client";

import { useFormatter } from "next-intl";

/** The store's timezone (the contract's Asia/Baghdad; not in /settings yet). */
export const STORE_TIME_ZONE = "Asia/Baghdad";

/** Date and time of an instant, in the store's timezone, Latin digits. */
export function useStoreDateTime(): (iso: string | null | undefined) => string {
  const format = useFormatter();
  return (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return format.dateTime(date, {
      timeZone: STORE_TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
      numberingSystem: "latn",
    });
  };
}
