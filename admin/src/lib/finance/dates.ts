import { STORE_TIME_ZONE } from "@/lib/store-time";

/** YYYY-MM-DD of an instant in the store's timezone (default: now). */
export function storeDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** "2026-09-29T10:30" for a datetime-local input, in the store's timezone. */
export function storeDateTimeLocal(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * A datetime-local value read as store time → ISO instant. Asia/Baghdad has
 * no daylight saving, so the offset is fixed at +03:00.
 */
export function storeLocalToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const instant = new Date(`${value}:00+03:00`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/**
 * Match the API's rate cutoff for a document date: now for today's or a
 * future document, and the close of the Baghdad day for a historical one.
 */
export function exchangeRateCutoff(day: string, postedAt: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const dayEnd = new Date(`${day}T23:59:59.999+03:00`);
  if (Number.isNaN(dayEnd.getTime()) || storeDay(dayEnd) !== day) return null;
  return (day < storeDay(postedAt) ? dayEnd : postedAt).toISOString();
}
