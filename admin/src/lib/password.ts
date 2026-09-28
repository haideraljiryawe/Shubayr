/* ---------------------------------------------------------------------------
 * The staff password policy, mirrored from the contract's `Password` schema
 * so the form can say what is missing before the round trip. The API remains
 * the authority and its 422 is shown next to the field when it disagrees.
 * ------------------------------------------------------------------------- */

export type PasswordRule = "length" | "lower" | "upper" | "digit" | "symbol";

export const PASSWORD_RULES: readonly PasswordRule[] = [
  "length",
  "lower",
  "upper",
  "digit",
  "symbol",
];

export function passwordChecks(
  password: string,
): Record<PasswordRule, boolean> {
  return {
    length: password.length >= 12 && password.length <= 128,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    digit: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function isStrongPassword(password: string): boolean {
  return Object.values(passwordChecks(password)).every(Boolean);
}

/**
 * A temporary password that satisfies the policy, for the "generate" button.
 * Uses the platform CSPRNG; the person receiving it must change it at their
 * first sign-in anyway.
 */
export function generateTemporaryPassword(length = 16): string {
  const sets = [
    "abcdefghijkmnpqrstuvwxyz",
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "23456789",
    "!@#$%^&*-_=+?",
  ];
  const all = sets.join("");
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  const chars = sets.map((set, index) => set[random[index] % set.length]);
  for (let index = sets.length; index < length; index += 1) {
    chars.push(all[random[index] % all.length]);
  }
  // Shuffle so the guaranteed characters are not always first.
  const order = new Uint32Array(chars.length);
  crypto.getRandomValues(order);
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = order[index] % (index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join("");
}
