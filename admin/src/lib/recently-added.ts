import { ApiError } from "@/lib/api/errors";
import { normalizeDigits } from "@/lib/number";
import type { AdminSettings } from "@/lib/store-info";

/* ---------------------------------------------------------------------------
 * Recently Added (NOTE-004, contract 17.7.0): the home-page row of new
 * products. Three settings, stored as strings through PUT /admin/settings
 * (settings.manage):
 *   recently_added_enabled      "true" | "false"           (default false)
 *   recently_added_max_count    whole number 1–50          (default 10)
 *   recently_added_window_days  whole number 1–365         (default 30)
 * The server does the rest: a rolling window on each product's creation time,
 * only active, published, visible and in-stock products, newest first.
 * ------------------------------------------------------------------------- */

export const MAX_COUNT_BOUNDS = { min: 1, max: 50, fallback: 10 } as const;
export const WINDOW_BOUNDS = { min: 1, max: 365, fallback: 30 } as const;

export interface RecentlyAddedForm {
  enabled: boolean;
  maxCount: string;
  windowDays: string;
}

export type RecentlyAddedField = "enabled" | "maxCount" | "windowDays";
export type RecentlyAddedProblem = "required" | "wholeNumber" | "minimum" | "maximum" | "invalid";

const KEYS: Record<RecentlyAddedField, string> = {
  enabled: "recently_added_enabled",
  maxCount: "recently_added_max_count",
  windowDays: "recently_added_window_days",
};

export function toRecentlyAddedForm(settings: AdminSettings): RecentlyAddedForm {
  const values = (settings.settings ?? {}) as Record<string, string | null | undefined>;
  return {
    enabled: values.recently_added_enabled === "true",
    maxCount: values.recently_added_max_count ?? String(MAX_COUNT_BOUNDS.fallback),
    windowDays: values.recently_added_window_days ?? String(WINDOW_BOUNDS.fallback),
  };
}

const clean = (value: string) => normalizeDigits(value.trim());

function bounded(value: string, bounds: { min: number; max: number }): RecentlyAddedProblem | null {
  const text = clean(value);
  if (!text) return "required";
  if (!/^\d+$/.test(text)) return "wholeNumber";
  const number = Number(text);
  if (number < bounds.min) return "minimum";
  if (number > bounds.max) return "maximum";
  return null;
}

/** The API's bounds, checked before sending; the count and window are kept even while switched off. */
export function validateRecentlyAdded(form: RecentlyAddedForm): Partial<Record<RecentlyAddedField, RecentlyAddedProblem>> {
  const problems: Partial<Record<RecentlyAddedField, RecentlyAddedProblem>> = {};
  const count = bounded(form.maxCount, MAX_COUNT_BOUNDS);
  const window = bounded(form.windowDays, WINDOW_BOUNDS);
  if (count) problems.maxCount = count;
  if (window) problems.windowDays = window;
  return problems;
}

/** Only what changed, as the strings the API stores; null when nothing did. */
export function recentlyAddedPatch(before: RecentlyAddedForm, after: RecentlyAddedForm): { settings: Record<string, string> } | null {
  const settings: Record<string, string> = {};
  if (before.enabled !== after.enabled) settings[KEYS.enabled] = String(after.enabled);
  if (clean(before.maxCount) !== clean(after.maxCount)) settings[KEYS.maxCount] = String(Number(clean(after.maxCount)));
  if (clean(before.windowDays) !== clean(after.windowDays)) settings[KEYS.windowDays] = String(Number(clean(after.windowDays)));
  return Object.keys(settings).length ? { settings } : null;
}

const API_CODES: Record<string, RecentlyAddedProblem> = {
  required: "required",
  positive_integer: "wholeNumber",
  maximum: "maximum",
  boolean: "invalid",
};

/** A 422's field errors on these three settings, by field. */
export function recentlyAddedApiProblems(error: unknown): Partial<Record<RecentlyAddedField, RecentlyAddedProblem>> {
  const problems: Partial<Record<RecentlyAddedField, RecentlyAddedProblem>> = {};
  if (!(error instanceof ApiError)) return problems;
  for (const entry of error.errors) {
    const key = entry.field.replace(/^settings\./, "");
    const field = (Object.keys(KEYS) as RecentlyAddedField[]).find((name) => KEYS[name] === key);
    if (field) problems[field] ??= API_CODES[entry.code] ?? "invalid";
  }
  return problems;
}
