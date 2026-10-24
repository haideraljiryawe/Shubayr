jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { presetPresentation } from '../../common/access/permission-registry';
import { AccessManagementService } from './access-management.service';

describe('AccessManagementService permission metadata', () => {
  const service = new AccessManagementService(
    {} as never,
    {} as never,
    {} as never,
  );

  it('returns localized metadata for every stable permission key', () => {
    const rows = service.permissions();
    expect(rows.length).toBeGreaterThan(50);
    expect(rows).toContainEqual(
      expect.objectContaining({
        key: 'orders.accept',
        name_ar: 'قبول الطلبات',
        name_en: 'Accept pending orders',
        description_ar: expect.any(String) as string,
        description_en: expect.any(String) as string,
      }),
    );
  });

  it('searches localized names and descriptions without changing keys', () => {
    expect(service.permissions('العلامات التجارية')).toEqual([
      expect.objectContaining({ key: 'catalog.brands' }),
    ]);
    expect(service.permissions('sale prices')).toEqual([
      expect.objectContaining({ key: 'prices.change' }),
    ]);
  });

  it('localizes built-in presets and safely falls back for owner presets', () => {
    expect(presetPresentation('super_admin')).toEqual({
      name_ar: 'صاحب المتجر',
      name_en: 'Store owner',
    });
    expect(presetPresentation('night_shift')).toEqual({
      name_ar: 'night_shift',
      name_en: 'night_shift',
    });
  });
});
