import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatRate,
  isPositive,
  per100ToPer1,
  roundDecimal,
} from "@/lib/finance/money";
import { parseLocalizedDecimal } from "@/lib/number";

describe("roundDecimal — exact, half away from zero", () => {
  it.each([
    ["1450000.0000", 0, "1450000"],
    ["12.5", 2, "12.50"],
    ["12.345", 2, "12.35"],
    ["12.344", 2, "12.34"],
    ["999.995", 2, "1000.00"],
    ["-0.004", 2, "0.00"],
    ["-2.5", 0, "-3"],
    ["0.1", 0, "0"],
  ])("%s @%i → %s", (value, precision, expected) => {
    expect(roundDecimal(value, precision)).toBe(expected);
  });

  it("never goes through a float", () => {
    // 0.1 + 0.2 territory, and more digits than a double holds.
    expect(roundDecimal("123456789012345678.125", 2)).toBe("123456789012345678.13");
  });
});

describe("formatAmount", () => {
  it("groups Latin digits and always names the currency", () => {
    expect(formatAmount("1450000.0000", "IQD", 0)).toBe("1,450,000 IQD");
    expect(formatAmount("12.5", "USD", 2)).toBe("12.50 USD");
    expect(formatAmount(-5000, "IQD", 0)).toBe("-5,000 IQD");
    expect(formatAmount("1450000", "IQD", 0, "ar")).toMatch(/^1.450.000 IQD$/);
    expect(formatAmount(null, "IQD", 0)).toBe("—");
  });
});

describe("per100ToPer1 — the rate screen's per-100 option", () => {
  it.each([
    ["145000", "1450"],
    ["145050", "1450.5"],
    ["1450.5", "14.505"],
    ["100", "1"],
    ["1", "0.01"],
    ["0.5", "0.005"],
    ["000145000", "1450"],
  ])("%s per 100 → %s per 1", (per100, per1) => {
    expect(per100ToPer1(per100)).toBe(per1);
  });
});

describe("isPositive — zero and negative rates are refused", () => {
  it.each([
    ["1450", true],
    ["0.0001", true],
    ["0", false],
    ["0.000", false],
    ["-1450", false],
  ])("%s → %s", (value, expected) => {
    expect(isPositive(value)).toBe(expected);
  });
});

describe("parseLocalizedDecimal", () => {
  it("returns exact strings from Arabic-Indic, Persian and Latin digits", () => {
    expect(parseLocalizedDecimal("١٤٥٠")).toEqual({ ok: true, value: "1450" });
    expect(parseLocalizedDecimal("۱۴۵۰٫۲۵")).toEqual({ ok: true, value: "1450.25" });
    expect(parseLocalizedDecimal("007.50")).toEqual({ ok: true, value: "7.50" });
    expect(parseLocalizedDecimal("")).toEqual({ ok: true, value: null });
  });

  it("refuses ambiguous separators and negatives", () => {
    expect(parseLocalizedDecimal("1,450")).toEqual({ ok: false, error: "ambiguous_separator" });
    expect(parseLocalizedDecimal("1.450.5")).toEqual({ ok: false, error: "ambiguous_separator" });
    expect(parseLocalizedDecimal("-5")).toEqual({ ok: false, error: "negative" });
    expect(parseLocalizedDecimal("1.123", { maxDecimals: 2 })).toEqual({
      ok: false,
      error: "too_many_decimals",
    });
  });
});

describe("formatRate — the direction is always written out", () => {
  it.each([
    ["1450", "1 USD = 1,450 IQD"],
    ["1450.0000000000", "1 USD = 1,450 IQD"],
    ["1450.5", "1 USD = 1,450.5 IQD"],
    ["14.505", "1 USD = 14.505 IQD"],
    ["0.0001234567", "1 USD = 0.0001234567 IQD"],
  ])("%s → %s", (rate, expected) => {
    expect(formatRate("USD", "IQD", rate)).toBe(expected);
  });
});
