jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../catalog/products.service', () => ({ ProductsService: class {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

import { Prisma } from '../../generated/prisma/client';
import { OrdersService } from './orders.service';

describe('order confirmation contact and delivery fee adjustment', () => {
  const baseOrder = {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    status: 'pending',
    version: 1,
    subtotal: new Prisma.Decimal(10_000),
    discount: new Prisma.Decimal(1_000),
    delivery_fee: new Prisma.Decimal(5_000),
    original_delivery_fee: new Prisma.Decimal(5_000),
    total: new Prisma.Decimal(14_000),
  };

  function harness(order = baseOrder) {
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderStatusEvent: { create: jest.fn() },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      delivery: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new OrdersService(prisma as never, {} as never, audit);
    jest.spyOn(service, 'getAdmin').mockResolvedValue({} as never);
    return { service, tx, audit };
  }

  it('refuses confirmation without recorded customer contact', async () => {
    const { service } = harness();
    await expect(
      service.updateStatus('staff-1', baseOrder.id, {
        status: 'confirmed',
        version: 1,
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_CONTACT_REQUIRED' },
    });
  });

  it('refuses a fee adjustment without the dedicated permission', async () => {
    const { service } = harness();
    await expect(
      service.updateStatus(
        'staff-1',
        baseOrder.id,
        {
          status: 'confirmed',
          version: 1,
          customer_contacted: true,
          customer_contact_note: 'Customer answered',
          adjusted_delivery_fee: 7_000,
          delivery_fee_adjustment_reason: 'Remote district',
        },
        ['orders.accept'],
      ),
    ).rejects.toMatchObject({
      response: { code: 'DELIVERY_FEE_ADJUSTMENT_FORBIDDEN' },
    });
  });

  it.each([
    [7_000, 16_000, 'Remote district'],
    [2_000, 11_000, 'Nearby landmark'],
  ])(
    'adjusts the fee to %i and pending collection total to %i',
    async (fee, total, reason) => {
      const { service, tx, audit } = harness();
      await service.updateStatus(
        'staff-1',
        baseOrder.id,
        {
          status: 'confirmed',
          version: 1,
          customer_contacted: true,
          customer_contact_note: 'Customer answered',
          adjusted_delivery_fee: fee,
          delivery_fee_adjustment_reason: reason,
        },
        ['orders.accept', 'orders.adjust_delivery_fee'],
      );

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: baseOrder.id, status: 'pending', version: 1 },
        // Jest's asymmetric matcher is intentionally dynamic here.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          delivery_fee: new Prisma.Decimal(fee),
          adjusted_delivery_fee: new Prisma.Decimal(fee),
          total: new Prisma.Decimal(total),
          customer_contacted: true,
          customer_contact_note: 'Customer answered',
        }),
      });
      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { order_id: baseOrder.id, status: 'pending' },
        data: { amount: new Prisma.Decimal(total) },
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { order_id: baseOrder.id },
        data: { delivery_fee: new Prisma.Decimal(fee) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'order.delivery_fee.adjust',
          reason,
        }),
      );
    },
  );

  it('refuses an adjustment attempt after dispatch', async () => {
    const { service } = harness({
      ...baseOrder,
      status: 'dispatched',
      version: 4,
    });
    await expect(
      service.updateStatus(
        'staff-1',
        baseOrder.id,
        {
          status: 'confirmed',
          version: 4,
          customer_contacted: true,
          customer_contact_note: 'Late change',
          adjusted_delivery_fee: 7_000,
          delivery_fee_adjustment_reason: 'Too late',
        },
        ['orders.accept', 'orders.adjust_delivery_fee'],
      ),
    ).rejects.toMatchObject({ response: { code: 'STALE_ORDER_STATE' } });
  });
});
