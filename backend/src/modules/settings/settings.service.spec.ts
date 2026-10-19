jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { SettingsService } from './settings.service';

describe('SettingsService public settings', () => {
  it('returns store contact/policy fields as explicit nulls when unset', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { key: 'store_name', value: 'Shubayr' },
      { key: 'default_low_stock_threshold', value: '5' },
      { key: 'sale_rounding_multiple', value: '250' },
      { key: 'return_window_days', value: '14' },
    ]);
    const service = new SettingsService(
      { storeSetting: { findMany } } as never,
      {} as never,
    );

    await expect(service.getPublicSettings()).resolves.toEqual({
      store_name: 'Shubayr',
      default_low_stock_threshold: '5',
      sale_rounding_multiple: '250',
      store_legal_name_ar: null,
      store_legal_name_en: null,
      store_address_ar: null,
      store_address_en: null,
      support_phone: null,
      support_whatsapp: null,
      support_email: null,
      privacy_email: null,
      support_hours_ar: null,
      support_hours_en: null,
      refund_days: null,
      policy_effective_date: null,
      return_window_days: 14,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        key: {
          in: expect.arrayContaining([
            'default_low_stock_threshold',
            'sale_rounding_multiple',
            'store_legal_name_ar',
            'support_phone',
            'refund_days',
            'policy_effective_date',
            'return_window_days',
          ]) as string[],
        },
      },
    });
  });

  it('refuses to invent a return-window default when reference data is missing', async () => {
    const service = new SettingsService(
      { storeSetting: { findMany: jest.fn().mockResolvedValue([]) } } as never,
      {} as never,
    );
    await expect(service.getPublicSettings()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFERENCE_DATA_MISSING' }),
    });
  });
});
