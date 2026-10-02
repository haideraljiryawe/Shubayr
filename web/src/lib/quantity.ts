/* ---------------------------------------------------------------------------
 * Quantities by SKU unit.
 *
 * Catalog v2 stores quantities as exact decimals in each SKU's base unit. A
 * piece SKU (`whole_units_only`) takes whole numbers; a SKU sold by weight or
 * volume takes up to three decimals (2.5 kg, 0.75 l). The API refuses a
 * fraction of a piece with 422 SKU_WHOLE_UNITS_ONLY, so the storefront refuses
 * it first, next to the field, rather than after the request.
 * ------------------------------------------------------------------------- */

/** The contract's per-line ceiling (Cart item `maximum: 99`). */
export const MAX_LINE_QUANTITY = 99;

/** Fraction digits a weight or volume SKU accepts. */
export const QUANTITY_DECIMALS = 3;

export interface QuantityRule {
  /** True for pieces: whole numbers only. */
  wholeUnitsOnly: boolean;
  /** The SKU's base unit as the API names it ("piece", "kg", "l"…). */
  baseUnit: string;
}

export const PIECE_RULE: QuantityRule = {
  wholeUnitsOnly: true,
  baseUnit: "piece",
};

export function quantityRule(
  variant?: { whole_units_only?: boolean; base_unit?: string } | null,
): QuantityRule {
  if (!variant) return PIECE_RULE;
  const baseUnit = variant.base_unit?.trim() || "piece";
  return {
    // The backend's default: a piece is whole-only unless it says otherwise.
    wholeUnitsOnly: variant.whole_units_only ?? baseUnit === "piece",
    baseUnit,
  };
}

/** The smallest quantity a line may hold. */
export function minQuantity(rule: QuantityRule): number {
  return rule.wholeUnitsOnly ? 1 : 1 / 10 ** QUANTITY_DECIMALS;
}

export type QuantityError =
  | "required"
  | "invalid"
  | "wholeOnly"
  | "tooManyDecimals"
  | "belowMin"
  | "aboveMax";

export type QuantityParse =
  | { ok: true; value: number }
  | { ok: false; error: QuantityError };

/** ٠-٩ and ۰-۹ to 0-9, the Arabic decimal mark «٫» to "."; nothing else. */
function normalize(raw: string): string {
  let out = "";
  for (const char of raw.replace(/[‎‏؜]/g, "").trim()) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x660 && code <= 0x669) out += String(code - 0x660);
    else if (code >= 0x6f0 && code <= 0x6f9) out += String(code - 0x6f0);
    else if (char === "٫") out += ".";
    else out += char;
  }
  return out;
}

/**
 * Read a typed quantity for a SKU. Commas are refused rather than guessed at
 * — "1,5" is one-and-a-half to some shoppers and fifteen to others.
 */
export function parseQuantity(
  raw: string,
  rule: QuantityRule,
  max: number = MAX_LINE_QUANTITY,
): QuantityParse {
  const text = normalize(raw);
  if (!text) return { ok: false, error: "required" };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return { ok: false, error: "invalid" };

  const fraction = (text.split(".")[1] ?? "").replace(/0+$/, "");
  if (rule.wholeUnitsOnly && fraction.length > 0) {
    return { ok: false, error: "wholeOnly" };
  }
  if (fraction.length > QUANTITY_DECIMALS) {
    return { ok: false, error: "tooManyDecimals" };
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, error: "invalid" };
  if (value < minQuantity(rule)) return { ok: false, error: "belowMin" };
  if (value > Math.min(max, MAX_LINE_QUANTITY)) {
    return { ok: false, error: "aboveMax" };
  }
  return { ok: true, value: roundQuantity(value) };
}

/** Exact to three places: 0.1 + 0.2 must never become 0.30000000000000004. */
export function roundQuantity(value: number): number {
  return Math.round(value * 10 ** QUANTITY_DECIMALS) / 10 ** QUANTITY_DECIMALS;
}

/**
 * How many "items" a line adds to a count badge. A piece line counts its
 * pieces; 1.5 kg of rice is one item, not one and a half.
 */
export function lineUnits(quantity: number): number {
  return Number.isInteger(quantity) ? quantity : 1;
}

/** Base units with their own translation under `units.*`; others show raw. */
export const KNOWN_UNITS = ["piece", "kg", "g", "l", "ml", "m", "cm"] as const;

export function isKnownUnit(unit: string): unit is (typeof KNOWN_UNITS)[number] {
  return (KNOWN_UNITS as readonly string[]).includes(unit);
}
