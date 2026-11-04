/**
 * Iraqi phone numbers as people really enter them — one rule for sign-in,
 * the checkout address and the address book.
 *
 * What arrives in the field is rarely just "07701234567":
 * - iOS autofill and keyboard suggestions wrap or sprinkle the number with
 *   invisible bidi/format characters (U+200E, U+202A…U+202E, U+2066…U+2069,
 *   U+FEFF — the Unicode `Cf` category);
 * - many customers type Arabic-Indic (٠-٩) or Persian (۰-۹) digits;
 * - it comes grouped with spaces, NBSPs, dashes, dots or brackets;
 * - and in any of 07…, 7… (10 digits), +964 7…, 964 7… or 00964 7….
 *
 * All of these become the national form 07XXXXXXXXX, and E.164
 * (+9647XXXXXXXXX) for the API. Iraq only (NOTE-007 is undecided): anything
 * else is not an Iraqi mobile number.
 */

const FORMAT_CHARACTERS = /\p{Cf}/gu;
const SEPARATORS = /[\s\-.()]/gu;

/** ٠-٩ (U+0660…) and ۰-۹ (U+06F0…) to 0-9. */
export function foldDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/**
 * What the customer should see while typing: Latin digits, no invisible
 * characters. Their own grouping (spaces, dashes) is left alone.
 */
export function cleanPhoneTyping(value: string): string {
  return foldDigits(value.replace(FORMAT_CHARACTERS, ""));
}

/** Digits (and a leading +) only. */
function compact(value: string): string {
  return cleanPhoneTyping(value).replace(SEPARATORS, "");
}

const NATIONAL = /^07\d{9}$/;
const INTERNATIONAL = /^(?:\+|00)?964(0?7\d{9})$/;
const NO_TRUNK_ZERO = /^7\d{9}$/;

/**
 * The national form 07XXXXXXXXX of an Iraqi mobile number in any of the ways
 * above, or null when it is not one.
 */
export function iraqiMobile(value: string): string | null {
  const digits = compact(value);
  if (NATIONAL.test(digits)) return digits;
  if (NO_TRUNK_ZERO.test(digits)) return `0${digits}`;
  const international = digits.match(INTERNATIONAL);
  if (international) {
    const rest = international[1];
    return rest.startsWith("0") ? rest : `0${rest}`;
  }
  return null;
}

/** 07XXXXXXXXX → +9647XXXXXXXXX. */
export function nationalToE164(national: string): string {
  return `+964${national.slice(1)}`;
}

/** E.164 of an Iraqi mobile number, or null when it is not one. */
export function iraqiMobileE164(value: string): string | null {
  const national = iraqiMobile(value);
  return national ? nationalToE164(national) : null;
}

/**
 * The E.164 form of what was typed, as best it can be read: an Iraqi mobile
 * number by the rules above; otherwise a number written internationally
 * (+… or 00…) is kept as it is. Bare digits are never given a country.
 */
export function phoneToE164(value: string): string {
  const iraqi = iraqiMobileE164(value);
  if (iraqi) return iraqi;
  const digits = compact(value).replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return digits;
}

/**
 * The contract's own `contact_phone` pattern, enforced server-side since
 * v5.3.0: a leading +, a non-zero country digit, then 7-14 more digits.
 */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * An address's contact number for the API, or null when it can't be one: an
 * Iraqi mobile number in any of the ways above, or — as the address forms
 * have always taken — a number written internationally (+… or 00…) that the
 * server's E.164 rule accepts. Bare digits that are not an Iraqi mobile
 * number are refused rather than guessed ("7701234567" is +964, never +7).
 */
export function contactPhoneE164(value: string): string | null {
  const iraqi = iraqiMobileE164(value);
  if (iraqi) return iraqi;
  const digits = compact(value);
  if (!digits.startsWith("+") && !digits.startsWith("00")) return null;
  const e164 = phoneToE164(value);
  return E164_PATTERN.test(e164) ? e164 : null;
}

/** An OTP code as typed: Arabic/Persian digits folded, everything else dropped. */
export function cleanOtpCode(value: string, length: number): string {
  return cleanPhoneTyping(value).replace(/\D/g, "").slice(0, length);
}

/**
 * Cleans a field in place while the customer types, keeping the caret where
 * it was (relative to the characters that stay) instead of letting React jump
 * it to the end. Returns the cleaned value for state.
 */
export function cleanFieldInPlace(input: HTMLInputElement, clean: (value: string) => string): string {
  const raw = input.value;
  const next = clean(raw);
  if (next !== raw) {
    const caret = input.selectionStart ?? raw.length;
    const at = clean(raw.slice(0, caret)).length;
    input.value = next;
    try {
      input.setSelectionRange(at, at);
    } catch {
      // Not every input type supports selection; the value is what matters.
    }
  }
  return next;
}
