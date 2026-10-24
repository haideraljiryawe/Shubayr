/* ---------------------------------------------------------------------------
 * The home page's one performance period (VIS-003): today, this month to
 * date, or a custom range — all in the store's business dates (the API's
 * `business_date`, Asia/Baghdad), never the browser's clock. The period only
 * frames the performance figures; the needs-attention cards keep their own
 * windows (late now, payables due in the next seven days).
 * ------------------------------------------------------------------------- */

export type HomePeriodKind = "today" | "month" | "custom";

export interface HomePeriod {
  kind: HomePeriodKind;
  from: string;
  to: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: string | undefined): value is string {
  if (!value || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The period the URL asks for, against today's business date. Anything
 * unreadable — an unknown kind, a malformed or reversed custom range, a range
 * ending in the future — falls back to today rather than failing the page.
 */
export function resolveHomePeriod(
  query: { period?: string; from?: string; to?: string },
  businessDate: string,
): HomePeriod {
  if (query.period === "month") {
    return { kind: "month", from: `${businessDate.slice(0, 8)}01`, to: businessDate };
  }
  if (query.period === "custom" && isDate(query.from) && isDate(query.to) && query.from <= query.to && query.to <= businessDate) {
    return { kind: "custom", from: query.from, to: query.to };
  }
  return { kind: "today", from: businessDate, to: businessDate };
}

/** The home URL for a period (custom keeps its dates). */
export function homePeriodHref(period: HomePeriod): string {
  if (period.kind === "today") return "/";
  if (period.kind === "month") return "/?period=month";
  return `/?period=custom&from=${period.from}&to=${period.to}`;
}
