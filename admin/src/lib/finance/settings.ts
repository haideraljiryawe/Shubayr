import type { components } from "@/types/api";
import { parseLocalizedDecimal, parseLocalizedNumber } from "@/lib/number";
import { decimalValue } from "./money";

/* ---------------------------------------------------------------------------
 * Store settings (GET/PUT /admin/settings), as a form.
 *
 * The API stores every setting as a string (or null) and validates almost
 * nothing about the values — unknown keys, weekdays and thresholds only — so
 * this module is where a value is checked before it is sent: numbers through
 * the localized parser (Arabic-Indic digits yes, ambiguous separators no),
 * times as HH:MM, the timezone against the platform's IANA list.
 * ------------------------------------------------------------------------- */

export type AdminSettings = components["schemas"]["AdminFinancialSettings"];
export type AdminSettingsPatch = components["schemas"]["AdminFinancialSettingsPatch"];

/** The keys PUT /admin/settings accepts (the backend's MANAGED_KEYS). */
export const TEXT_KEYS = ["store_name", "store_address", "store_phone", "timezone"] as const;
export const NUMBER_KEYS = [
  "delivery_fee",
  "acceptance_alert_timeout_minutes",
  "auto_cancel_timeout_minutes",
  "auto_cancel_warning_minutes",
  "default_low_stock_threshold",
  "backdating_window_days",
  "markup_alert_percent",
] as const;
export const THRESHOLD_KEYS = ["cost", "price", "quantity", "exchange_rate"] as const;

export type TextKey = (typeof TEXT_KEYS)[number];
export type NumberKey = (typeof NUMBER_KEYS)[number];
export type ThresholdKey = (typeof THRESHOLD_KEYS)[number];

/**
 * Weekdays as the API numbers them. The contract does not say which day 0
 * is; this follows the JavaScript / PostgreSQL convention (0 = Sunday) and
 * lists them from Saturday, the first working day in Iraq.
 */
export const WEEKDAY_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;

export interface HoursRow {
  weekday: number;
  opens_at: string;
  closes_at: string;
  is_closed: boolean;
}

export interface ClosedDay {
  date: string;
  reason: string;
}

/** Everything is kept as the text the person typed until it is saved. */
export interface SettingsForm {
  text: Record<TextKey, string>;
  numbers: Record<NumberKey, string>;
  autoCancel: boolean;
  hours: HoursRow[];
  closedDays: ClosedDay[];
  thresholds: Record<ThresholdKey, string>;
}

export function toForm(settings: AdminSettings): SettingsForm {
  const values = settings.settings ?? {};
  const text = Object.fromEntries(
    TEXT_KEYS.map((key) => [key, values[key] ?? ""]),
  ) as Record<TextKey, string>;
  const numbers = Object.fromEntries(
    NUMBER_KEYS.map((key) => [key, values[key] ?? ""]),
  ) as Record<NumberKey, string>;
  const byDay = new Map(
    (settings.business_hours ?? []).map((row) => [Number(row.weekday), row]),
  );
  const hours = WEEKDAY_ORDER.map((weekday) => {
    const row = byDay.get(weekday) ?? {};
    return {
      weekday,
      opens_at: String(row.opens_at ?? ""),
      closes_at: String(row.closes_at ?? ""),
      is_closed: Boolean(row.is_closed),
    };
  });
  const closedDays = (settings.closed_days ?? []).map((row) => ({
    date: String(row.date ?? "").slice(0, 10),
    reason: String(row.reason ?? ""),
  }));
  const raw = settings.protection_thresholds ?? {};
  const thresholds = Object.fromEntries(
    THRESHOLD_KEYS.map((key) => {
      const value = decimalValue((raw as Record<string, unknown>)[key]);
      return [key, value === null ? "" : String(value)];
    }),
  ) as Record<ThresholdKey, string>;
  return {
    text,
    numbers,
    autoCancel: values.auto_cancel_enabled === "true",
    hours,
    closedDays,
    thresholds,
  };
}

