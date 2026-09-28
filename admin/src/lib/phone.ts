import { normalizeDigits } from "./number";

/** The contract's phone pattern. */
export const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Staff type Iraqi numbers the way they are written locally ("0770 123 4567",
 * often in Arabic digits); the API wants E.164 ("+9647701234567"). Anything
 * that is not recognisably local is passed through for the API to judge.
 */
export function toE164(input: string): string {
  const compact = normalizeDigits(input).replace(/[\s\-().‎‏]/g, "");
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (/^07\d{9}$/.test(compact)) return `+964${compact.slice(1)}`;
  if (/^7\d{9}$/.test(compact)) return `+964${compact}`;
  return compact;
}

export function isE164(value: string): boolean {
  return E164.test(value);
}
