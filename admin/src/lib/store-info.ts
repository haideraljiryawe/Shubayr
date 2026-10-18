import type { components } from "@/types/api";
import { ApiError } from "@/lib/api/errors";
import { normalizeDigits } from "@/lib/number";
import { isE164, toE164 } from "@/lib/phone";

/* ---------------------------------------------------------------------------
 * Store info (Settings → Store info): the legal, contact and policy details
 * the store and the apps show publicly (GET /settings, contract 17.2). They
 * are saved through PUT /admin/settings (settings.manage) as strings or null;
 * a field left empty is cleared to null and the store then hides that line.
 *
 * The checks mirror the API's (settings-validation.ts) so a mistake shows
 * next to its field before anything is sent; the API's own field errors are
 * mapped back to the same fields by their code.
 * ------------------------------------------------------------------------- */

export type AdminSettings = components["schemas"]["AdminFinancialSettings"];

export const STORE_INFO_KEYS = [
  "store_legal_name_ar",
  "store_legal_name_en",
  "store_address_ar",
  "store_address_en",
  "support_phone",
  "support_whatsapp",
  "support_email",
  "privacy_email",
  "support_hours_ar",
  "support_hours_en",
  "return_window_days",
  "refund_days",
  "policy_effective_date",
] as const;

export type StoreInfoKey = (typeof STORE_INFO_KEYS)[number];
export type StoreInfoForm = Record<StoreInfoKey, string>;

/** Longest text the API stores per field. */
export const MAX_LENGTH: Partial<Record<StoreInfoKey, number>> = {
  store_legal_name_ar: 160,
  store_legal_name_en: 160,
  store_address_ar: 500,
  store_address_en: 500,
  support_hours_ar: 500,
  support_hours_en: 500,
  support_email: 254,
  privacy_email: 254,
};

const PHONES: readonly StoreInfoKey[] = ["support_phone", "support_whatsapp"];
const EMAILS: readonly StoreInfoKey[] = ["support_email", "privacy_email"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type StoreInfoProblem =
  | "required"
  | "maxLength"
  | "phone"
  | "email"
  | "positiveInteger"
  | "nonNegativeInteger"
  | "date"
  | "invalid";

export function toStoreInfoForm(settings: AdminSettings): StoreInfoForm {
  const values = (settings.settings ?? {}) as Record<string, string | null | undefined>;
  return Object.fromEntries(STORE_INFO_KEYS.map((key) => [key, values[key] ?? ""])) as StoreInfoForm;
}

/** A real calendar date, not just the YYYY-MM-DD shape ("2026-02-30" is not one). */
function isCalendarDate(value: string): boolean {
  if (!DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The value as it will be stored: trimmed, Latin digits, phones in E.164; "" when empty. */
export function storedValue(key: StoreInfoKey, raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (PHONES.includes(key)) return toE164(value);
  if (key === "return_window_days" || key === "refund_days" || key === "policy_effective_date") return normalizeDigits(value);
  return value;
}

export function validateStoreInfo(form: StoreInfoForm): Partial<Record<StoreInfoKey, StoreInfoProblem>> {
  const problems: Partial<Record<StoreInfoKey, StoreInfoProblem>> = {};
  for (const key of STORE_INFO_KEYS) {
    const value = storedValue(key, form[key]);
    const max = MAX_LENGTH[key];
    if (key === "return_window_days") {
      // The server's own return-window rule: it can be changed, never cleared.
      if (!value) problems[key] = "required";
      else if (!/^\d+$/.test(value) || Number(value) < 1) problems[key] = "positiveInteger";
      continue;
    }
    if (!value) continue;
    if (max !== undefined && value.length > max) problems[key] = "maxLength";
    else if (PHONES.includes(key) && !isE164(value)) problems[key] = "phone";
    else if (EMAILS.includes(key) && !EMAIL.test(value)) problems[key] = "email";
    else if (key === "refund_days" && !/^\d+$/.test(value)) problems[key] = "nonNegativeInteger";
    else if (key === "policy_effective_date" && !isCalendarDate(value)) problems[key] = "date";
  }
  return problems;
}

/** Only what changed; an emptied field is sent as null (the store then hides it). */
export function storeInfoPatch(before: StoreInfoForm, after: StoreInfoForm): { settings: Record<string, string | null> } | null {
  const settings: Record<string, string | null> = {};
  for (const key of STORE_INFO_KEYS) {
    const next = storedValue(key, after[key]);
    const prev = storedValue(key, before[key]);
    if (next !== prev) settings[key] = next === "" ? null : next;
  }
  return Object.keys(settings).length ? { settings } : null;
}

/** The API's field-error codes (settings-validation.ts), as this form's problems. */
const API_CODES: Record<string, StoreInfoProblem> = {
  required: "required",
  not_empty: "required",
  max_length: "maxLength",
  e164: "phone",
  email: "email",
  positive_integer: "positiveInteger",
  non_negative_integer: "nonNegativeInteger",
  date: "date",
};

/** A 422's field errors on these settings, by field; unknown codes read as "invalid". */
export function storeInfoApiProblems(error: unknown): Partial<Record<StoreInfoKey, StoreInfoProblem>> {
  const problems: Partial<Record<StoreInfoKey, StoreInfoProblem>> = {};
  if (!(error instanceof ApiError)) return problems;
  for (const entry of error.errors) {
    const key = entry.field.replace(/^settings\./, "") as StoreInfoKey;
    if (!(STORE_INFO_KEYS as readonly string[]).includes(key)) continue;
    problems[key] ??= API_CODES[entry.code] ?? "invalid";
  }
  return problems;
}