export type SettingsError =
  | "required"
  | "number"
  | "tooLong"
  | "phone"
  | "timezone"
  | "time"
  | "closesBeforeOpens"
  | "warningNotBeforeTimeout"
  | "duplicateDate"
  | "range";

/** Field path → error, e.g. `numbers.delivery_fee`, `hours.3.closes_at`. */
export type SettingsErrors = Record<string, SettingsError>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

interface NumberRule {
  integer?: boolean;
  min?: number;
  max?: number;
  maxDecimals?: number;
  required?: boolean;
}

function numberRules(form: SettingsForm, basePrecision: number): Record<NumberKey, NumberRule> {
  return {
    delivery_fee: { min: 0, maxDecimals: basePrecision, required: true },
    acceptance_alert_timeout_minutes: { integer: true, min: 1, max: 1440, required: true },
    auto_cancel_timeout_minutes: { integer: true, min: 1, max: 10080, required: form.autoCancel },
    auto_cancel_warning_minutes: { integer: true, min: 1, max: 10080, required: form.autoCancel },
    default_low_stock_threshold: { integer: true, min: 0, max: 1_000_000, required: true },
    backdating_window_days: { integer: true, min: 1, max: 3650, required: true },
    markup_alert_percent: { min: 0, max: 1000, maxDecimals: 2 },
  };
}

/** Parsed value of a number field, or null when empty / invalid. */
function parsed(text: string, rule: NumberRule): number | null {
  const result = parseLocalizedNumber(text, rule);
  return result.ok ? result.value : null;
}

export function validate(form: SettingsForm, basePrecision: number): SettingsErrors {
  const errors: SettingsErrors = {};
  if (!form.text.store_name.trim()) errors["text.store_name"] = "required";
  else if (form.text.store_name.length > 160) errors["text.store_name"] = "tooLong";
  if (form.text.store_address.length > 300) errors["text.store_address"] = "tooLong";
  const phone = form.text.store_phone.trim();
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) errors["text.store_phone"] = "phone";
  if (!isTimeZone(form.text.timezone.trim())) errors["text.timezone"] = "timezone";

  const rules = numberRules(form, basePrecision);
  for (const key of NUMBER_KEYS) {
    const result = parseLocalizedNumber(form.numbers[key], rules[key]);
    if (!result.ok) {
      errors[`numbers.${key}`] = result.error === "required" ? "required" : "number";
    }
  }
  if (form.autoCancel) {
    const timeout = parsed(form.numbers.auto_cancel_timeout_minutes, rules.auto_cancel_timeout_minutes);
    const warning = parsed(form.numbers.auto_cancel_warning_minutes, rules.auto_cancel_warning_minutes);
    if (timeout !== null && warning !== null && warning >= timeout) {
      errors["numbers.auto_cancel_warning_minutes"] = "warningNotBeforeTimeout";
    }
  }

  form.hours.forEach((row, index) => {
    if (row.is_closed) return;
    if (!TIME.test(row.opens_at)) errors[`hours.${index}.opens_at`] = "time";
    if (!TIME.test(row.closes_at)) errors[`hours.${index}.closes_at`] = "time";
    if (TIME.test(row.opens_at) && TIME.test(row.closes_at) && row.closes_at <= row.opens_at) {
      errors[`hours.${index}.closes_at`] = "closesBeforeOpens";
    }
  });

  const seen = new Set<string>();
  form.closedDays.forEach((day, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) errors[`closedDays.${index}.date`] = "required";
    else if (seen.has(day.date)) errors[`closedDays.${index}.date`] = "duplicateDate";
    seen.add(day.date);
    if (day.reason.length > 200) errors[`closedDays.${index}.reason`] = "tooLong";
  });

  for (const key of THRESHOLD_KEYS) {
    const result = parseLocalizedNumber(form.thresholds[key], {
      integer: true,
      min: 0,
      max: 100,
      required: true,
    });
    if (!result.ok) errors[`thresholds.${key}`] = result.error === "required" ? "required" : "range";
  }
  return errors;
}

