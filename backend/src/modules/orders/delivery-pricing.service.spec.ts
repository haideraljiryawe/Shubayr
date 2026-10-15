jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../audit/audit.service', () => ({ AuditService: class {} }));

import { DeliveryPricingService } from './delivery-pricing.service';
import {
  GovernoratesController,
  PublicDiscountTiersController,
} from './delivery-pricing.controller';
import {
  RATE_LIMIT_TIER,
  RateLimitRisk,
} from '../../common/rate-limit/rate-limit-tier';

const baghdad = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'baghdad',
  name_ar: 'بغداد',
  name_en: 'Baghdad',
  is_active: true,
};

const basra = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'basra',
  name_ar: 'البصرة',
  name_en: 'Basra',
  is_active: true,
};

describe('DeliveryPricingService store reads', () => {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => jest.clearAllMocks());

  it('publishes the active-zone fee and explicitly marks unserved governorates', async () => {
    const prisma = {
      governorate: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...baghdad,
            delivery_zone: { is_active: true, fee_iqd: '6000' },
          },
          { ...basra, delivery_zone: null },
        ]),
      },
    };
    const service = new DeliveryPricingService(prisma as never, audit);

    await expect(service.listPublicGovernorates()).resolves.toEqual([
      {
        ...baghdad,
        is_served: true,
        delivery_fee: 6000,
        currency: 'IQD',
      },
      {
        ...basra,
        is_served: false,
        delivery_fee: null,
        currency: 'IQD',
      },
    ]);
  });

  it('resolves signed-in cart pricing by governorate or an owned address', async () => {
    const served = {
      ...baghdad,
      delivery_zone: { is_active: true, fee_iqd: '6000' },
    };
    const prisma = {
      governorate: { findUnique: jest.fn().mockResolvedValue(served) },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          governorate_id: baghdad.id,
          governorate: served,
        }),
      },
    };
    const service = new DeliveryPricingService(prisma as never, audit);

    await expect(
      service.resolveDeliveryFee('customer-1', {
        governorate_id: baghdad.id,
      }),
    ).resolves.toBe(6000);
    await expect(
      service.resolveDeliveryFee('customer-1', {
        address_id: '00000000-0000-4000-8000-000000000011',
      }),
    ).resolves.toBe(6000);
    expect(prisma.address.findFirst).toHaveBeenCalledWith({
      where: {
        id: '00000000-0000-4000-8000-000000000011',
        user_id: 'customer-1',
      },
      include: { governorate: { include: { delivery_zone: true } } },
    });
  });

  it('uses the checkout error code for an unserved governorate', async () => {
    const prisma = {
      governorate: {
        findUnique: jest.fn().mockResolvedValue({
          ...basra,
          delivery_zone: null,
        }),
      },
    };
    const service = new DeliveryPricingService(prisma as never, audit);

    await expect(
      service.resolveDeliveryFee('customer-1', {
        governorate_id: basra.id,
      }),
    ).rejects.toMatchObject({
      response: { code: 'DELIVERY_ZONE_NOT_SERVED' },
    });
  });

  it('invalidates the public tier cache immediately after an owner edit', async () => {
    const before = {
      id: 'tier-1',
      min_subtotal_iqd: '10000',
      percent: '5',
      is_active: true,
      created_at: new Date('2026-10-01T00:00:00Z'),
      updated_at: new Date('2026-10-01T00:00:00Z'),
    };
    const after = { ...before, percent: '7' };
    const tx = {
      discountTier: {
        findUnique: jest.fn().mockResolvedValue(before),
        update: jest.fn().mockResolvedValue(after),
      },
    };
    const prisma = {
      discountTier: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([before])
          .mockResolvedValueOnce([after]),
      },
      storeSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const service = new DeliveryPricingService(prisma as never, audit);

    await expect(service.listPublicTiers()).resolves.toMatchObject({
      coupon_stacking_enabled: false,
      tiers: [{ min_subtotal: 10000, percent: 5 }],
    });
    await service.listPublicTiers();
    expect(prisma.discountTier.findMany).toHaveBeenCalledTimes(1);

    await service.updateTier('owner-1', 'tier-1', { percent: 7 });
    await expect(service.listPublicTiers()).resolves.toMatchObject({
      tiers: [{ min_subtotal: 10000, percent: 7 }],
    });
    expect(prisma.discountTier.findMany).toHaveBeenCalledTimes(2);
  });

  it('reports every conflicting governorate and its existing zone', async () => {
    const baghdadZone = {
      id: 'zone-1',
      name_ar: 'منطقة بغداد',
      name_en: 'Baghdad zone',
    };
    const basraZone = {
      id: 'zone-2',
      name_ar: 'منطقة البصرة',
      name_en: 'Basra zone',
    };
    const tx = {
      governorate: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...baghdad,
            delivery_zone_id: baghdadZone.id,
            delivery_zone: baghdadZone,
          },
          {
            ...basra,
            delivery_zone_id: basraZone.id,
            delivery_zone: basraZone,
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const service = new DeliveryPricingService(prisma as never, audit);

    await expect(
      service.createZone('owner-1', {
        name_ar: 'منطقة جديدة',
        name_en: 'New zone',
        fee_iqd: 5000,
        governorate_ids: [baghdad.id, basra.id],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'GOVERNORATE_ALREADY_IN_DELIVERY_ZONE',
        errors: [
          expect.objectContaining({
            governorate_id: baghdad.id,
            governorate_code: 'baghdad',
            delivery_zone_id: baghdadZone.id,
            delivery_zone_name_en: 'Baghdad zone',
          }),
          expect.objectContaining({
            governorate_id: basra.id,
            governorate_code: 'basra',
            delivery_zone_id: basraZone.id,
            delivery_zone_name_en: 'Basra zone',
          }),
        ],
      },
    });
  });
});

describe('public delivery-pricing route policy', () => {
  it.each([
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ['governorates', GovernoratesController.prototype.list],
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ['discount tiers', PublicDiscountTiersController.prototype.list],
  ])('uses the catalog rate tier for %s', (_name, handler) => {
    expect(Reflect.getMetadata(RATE_LIMIT_TIER, handler)).toBe(
      RateLimitRisk.Catalog,
    );
  });
});
