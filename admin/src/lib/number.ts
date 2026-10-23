/* ---------------------------------------------------------------------------
 * Numbers typed by people who switch keyboards.
 *
 * Staff type Arabic-Indic digits (٠١٢…), Persian/Urdu digits (۰۱۲…) or Latin
 * digits, often in the same shift. All three are accepted. What is NOT
 * accepted is anything whose meaning depends on the reader's convention:
 * "1,500" is fifteen hundred in Baghdad and one-and-a-half in much of Europe,
 * so a comma (Latin, Arabic «،» or the Arabic thousands mark «٬») is refused
 * outright, as is more than one decimal mark. A wrong price is worse than a
 * form that asks again.
 * ------------------------------------------------------------------------- */

export type NumberParseError =
  | "required"
  | "invalid"
  | "ambiguous_separator"
  | "not_integer"
  | "too_many_decimals"
  | "negative"
  | "below_min"
  | "above_max";

export type NumberParseResult =
  { ok: true; value: number | null } | { ok: false; error: NumberParseError };

export interface NumberParseOptions {
  required?: boolean;
  integer?: boolean;
  /** Maximum fractional digits (money is 2). */
  maxDecimals?: number;
  allowNegative?: boolean;
  min?: number;
  max?: number;
}

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/** Map ٠-٩ and ۰-۹ to 0-9; every other character is left as it is. */
export function normalizeDigits(input: string): string {
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (
      code >= EXTENDED_ARABIC_INDIC_ZERO &&
      code <= EXTENDED_ARABIC_INDIC_ZERO + 9
    ) {
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    } else {
      out += char;
    }
  }
  return out;
}

/** Thousands marks and commas: never guessed at. */
const AMBIGUOUS = /[,،٬’'  ]/;
/** Decimal marks: Latin point and the Arabic decimal separator «٫». */
const DECIMAL = /[.٫]/g;

export function parseLocalizedNumber(
  raw: string,
  options: NumberParseOptions = {},
): NumberParseResult {
  // Strip bidi control marks a copy from an RTL document can carry.
  const trimmed = raw.replace(/[‎‏؜]/g, "").trim();
  if (trimmed === "") {
    return options.required
      ? { ok: false, error: "required" }
      : { ok: true, value: null };
  }

  const normalized = normalizeDigits(trimmed).replace(/^−/, "-");
  if (AMBIGUOUS.test(normalized))
    return { ok: false, error: "ambiguous_separator" };
  const decimals = normalized.match(DECIMAL)?.length ?? 0;
  if (decimals > 1) return { ok: false, error: "ambiguous_separator" };

  const latin = normalized.replace(DECIMAL, ".");
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(latin))
    return { ok: false, error: "invalid" };

  const negative = latin.startsWith("-");
  if (negative && !options.allowNegative)
    return { ok: false, error: "negative" };

  const fraction = latin.split(".")[1] ?? "";
  if (options.integer && fraction.length > 0)
    return { ok: false, error: "not_integer" };
  if (
    options.maxDecimals !== undefined &&
    fraction.length > options.maxDecimals
  ) {
    return { ok: false, error: "too_many_decimals" };
  }

  const value = Number(latin);
  if (!Number.isFinite(value)) return { ok: false, error: "invalid" };
  if (options.min !== undefined && value < options.min)
    return { ok: false, error: "below_min" };
  if (options.max !== undefined && value > options.max)
    return { ok: false, error: "above_max" };
  return { ok: true, value };
}

export type DecimalParseResult =
  { ok: true; value: string | null } | { ok: false; error: NumberParseError };

/**
 * The same rules as parseLocalizedNumber, but the result is the canonical
 * decimal STRING ("1450.25"), never a float. Money and exchange rates go to
 * the API as exact strings, so 0.1 + 0.2 never happens on the way. Leading
 * zeros are dropped ("007" → "7", ".5" → "0.5"); trailing fractional zeros
 * are kept, because "1.50" and "1.5" may mean different precisions.
 */
export function parseLocalizedDecimal(
  raw: string,
  options: NumberParseOptions = {},
): DecimalParseResult {
  const checked = parseLocalizedNumber(raw, options);
  if (!checked.ok) return checked;
  if (checked.value === null) return { ok: true, value: null };
  const latin = normalizeDigits(raw.replace(/[‎‏؜]/g, "").trim())
    .replace(/^−/, "-")
    .replace(/[.٫]/, ".");
  const negative = latin.startsWith("-");
  const [whole, fraction] = latin.replace(/^-/, "").split(".");
  const integer = (whole ?? "").replace(/^0+(?=\d)/, "") || "0";
  const text = fraction !== undefined ? `${integer}.${fraction}` : integer;
  return { ok: true, value: negative ? `-${text}` : text };
}

/* ---------------------------------------------------------------------------
 * Thousands grouping for amount and quantity fields (VIS-007).
 *
 * The field SHOWS "1,250,000" but the form only ever receives the raw text
 * "1250000", so nothing downstream parses a comma. The grouping marks are
 * ours: a comma the person types is ignored, and a pasted comma is accepted
 * only where it sits on a real thousands boundary ("1,250,000"). Anything
 * else ("1,5") is kept verbatim so parseLocalizedNumber still refuses it as
 * ambiguous — the rule above still holds, the field just stops guessing.
 * Never use this for phone numbers, SKUs, barcodes or codes.
 * ------------------------------------------------------------------------- */

/** Every mark a person might use to group thousands. */
const GROUP_MARKS = /[,،٬]/g;

/** Latin digits and point: Arabic-Indic/Persian digits and «٫» normalized. */
export function normalizeAmountText(text: string): string {
  return normalizeDigits(text.replace(/[‎‏؜]/g, "")).replace(/٫/g, ".").replace(/^−/, "-");
}

/** "1234567.50" → "1,234,567.50"; text that is not a plain number is returned unchanged. */
export function groupDigits(raw: string): string {
  const match = /^(-?)(\d+)(\.\d*)?$/.exec(raw);
  if (!match) return raw;
  const [, sign, whole, fraction = ""] = match;
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction}`;
}

/**
 * Pasted or dropped text → raw text. Grouping marks are removed only when
 * every one of them sits on a thousands boundary of the whole part; returns
 * null when they do not, so the caller keeps the text as typed.
 */
export function ungroupPasted(text: string): string | null {
  const normalized = normalizeAmountText(text).trim();
  if (!/[,،٬]/.test(normalized)) return normalized;
  if (/^-?\d{1,3}([,،٬]\d{3})+(\.\d*)?$/.test(normalized)) {
    return normalized.replace(GROUP_MARKS, "");
  }
  return null;
}

/** Strip the grouping this field inserted itself. */
export function stripGrouping(text: string): string {
  return normalizeAmountText(text).replace(GROUP_MARKS, "");
}

/** How many raw characters (everything but grouping marks) precede `caret`. */
export function rawCaret(text: string, caret: number): number {
  return text.slice(0, caret).replace(GROUP_MARKS, "").length;
}

/** The position in grouped `display` that follows `rawIndex` raw characters. */
export function displayCaret(display: string, rawIndex: number): number {
  if (rawIndex <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < display.length; i += 1) {
    if (!/[,،٬]/.test(display[i])) seen += 1;
    if (seen === rawIndex) return i + 1;
  }
  return display.length;
}
