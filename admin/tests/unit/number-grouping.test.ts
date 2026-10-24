import { describe, expect, it } from "vitest";
import {
  displayCaret,
  groupDigits,
  parseLocalizedDecimal,
  rawCaret,
  stripGrouping,
  ungroupPasted,
} from "@/lib/number";

describe("groupDigits (VIS-007)", () => {
  it.each([
    ["1000", "1,000"],
    ["150000", "150,000"],
    ["1250000", "1,250,000"],
    ["1250.50", "1,250.50"],
    ["-1250000", "-1,250,000"],
    ["999", "999"],
    ["0.125", "0.125"],
    ["1250.", "1,250."],
    ["", ""],
  ])("shows %j as %j", (raw, shown) => {
    expect(groupDigits(raw)).toBe(shown);
  });

  it("leaves text that is not a plain number alone", () => {
    expect(groupDigits("12a34")).toBe("12a34");
    expect(groupDigits("1,5")).toBe("1,5");
  });

  it("never rounds or drops precision", () => {
    expect(stripGrouping(groupDigits("1234567.000001"))).toBe("1234567.000001");
  });
});

describe("ungroupPasted", () => {
  it.each([
    ["1,250,000", "1250000"],
    ["1250000", "1250000"],
    ["1,250.50", "1250.50"],
    ["١٬٢٥٠٬٠٠٠", "1250000"],
    ["١٢٥٠٫٥", "1250.5"],
    [" 2,000 ", "2000"],
  ])("accepts %j as %j", (pasted, raw) => {
    expect(ungroupPasted(pasted)).toBe(raw);
  });

  it.each(["1,5", "12,34", "1,2345", "1.250,50"])("keeps the ambiguous %j for validation", (pasted) => {
    expect(ungroupPasted(pasted)).toBeNull();
  });

  it("an ambiguous paste still fails validation instead of being guessed", () => {
    expect(parseLocalizedDecimal("1,5")).toEqual({ ok: false, error: "ambiguous_separator" });
  });
});

describe("caret mapping", () => {
  it("counts only raw characters before the caret", () => {
    expect(rawCaret("1,250,000", 5)).toBe(4); // after "1,250"
    expect(rawCaret("1,250,000", 0)).toBe(0);
  });

  it("puts the caret after the same raw character once regrouped", () => {
    // Typing "5" after "1,250" of "1,250,000" → raw "12505000", shown "12,505,000".
    expect(displayCaret("12,505,000", 5)).toBe(6);
    expect(displayCaret("1,000", 1)).toBe(1);
    expect(displayCaret("1,000", 4)).toBe(5);
    expect(displayCaret("1,000", 0)).toBe(0);
  });
});
