import { parseLocalizedNumber } from "@/lib/number";

/* ---------------------------------------------------------------------------
 * Per-order purchase limit (NOTE-011, contract 17.7.0). One maximum for the
 * whole product: the sum of every variant and every cart/order line of it in
 * one order. The API enforces it at cart and checkout; the editor only sets
 * it. A suggestion of 10 is filled in when the switch is turned on with no
 * value — a convenience of this form, never a server default.
 * ------------------------------------------------------------------------- */

export const SUGGESTED_LIMIT = "10";
/** The API stores the maximum with precision 0.001. */
export const LIMIT_DECIMALS = 3;

export interface PurchaseLimitDraft {
  enabled: boolean;
  max: string;
}

interface Limited {
  purchase_limit_enabled?: boolean;
  purchase_limit_max_quantity?: number | null;
}

export function limitDraft(product: Limited | null | undefined): PurchaseLimitDraft {
  const max = product?.purchase_limit_max_quantity;
  return { enabled: product?.purchase_limit_enabled ?? false, max: max === null || max === undefined ? "" : String(max) };
}

/** Turning it on prefills the suggestion only when there is no value yet; turning it off keeps the value. */
export function switchLimit(draft: PurchaseLimitDraft, enabled: boolean): PurchaseLimitDraft {
  return { enabled, max: enabled && !draft.max.trim() ? SUGGESTED_LIMIT : draft.max };
}

export type LimitProblem = "required" | "invalid" | "positive" | "precision" | "wholeUnits";

/** The quantity the editor typed (Arabic digits and comma accepted), or null when it isn't a number. */
export function limitValue(draft: PurchaseLimitDraft): number | null {
  const parsed = parseLocalizedNumber(draft.max, { allowNegative: true });
  return parsed.ok ? parsed.value : null;
}

export function validateLimit(draft: PurchaseLimitDraft, { wholeUnitsOnly }: { wholeUnitsOnly: boolean }): LimitProblem | null {
  if (!draft.enabled) return null;
  if (!draft.max.trim()) return "required";
  const value = limitValue(draft);
  if (value === null) return "invalid";
  if (value <= 0) return "positive";
  const parsed = parseLocalizedNumber(draft.max, { maxDecimals: LIMIT_DECIMALS });
  if (!parsed.ok) return "precision";
  // Every SKU sells whole units only: a fractional maximum could never be reached exactly.
  if (wholeUnitsOnly && !Number.isInteger(value)) return "wholeUnits";
  return null;
}

/** What the product body carries: the switch, and the maximum when it is on. */
export function limitBody(draft: PurchaseLimitDraft): { purchase_limit_enabled: boolean; purchase_limit_max_quantity?: number } {
  if (!draft.enabled) return { purchase_limit_enabled: false };
  return { purchase_limit_enabled: true, purchase_limit_max_quantity: limitValue(draft) ?? undefined };
}

/** Only what changed on an edit. */
export function limitPatch(original: Limited, draft: PurchaseLimitDraft): ReturnType<typeof limitBody> | Record<string, never> {
  const before = limitDraft(original);
  if (before.enabled === draft.enabled && (!draft.enabled || limitValue(before) === limitValue(draft))) return {};
  return limitBody(draft);
}
