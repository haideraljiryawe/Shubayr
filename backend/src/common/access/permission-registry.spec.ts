import {
  PERMISSION_DEPENDENCIES,
  SEEDED_PRESET_GRANTS,
  type PermissionKey,
} from './permission-registry';

describe('seeded permission presets', () => {
  it('never grants an action without every declared read dependency', () => {
    const missing: string[] = [];
    for (const [preset, grants] of Object.entries(SEEDED_PRESET_GRANTS)) {
      const held = new Set<PermissionKey>(grants);
      for (const action of grants) {
        for (const dependency of PERMISSION_DEPENDENCIES[action] ?? []) {
          if (!held.has(dependency)) {
            missing.push(`${preset}: ${action} requires ${dependency}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps supplier payments with cashier/accountant, not stock control', () => {
    expect(SEEDED_PRESET_GRANTS.stock_controller).not.toContain(
      'supplier_payments.record',
    );
    expect(SEEDED_PRESET_GRANTS.cashier).toContain('supplier_payments.record');
    expect(SEEDED_PRESET_GRANTS.accountant).toContain(
      'supplier_payments.record',
    );
  });
});
