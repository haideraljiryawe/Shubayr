import { describe, expect, it } from "vitest";
import { normalizeDigits, parseLocalizedNumber } from "@/lib/number";

describe("normalizeDigits", () => {
  it("maps Arabic-Indic and Persian digits to Latin", () => {
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normalizeDigits("a1٢۳")).toBe("a123");
  });
});

describe("parseLocalizedNumber", () => {
  it.each([
    ["1500", 1500],
    ["١٥٠٠", 1500],
    ["۱۵۰۰", 1500],
    ["12.5", 12.5],
    ["١٢٫٥", 12.5],
    ["١٢.٥", 12.5],
    [" 7 ", 7],
    [".5", 0.5],
    ["‏٤٢", 42],
  ])("accepts %j as %d", (input, value) => {
    expect(parseLocalizedNumber(input)).toEqual({ ok: true, value });
  });

  it.each([
    "1,500",
    "1٬500",
    "1،5",
    "1'000",
    "1 000".replace(" ", " "),
    "1.2.3",
    "1٫2.3",
  ])("refuses the ambiguous %j", (input) => {
    expect(parseLocalizedNumber(input)).toEqual({
      ok: false,
      error: "ambiguous_separator",
    });
  });

  it.each(["abc", "1e5", "--1", "1-", "٥ ٥", "+"])(
    "refuses the malformed %j",
    (input) => {
      expect(parseLocalizedNumber(input)).toEqual({
        ok: false,
        error: "invalid",
      });
    },
  );

  it("treats empty text as no value unless required", () => {
    expect(parseLocalizedNumber("  ")).toEqual({ ok: true, value: null });
    expect(parseLocalizedNumber("", { required: true })).toEqual({
      ok: false,
      error: "required",
    });
  });

  it("enforces integers, decimals, sign and bounds", () => {
    expect(parseLocalizedNumber("2.5", { integer: true })).toEqual({
      ok: false,
      error: "not_integer",
    });
    expect(parseLocalizedNumber("1.234", { maxDecimals: 2 })).toEqual({
      ok: false,
      error: "too_many_decimals",
    });
    expect(parseLocalizedNumber("1.23", { maxDecimals: 2 })).toEqual({
      ok: true,
      value: 1.23,
    });
    expect(parseLocalizedNumber("-3")).toEqual({
      ok: false,
      error: "negative",
    });
    expect(parseLocalizedNumber("−3", { allowNegative: true })).toEqual({
      ok: true,
      value: -3,
    });
    expect(parseLocalizedNumber("0", { min: 1 })).toEqual({
      ok: false,
      error: "below_min",
    });
    expect(parseLocalizedNumber("٩", { max: 5 })).toEqual({
      ok: false,
      error: "above_max",
    });
  });
});
