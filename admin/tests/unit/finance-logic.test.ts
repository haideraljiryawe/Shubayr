import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  isClosedPeriod,
  isUnknownOutcome,
  resolveOutcome,
  type OperationOutcome,
} from "@/lib/finance/operations";
import { periodRows, recentMonths, type AccountingPeriod } from "@/lib/finance/periods";
import {
  buildPatch,
  isEmptyPatch,
  settingChanges,
  toForm,
  validate,
  type AdminSettings,
} from "@/lib/finance/settings";

const SETTINGS: AdminSettings = {
  settings: {
    store_name: "Shubayr",
    timezone: "Asia/Baghdad",
    delivery_fee: "5000",
    acceptance_alert_timeout_minutes: "15",
    auto_cancel_enabled: "false",
    auto_cancel_timeout_minutes: null,
    auto_cancel_warning_minutes: null,
    default_low_stock_threshold: "5",
    backdating_window_days: "90",
    markup_alert_percent: null,
  },
  business_hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    opens_at: "09:00",
    closes_at: "17:00",
    is_closed: weekday === 5,
  })),
  closed_days: [],
  // Exactly as API 7.0 serialises them (decimal.js internals).
  protection_thresholds: {
    cost: { s: 1, e: 1, d: [50] },
    price: { s: 1, e: 1, d: [50] },
    quantity: { s: 1, e: 1, d: [50] },
    exchange_rate: { s: 1, e: 1, d: [50] },
  },
};

describe("settings form", () => {
  it("reads the API shape, thresholds included", () => {
    const form = toForm(SETTINGS);
    expect(form.thresholds.cost).toBe("50");
    expect(form.hours.map((row) => row.weekday)).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect(form.hours.find((row) => row.weekday === 5)?.is_closed).toBe(true);
    expect(validate(form, 0)).toEqual({});
  });

  it("validates numbers with the localized rules, by field", () => {
    const form = toForm(SETTINGS);
    form.numbers.delivery_fee = "5,000";
    form.numbers.backdating_window_days = "٩٠";
    form.numbers.acceptance_alert_timeout_minutes = "";
    form.text.timezone = "Mars/Olympus";
    expect(validate(form, 0)).toEqual({
      "numbers.delivery_fee": "number",
      "numbers.acceptance_alert_timeout_minutes": "required",
      "text.timezone": "timezone",
    });
  });

  it("auto-cancel needs its own timeout and an earlier warning", () => {
    const form = toForm(SETTINGS);
    form.autoCancel = true;
    expect(validate(form, 0)).toMatchObject({
      "numbers.auto_cancel_timeout_minutes": "required",
      "numbers.auto_cancel_warning_minutes": "required",
    });
    form.numbers.auto_cancel_timeout_minutes = "60";
    form.numbers.auto_cancel_warning_minutes = "60";
    expect(validate(form, 0)).toEqual({
      "numbers.auto_cancel_warning_minutes": "warningNotBeforeTimeout",
    });
  });

  it("sale rounding (contract 8.0) is a whole number and optional", () => {
    const form = toForm(SETTINGS);
    expect(form.numbers.sale_rounding_multiple).toBe("");
    form.numbers.sale_rounding_multiple = "250.5";
    expect(validate(form, 0)).toEqual({ "numbers.sale_rounding_multiple": "number" });
    form.numbers.sale_rounding_multiple = "٢٥٠";
    expect(validate(form, 0)).toEqual({});
    expect(buildPatch(toForm(SETTINGS), form).settings).toEqual({ sale_rounding_multiple: "250" });
  });

  it("checks business hours and closed days", () => {
    const form = toForm(SETTINGS);
    form.hours[0].closes_at = "08:00";
    form.hours[1].opens_at = "9";
    form.closedDays = [
      { date: "2026-10-01", reason: "" },
      { date: "2026-10-01", reason: "" },
    ];
    expect(validate(form, 0)).toEqual({
      "hours.0.closes_at": "closesBeforeOpens",
      "hours.1.opens_at": "time",
      "closedDays.1.date": "duplicateDate",
    });
  });

  it("sends only what changed, numbers canonicalised", () => {
    const before = toForm(SETTINGS);
    const after = toForm(SETTINGS);
    expect(isEmptyPatch(buildPatch(before, after))).toBe(true);
    after.numbers.delivery_fee = "٦٠٠٠";
    after.autoCancel = true;
    after.thresholds.cost = "25";
    expect(buildPatch(before, after)).toEqual({
      settings: { delivery_fee: "6000", auto_cancel_enabled: "true" },
      protection_thresholds: { cost: 25 },
    });
    after.closedDays = [{ date: "2026-10-03", reason: " Holiday " }];
    expect(buildPatch(before, after).closed_days).toEqual([
      { date: "2026-10-03", reason: "Holiday" },
    ]);
  });

  it("describes an audit record as old → new per field", () => {
    const after = structuredClone(SETTINGS);
    after.settings.delivery_fee = "6000";
    after.protection_thresholds = { ...after.protection_thresholds, cost: 25 };
    expect(settingChanges(SETTINGS, after)).toEqual([
      { field: "protection_thresholds.cost", before: "50", after: "25" },
      { field: "settings.delivery_fee", before: "5000", after: "6000" },
    ]);
  });
});

describe("periods", () => {
  it("lists recent months newest first, open unless the API says closed", () => {
    expect(recentMonths("2026-02-10", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
    const periods: AccountingPeriod[] = [
      { month: "2026-01-01T00:00:00.000Z", status: "closed", closed_at: "2026-02-01T10:00:00Z" },
      { month: "2025-06-01T00:00:00.000Z", status: "open", reopen_reason: "Late invoice" },
    ];
    const rows = periodRows(periods, recentMonths("2026-02-10", 3));
    expect(rows.map((row) => `${row.month}:${row.status}`)).toEqual([
      "2026-02:open",
      "2026-01:closed",
      "2025-12:open",
      "2025-06:open",
    ]);
    expect(rows[3].reopenReason).toBe("Late invoice");
  });
});

describe("operations — posting exactly once", () => {
  const document = { id: "d", document_number: "CT-000001" };
  const outcome = (patch: Partial<OperationOutcome>): OperationOutcome =>
    ({ status: "completed", response_status: 201, response: document, ...patch }) as OperationOutcome;

  it("resolves a lost answer from the operation record", () => {
    expect(resolveOutcome(outcome({}))).toEqual({ kind: "posted", document });
    expect(resolveOutcome(outcome({ status: "processing" }))).toEqual({ kind: "processing" });
    expect(resolveOutcome(new ApiError(404, "Operation not found"))).toEqual({ kind: "notPosted" });
    expect(resolveOutcome(outcome({ response_status: 409, response: null }))).toEqual({
      kind: "failed",
      status: 409,
    });
  });

  it("knows which failures leave the outcome unknown", () => {
    expect(isUnknownOutcome(new ApiError(0, "Network error"))).toBe(true);
    expect(isUnknownOutcome(new ApiError(504, "Gateway timeout"))).toBe(true);
    expect(isUnknownOutcome(new ApiError(422, "Amount must be positive"))).toBe(false);
    expect(isUnknownOutcome(new ApiError(409, "The accounting period is closed"))).toBe(false);
  });

  it("recognises the closed-period refusal", () => {
    expect(isClosedPeriod(new ApiError(409, "The accounting period is closed"))).toBe(true);
    expect(isClosedPeriod(new ApiError(409, "Cash account is inactive"))).toBe(false);
  });
});