/** Canonical stored text for a number field ("٥٠٠٠" → "5000", "" → null). */
function canonical(text: string): string | null {
  const result = parseLocalizedDecimal(text);
  return result.ok ? result.value : null;
}

/**
 * The PUT body: only what changed. Settings are compared as the API stores
 * them; hours and closed days are sent whole when anything in them moved
 * (closed days are replaced as a list by the API).
 */
export function buildPatch(before: SettingsForm, after: SettingsForm): AdminSettingsPatch {
  const patch: AdminSettingsPatch = {};
  const settings: Record<string, string | null> = {};
  for (const key of TEXT_KEYS) {
    const next = after.text[key].trim() || null;
    const prev = before.text[key].trim() || null;
    if (next !== prev) settings[key] = next;
  }
  for (const key of NUMBER_KEYS) {
    const next = canonical(after.numbers[key]);
    const prev = canonical(before.numbers[key]);
    if (next !== prev) settings[key] = next;
  }
  if (after.autoCancel !== before.autoCancel) {
    settings.auto_cancel_enabled = after.autoCancel ? "true" : "false";
  }
  if (Object.keys(settings).length) patch.settings = settings;

  const hours = (form: SettingsForm) =>
    form.hours.map((row) => ({
      weekday: row.weekday,
      opens_at: row.is_closed ? null : row.opens_at,
      closes_at: row.is_closed ? null : row.closes_at,
      is_closed: row.is_closed,
    }));
  if (JSON.stringify(hours(before)) !== JSON.stringify(hours(after))) {
    patch.business_hours = hours(after);
  }
  const days = (form: SettingsForm) =>
    form.closedDays.map((day) => ({ date: day.date, ...(day.reason.trim() ? { reason: day.reason.trim() } : {}) }));
  if (JSON.stringify(days(before)) !== JSON.stringify(days(after))) {
    patch.closed_days = days(after);
  }
  const thresholds: Record<string, number> = {};
  for (const key of THRESHOLD_KEYS) {
    if (after.thresholds[key] !== before.thresholds[key]) {
      const value = parsed(after.thresholds[key], { integer: true });
      if (value !== null) thresholds[key] = value;
    }
  }
  if (Object.keys(thresholds).length) patch.protection_thresholds = thresholds;
  return patch;
}

export function isEmptyPatch(patch: AdminSettingsPatch): boolean {
  return Object.keys(patch).length === 0;
}

/* ------------------------------------------------------------- history */

export interface SettingChange {
  field: string;
  before: string;
  after: string;
}

function flatten(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const root = (value ?? {}) as Record<string, unknown>;
  for (const [key, item] of Object.entries((root.settings as Record<string, unknown>) ?? {})) {
    out[`settings.${key}`] = item === null || item === undefined ? "" : String(item);
  }
  for (const row of (root.business_hours as Array<Record<string, unknown>>) ?? []) {
    const hours = row.is_closed ? "closed" : `${row.opens_at ?? ""}–${row.closes_at ?? ""}`;
    out[`business_hours.${row.weekday}`] = hours;
  }
  const days = ((root.closed_days as Array<Record<string, unknown>>) ?? [])
    .map((day) => String(day.date ?? "").slice(0, 10))
    .sort()
    .join(", ");
  out.closed_days = days;
  for (const [key, item] of Object.entries(
    (root.protection_thresholds as Record<string, unknown>) ?? {},
  )) {
    const value = decimalValue(item);
    out[`protection_thresholds.${key}`] = value === null ? "" : String(value);
  }
  return out;
}

/** What one settings.update audit record changed, field by field. */
export function settingChanges(before: unknown, after: unknown): SettingChange[] {
  const old = flatten(before);
  const next = flatten(after);
  const fields = [...new Set([...Object.keys(old), ...Object.keys(next)])].sort();
  return fields
    .filter((field) => (old[field] ?? "") !== (next[field] ?? ""))
    .map((field) => ({ field, before: old[field] ?? "", after: next[field] ?? "" }));
}
