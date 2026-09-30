import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * Accounting periods. The API only has a row for a month once someone has
 * closed it; every other month is simply open. The list shows the recent
 * months either way, newest first, with their close history.
 * ------------------------------------------------------------------------- */

export type AccountingPeriod = components["schemas"]["AccountingPeriod"];

/**
 * One close of a period, nested in AccountingPeriod as `closes` (newest
 * first). Contract 8.1 declares the field but leaves `differences` rows
 * untyped; they compare a re-close with the close before it.
 */
export interface PeriodClose {
  sequence: number;
  created_at: string;
  closed_by: string;
  reason: string | null;
  /** Account balances that moved since the previous close of this month. */
  differences: Array<{ code: string; before: string; after: string }> | null;
}

export interface PeriodRow {
  month: string;
  status: "open" | "closed";
  closedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  closes: PeriodClose[];
}

/** "2026-09-01T00:00:00.000Z" → "2026-09". */
export function monthKey(value: string): string {
  return value.slice(0, 7);
}

/** The `count` months ending with the one containing `today` (YYYY-MM-DD). */
export function recentMonths(today: string, count = 12): string[] {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const months: string[] = [];
  for (let index = 0; index < count; index += 1) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return months;
}

export function periodRows(periods: readonly AccountingPeriod[], months: readonly string[]): PeriodRow[] {
  const byMonth = new Map(periods.map((period) => [monthKey(period.month), period]));
  const all = [...new Set([...months, ...byMonth.keys()])].sort().reverse();
  return all.map((month) => {
    const period = byMonth.get(month);
    const closes = ((period?.closes ?? []) as PeriodClose[]).slice();
    return {
      month,
      status: period?.status === "closed" ? "closed" : "open",
      closedAt: period?.closed_at ?? null,
      reopenedAt: period?.reopened_at ?? null,
      reopenReason: period?.reopen_reason ?? null,
      closes,
    };
  });
}

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The checklist items the API runs today, for translation. */
export const CHECK_KEYS = ["balanced_journals", "unposted_drafts", "posted_journals"] as const;
