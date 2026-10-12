jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { SettingsService } from './settings.service';

describe('SettingsService public settings', () => {
  it('returns the public catalog threshold and sale rounding policy', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { key: 'store_name', value: 'Shubayr' },
      { key: 'default_low_stock_threshold', value: '5' },
      { key: 'sale_rounding_multiple', value: '250' },
    ]);
    const service = new SettingsService(
      { storeSetting: { findMany } } as never,
      {} as never,
    );

    await expect(service.getPublicSettings()).resolves.toEqual({
      store_name: 'Shubayr',
      default_low_stock_threshold: '5',
      sale_rounding_multiple: '250',
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        key: {
          in: expect.arrayContaining([
            'default_low_stock_threshold',
            'sale_rounding_multiple',
          ]) as string[],
        },
      },
    });
  });
});
