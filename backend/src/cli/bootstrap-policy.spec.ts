import { PASSWORD_PATTERN } from '../modules/auth/password';
import {
  SEEDED_PRESET_GRANTS,
  PERMISSION_REGISTRY,
} from '../common/access/permission-registry';
import {
  OWNER_PRESET,
  assertOwnerPassword,
  parseOwnerArgs,
  presetDescription,
  temporaryPassword,
} from './bootstrap-policy';

describe('production bootstrap policy', () => {
  it('reads the owner arguments and refuses bad ones', () => {
    expect(
      parseOwnerArgs([
        '--username',
        'Owner',
        '--name',
        ' Store owner ',
        '--email',
        'owner@example.com',
      ]),
    ).toEqual({
      username: 'owner',
      name: 'Store owner',
      email: 'owner@example.com',
    });
    expect(parseOwnerArgs(['--username', 'owner', '--name', 'O'])).toEqual({
      username: 'owner',
      name: 'O',
      email: null,
    });
    expect(() => parseOwnerArgs(['--name', 'Owner'])).toThrow(
      'USERNAME_INVALID',
    );
    expect(() => parseOwnerArgs(['--username', '1x', '--name', 'O'])).toThrow(
      'USERNAME_INVALID',
    );
    expect(() => parseOwnerArgs(['--username', 'owner'])).toThrow(
      'NAME_REQUIRED',
    );
    expect(() =>
      parseOwnerArgs(['--username', 'owner', '--name', 'O', '--email', 'nope']),
    ).toThrow('EMAIL_INVALID');
  });

  it('makes one-time passwords that meet the staff policy', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const password = temporaryPassword();
      expect(password).toHaveLength(20);
      expect(PASSWORD_PATTERN.test(password)).toBe(true);
      seen.add(password);
    }
    expect(seen.size).toBe(200);
  });

  it('refuses a weak OWNER_PASSWORD', () => {
    expect(() => assertOwnerPassword('short')).toThrow('PASSWORD_POLICY');
    expect(() => assertOwnerPassword('Long-Enough-Pass-2026')).not.toThrow();
  });

  it('replaces only the dev seed preset descriptions', () => {
    expect(presetDescription('super_admin')).toBe(
      'Built-in super admin preset',
    );
    expect(presetDescription('cashier', 'Development cashier preset')).toBe(
      'Built-in cashier preset',
    );
    expect(presetDescription('operations', 'Our shift leads')).toBe(
      'Our shift leads',
    );
  });

  it('gives the owner every permission', () => {
    expect([...SEEDED_PRESET_GRANTS[OWNER_PRESET]].sort()).toEqual(
      Object.keys(PERMISSION_REGISTRY).sort(),
    );
  });
});
