import { randomInt } from 'node:crypto';
import { PASSWORD_PATTERN } from '../modules/auth/password';

/**
 * Production first-run bootstrap (docs/deploy/production.md), kept pure so
 * it is unit-tested. The commands that use it are bootstrap-reference.ts and
 * create-owner.ts; neither creates demo products, users or orders.
 */

/** App roles the customer and work-phone sign-ins depend on. */
export const REFERENCE_ROLES = [
  ['customer', 'End customer'],
  ['delivery_agent', 'Delivery agent app role'],
  ['order_monitor', 'Read-only order monitor app role'],
] as const;

/**
 * Store settings a new store starts with. Created when missing, never
 * overwritten: the owner changes them in the Web Admin.
 */
export const REFERENCE_SETTINGS = [
  ['store_name', 'Shubayr'],
  ['currency', 'IQD'],
  ['timezone', 'Asia/Baghdad'],
  ['sale_rounding_multiple', '0'],
  ['separation_of_duties_level', 'standard'],
] as const;

/** What the migrations seed and the bootstrap only checks. */
export const REFERENCE_MINIMUMS = {
  governorates: 18,
  ledgerAccounts: 10,
  baseCurrency: 'IQD',
} as const;

/** The preset the owner gets: every permission. */
export const OWNER_PRESET = 'super_admin';

/** Built-in presets get a neutral description; the dev seed's is replaced. */
export function presetDescription(
  name: string,
  current?: string | null,
): string {
  if (current && !current.startsWith('Development ')) return current;
  return `Built-in ${name.replaceAll('_', ' ')} preset`;
}

export interface OwnerOptions {
  username: string;
  name: string;
  email: string | null;
}

const USERNAME = /^[a-z][a-z0-9._-]{2,79}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `--username owner --name "Store owner" [--email owner@example.com]` */
export function parseOwnerArgs(argv: string[]): OwnerOptions {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const username = (value('--username') ?? '').trim().toLowerCase();
  const name = (value('--name') ?? '').trim();
  const email = (value('--email') ?? '').trim() || null;
  if (!USERNAME.test(username)) throw new Error('USERNAME_INVALID');
  if (!name || name.length > 120) throw new Error('NAME_REQUIRED');
  if (email && !EMAIL.test(email)) throw new Error('EMAIL_INVALID');
  return { username, name, email };
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '-_!@#%+=';

/**
 * A one-time password that meets the staff password policy: 20 characters,
 * every class present, no look-alike characters. The owner must change it
 * at the first sign-in.
 */
export function temporaryPassword(length = 20): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  const password = chars.join('');
  if (!PASSWORD_PATTERN.test(password)) throw new Error('PASSWORD_POLICY');
  return password;
}

/** A password supplied through OWNER_PASSWORD must meet the same policy. */
export function assertOwnerPassword(password: string): void {
  if (!PASSWORD_PATTERN.test(password)) throw new Error('PASSWORD_POLICY');
}
