/* ---------------------------------------------------------------------------
 * Exact money and rates for the finance screens.
 *
 * The API sends amounts as exact decimal strings (ExactDecimal) and expects
 * them back the same way. Nothing here converts to a float: rounding for
 * display, the per-100 → per-1 rate conversion and comparisons all work on
 * the digits, so what is shown is exactly what the ledger holds.
 * ------------------------------------------------------------------------- */

export type Decimal = string | number;

/** Split "-1234.5600" into sign, integer digits and fraction digits. */
function parts(value: Decimal): { negative: boolean; integer: string; fraction: string } {
  const text = typeof value === "number" ? numberToPlain(value) : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { negative: false, integer: "0", fraction: "" };
  }
  const negative = text.startsWith("-");
  const [integer, fraction = ""] = text.replace(/^-/, "").split(".");
  return {
    negative,
    integer: integer.replace(/^0+(?=\d)/, ""),
    fraction,
  };
}

/** A JS number as plain digits (no exponent) — only for numbers the API sent. */
function numberToPlain(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
}

/** Add one unit in the last place to a digit string ("199" → "200"). */
function incrementDigits(digits: string): string {
  const chars = digits.split("");
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    if (chars[index] === "9") {
      chars[index] = "0";
    } else {
      chars[index] = String(Number(chars[index]) + 1);
      return chars.join("");
    }
  }
  return `1${chars.join("")}`;
}

/** Round half away from zero to `precision` fraction digits, exactly. */
export function roundDecimal(value: Decimal, precision: number): string {
  const { negative, integer, fraction } = parts(value);
  const padded = fraction.padEnd(precision + 1, "0");
  let digits = integer + padded.slice(0, precision);
  if (Number(padded[precision] ?? "0") >= 5) digits = incrementDigits(digits);
  const whole = digits.slice(0, digits.length - precision) || "0";
  const frac = precision > 0 ? digits.slice(digits.length - precision) : "";
  const result = frac ? `${whole}.${frac}` : whole;
  const isZero = /^0(\.0*)?$/.test(result);
  return negative && !isZero ? `-${result}` : result;
}

/**
 * "1450000" + IQD(0) → "1,450,000 IQD"; "12.5" + USD(2) → "12.50 USD".
 * Latin digits in both locales, grouped for reading. The code is always
 * shown: two currencies live side by side on these screens.
 */
export function formatAmount(
  value: Decimal | null | undefined,
  currency: string,
  precision: number,
  locale = "en",
): string {
  if (value === null || value === undefined || value === "") return "—";
  const rounded = roundDecimal(value, precision);
  const negative = rounded.startsWith("-");
  const [integer, fraction] = rounded.replace(/^-/, "").split(".");
  const grouped = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    numberingSystem: "latn",
    useGrouping: true,
  }).format(BigInt(integer));
  const number = fraction ? `${grouped}.${fraction}` : grouped;
  return `${negative ? "-" : ""}${number} ${currency}`;
}

/** True when the decimal is strictly greater than zero. */
export function isPositive(value: Decimal): boolean {
  const { negative, integer, fraction } = parts(value);
  return !negative && /[1-9]/.test(integer + fraction);
}

/**
 * A rate entered "per 100 units" as the per-1 value, exactly: the decimal
 * point moves two places ("145000" → "1450", "1450.5" → "14.505").
 */
export function per100ToPer1(value: string): string {
  const { integer, fraction } = parts(value);
  const digits = (integer + fraction).replace(/^0+(?=\d)/, "");
  const scale = fraction.length + 2;
  const padded = digits.padStart(scale + 1, "0");
  const whole = padded.slice(0, padded.length - scale).replace(/^0+(?=\d)/, "");
  const frac = padded.slice(padded.length - scale).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Fraction digits in a decimal string ("1.2500" → 4). */
export function decimalPlaces(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

/**
 * A number from the API that may arrive as a decimal.js object.
 *
 * API 7.0 serialises `protection_thresholds` values as the internals of a
 * Prisma Decimal (`{"s":1,"e":1,"d":[50]}`) instead of the integers its
 * contract promises. This rebuilds the value from sign, exponent and base-1e7
 * limbs, and passes plain numbers and numeric strings through.
 */
export function decimalValue(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (raw && typeof raw === "object") {
    const { s, e, d } = raw as { s?: unknown; e?: unknown; d?: unknown };
    if (
      (s === 1 || s === -1) &&
      typeof e === "number" &&
      Array.isArray(d) &&
      d.every((limb) => typeof limb === "number")
    ) {
      const limbs = d as number[];
      const digits =
        String(limbs[0] ?? 0) +
        limbs
          .slice(1)
          .map((limb) => String(limb).padStart(7, "0"))
          .join("");
      const value = Number(`${digits.slice(0, 1)}.${digits.slice(1) || "0"}e${e}`);
      return Number.isFinite(value) ? s * value : null;
    }
  }
  return null;
}

/**
 * An exchange rate written with its direction: "1 USD = 1,450 IQD". Every
 * digit the rate has is kept (up to the 10 the API allows); only trailing
 * zeros of the fraction go.
 */
export function formatRate(
  code: string,
  base: string,
  rate: Decimal,
  locale = "en",
): string {
  const text = typeof rate === "number" ? numberToPlain(rate) : rate;
  const [integer, rawFraction = ""] = roundDecimal(text, Math.min(decimalPlaces(text), 10)).split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  const grouped = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    numberingSystem: "latn",
  }).format(BigInt(integer || "0"));
  return `1 ${code} = ${fraction ? `${grouped}.${fraction}` : grouped} ${base}`;
}
