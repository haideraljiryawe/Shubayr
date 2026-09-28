"use client";

import { useFormatter } from "next-intl";
import { STORE_TIME_ZONE } from "./config";

/* ---------------------------------------------------------------------------
 * Calendar days and times in the store's timezone, not the browser's.
 *
 * A monitor reading orders from a laptop set to another zone must still see
 * "today" mean the store's today — the server reads date_from/date_to as
 * store-timezone days, so the client computes them the same way.
 * ------------------------------------------------------------------------- */

/** YYYY-MM-DD for an instant, in the store's timezone. */
export function storeDay(at: Date = new Date()): string {
  // en-CA formats dates as ISO YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Move a YYYY-MM-DD day by whole days (pure calendar arithmetic). */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  return shifted.toISOString().slice(0, 10);
}

/** Date and time of an instant, printed in the store's timezone. */
export function useStoreDateTime(): (iso: string | null | undefined) => string {
  const format = useFormatter();
  return (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return format.dateTime(date, {
      timeZone: STORE_TIME_ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      numberingSystem: "latn",
    });
  };
}
