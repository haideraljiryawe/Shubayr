import {
  PERMISSION_DEPENDENCIES,
  PERMISSION_KEYS,
  permissionPresentation,
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

  it('lets expenses.create use the scoped form options without broad reads', () => {
    expect(PERMISSION_DEPENDENCIES['expenses.create']).toEqual([]);
  });
});

describe('permission presentation metadata', () => {
  it('has non-technical Arabic and English labels and descriptions for every key', () => {
    for (const key of PERMISSION_KEYS) {
      const metadata = permissionPresentation(key);
      expect(metadata.name_ar).toMatch(/[\u0600-\u06ff]/);
      expect(metadata.name_ar).not.toContain(key);
      expect(metadata.name_en).not.toContain('.');
      expect(metadata.description_ar).toMatch(/[\u0600-\u06ff]/);
      expect(metadata.description_en).toMatch(/\.$/);
    }
  });
});
