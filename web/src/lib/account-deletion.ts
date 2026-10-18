import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * Why DELETE /me/account refused (409 ACCOUNT_DELETION_BLOCKED).
 *
 * Since contract 17.2 the refusal carries the counts as data, in `details`
 * (`open_orders`, `pending_returns`, `unsettled_amounts`). Those are read
 * first. The English field-error messages ("2 open order(s) remain") are only
 * a fallback, for an API that answers without `details`.
 * ------------------------------------------------------------------------- */

export const ACCOUNT_DELETION_REASONS = ["OPEN_ORDERS", "PENDING_RETURNS", "UNSETTLED_AMOUNTS"] as const;
export type AccountDeletionReason = (typeof ACCOUNT_DELETION_REASONS)[number];

export type AccountDeletionCounts = components["schemas"]["AccountDeletionBlockedError"]["details"];

export interface DeletionRefusal {
  reason: AccountDeletionReason | "other";
  count: number;
}

const DETAIL_KEY: Record<AccountDeletionReason, keyof AccountDeletionCounts> = {
  OPEN_ORDERS: "open_orders",
  PENDING_RETURNS: "pending_returns",
  UNSETTLED_AMOUNTS: "unsettled_amounts",
};

/** The structured counts, when the refusal carries them in the contract's shape; else null. */
export function accountDeletionCounts(details: unknown): AccountDeletionCounts | null {
  if (!details || typeof details !== "object") return null;
  const raw = details as Record<string, unknown>;
  const counts = {} as AccountDeletionCounts;
  for (const key of Object.values(DETAIL_KEY)) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
    counts[key] = value;
  }
  return counts;
}

/**
 * One line per reason. With `details`, every reason whose count is above
 * zero — even one the field errors left out. Without, the field errors and
 * the number at the start of each message (0 when there is none).
 */
export function deletionRefusals(error: {
  errors: ReadonlyArray<{ code: string; message?: string | null }>;
  details?: unknown;
}): DeletionRefusal[] {
  const counts = accountDeletionCounts(error.details);
  if (counts) {
    const known = ACCOUNT_DELETION_REASONS.filter((reason) => counts[DETAIL_KEY[reason]] > 0).map((reason) => ({
      reason,
      count: counts[DETAIL_KEY[reason]],
    }));
    const unknown = error.errors.some((entry) => !(ACCOUNT_DELETION_REASONS as readonly string[]).includes(entry.code));
    const refusals: DeletionRefusal[] = unknown ? [...known, { reason: "other", count: 0 }] : known;
    return refusals.length ? refusals : [{ reason: "other", count: 0 }];
  }
  const refusals = error.errors.map((entry) => ({
    reason: (ACCOUNT_DELETION_REASONS as readonly string[]).includes(entry.code)
      ? (entry.code as AccountDeletionReason)
      : ("other" as const),
    count: Number(/^\s*(\d+)/.exec(entry.message ?? "")?.[1] ?? 0),
  }));
  return refusals.length ? refusals : [{ reason: "other", count: 0 }];
}
