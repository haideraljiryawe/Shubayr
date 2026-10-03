jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../catalog/products.service', () => ({ ProductsService: class {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { assertDifferentActor } from '../../common/access/separation-of-duties';

const input = { address_id: 'address-1', payment_method: 'cod' as const };
const fingerprint = createHash('sha256')
  .update(
    JSON.stringify({
      address_id: input.address_id,
      coupon_code: null,
      payment_method: 'cod',
      accepted_price_versions: [],
    }),
  )
  .digest('hex');

describe('OrdersService', () => {
  const audit = { record: jest.fn() };

  it('filters month-boundary reports by Baghdad calendar days', async () => {
    const findMany = jest.fn((input: unknown) => {
      void input;
      return Promise.resolve([]);
    });
    const prisma = {
      order: {
        count: jest.fn().mockResolvedValue(0),
        findMany,
      },
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    const service = new OrdersService(prisma as never, {} as never, audit);

    await service.listAdmin({
      from: '2026-11-01',
      to: '2026-11-01',
    });

    const query = findMany.mock.calls[0][0] as {
      where: { placed_at: { gte: Date; lt: Date } };
    };
    expect(query.where.placed_at).toEqual({
      gte: new Date('2026-10-31T21:00:00.000Z'),
      lt: new Date('2026-11-01T21:00:00.000Z'),
    });
  });

  it('filters admin order queues and returns server-side badge counts', async () => {
    const count = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      order: { count, findMany },
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    const service = new OrdersService(prisma as never, {} as never, audit);

    const result = await service.listAdmin({
      status: 'preparing',
      late: true,
      needs_attention: true,
      cancellation_request: 'pending',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'preparing',
          late_for_acceptance: true,
          inventory_attention_required: true,
          cancellation_request_status: 'pending',
        },
      }),
    );
    expect(count).toHaveBeenNthCalledWith(2, {
      where: { status: 'preparing', late_for_acceptance: true },
    });
    expect(count).toHaveBeenNthCalledWith(3, {
      where: { status: 'preparing', inventory_attention_required: true },
    });
    expect(count).toHaveBeenNthCalledWith(4, {
      where: { status: 'preparing', cancellation_request_status: 'pending' },
    });
    expect(result).toMatchObject({
      total: 2,
      badge_counts: {
        late: 4,
        needs_attention: 3,
        pending_cancellation: 1,
      },
    });
  });
  it('returns the original order for an idempotent retry without touching the cleared cart', async () => {
    const row = {
      id: 'order-1',
      user_id: 'user-1',
      order_number: 'ORD-1',
      status: 'pending',
      payment_method: 'cod',
      address_id: 'address-1',
      delivery_id: 'delivery-1',
      subtotal: 20150,
      delivery_fee: 0,
      discount: 0,
      total: 20150,
      delivery_contact_phone: '+9647700000000',
      delivery_address_label: null,
      delivery_city: 'Baghdad',
      delivery_area: null,
      delivery_street: null,
      delivery_details: null,
      delivery_lat: null,
      delivery_lng: null,
      placed_at: new Date(),
      items: [],
      idempotency_fingerprint: fingerprint,
    };
    const tx = {
      $queryRaw: jest.fn(),
      order: { findUnique: jest.fn().mockResolvedValue(row) },
      cart: { findUnique: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
      order: { findUnique: jest.fn().mockResolvedValue(row) },
      productReview: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OrdersService(prisma as never, {} as never, audit);
    const result = await service.place('user-1', input, 'retry-1');
    expect(result.id).toBe('order-1');
    expect(tx.cart.findUnique).not.toHaveBeenCalled();
  });

  it('rejects reusing an idempotency key with a different request', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          idempotency_fingerprint: 'different',
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const service = new OrdersService(prisma as never, {} as never, audit);
    await expect(
      service.place('user-1', input, 'retry-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns 403 for another user's order and 404 for a missing order", async () => {
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'order-1', user_id: 'other', items: [] })
          .mockResolvedValueOnce(null),
      },
    };
    const service = new OrdersService(prisma as never, {} as never, audit);
    await expect(service.getOwned('user-1', 'order-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getOwned('user-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('releases lot reservations and appends a tracking event on cancellation', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          user_id: 'user-1',
          status: 'pending',
          version: 1,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: { count: jest.fn().mockResolvedValue(0) },
      orderStatusEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'order-1', user_id: 'user-1', items: [] }),
      },
      productReview: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const inventory = { releaseOrder: jest.fn() };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      audit,
      undefined,
      inventory as never,
    );
    await service.cancel('user-1', 'order-1', { version: 1 });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: { in: ['pending'] }, version: 1 },
      data: { status: 'cancelled', version: { increment: 1 } },
    });
    expect(inventory.releaseOrder).toHaveBeenCalledWith(
      tx,
      'order-1',
      'user-1',
    );
    expect(tx.orderStatusEvent.create).toHaveBeenCalledWith({
      data: {
        order_id: 'order-1',
        status: 'cancelled',
        note: 'Cancelled by customer',
        at: expect.any(Date) as Date,
      },
    });
  });

  it('rejects only a pending order, releases reservations, and notifies customer and monitors', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          user_id: 'customer-1',
          status: 'pending',
          version: 1,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'order-1',
          user_id: 'customer-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderStatusEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const notifications = {
      record: jest.fn(),
      recordOrderMonitors: jest.fn(),
    };
    const inventory = { releaseOrder: jest.fn() };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      audit,
      notifications as never,
      inventory as never,
    );
    jest.spyOn(service, 'getAdmin').mockResolvedValue({} as never);

    await service.rejectAdmin('staff-1', 'order-1', {
      reason: 'Cannot fulfil this order',
      version: 1,
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'pending', version: 1 },
      data: { status: 'rejected', version: { increment: 1 } },
    });
    expect(inventory.releaseOrder).toHaveBeenCalledWith(
      tx,
      'order-1',
      'staff-1',
    );
    expect(notifications.record).toHaveBeenCalledWith(
      tx,
      'customer-1',
      'order_rejected',
      'order',
      'order-1',
      '',
    );
    expect(notifications.recordOrderMonitors).toHaveBeenCalledWith(
      tx,
      'order_rejected',
      'order-1',
      expect.any(String),
    );
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: 'staff-1',
        action: 'order.reject',
        before: { status: 'pending' },
        after: {
          status: 'rejected',
          reason: 'Cannot fulfil this order',
        },
      }),
    );
  });

  it('rejects a disallowed staff transition without writing an event', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'order-1', status: 'pending', version: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      orderStatusEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const service = new OrdersService(prisma as never, {} as never, audit);
    await expect(
      service.updateStatus('staff-1', 'order-1', {
        status: 'dispatched',
        version: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.orderStatusEvent.create).not.toHaveBeenCalled();
  });

  it('allows a valid staff transition and records it against the prior status', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'order-1', status: 'pending', version: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderStatusEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
      order: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'order-1', user_id: 'user-1', items: [] }),
      },
      productReview: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OrdersService(prisma as never, {} as never, audit);
    jest.spyOn(service, 'getAdmin').mockResolvedValue({} as never);
    await service.updateStatus('staff-1', 'order-1', {
      status: 'confirmed',
      version: 1,
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'pending', version: 1 },
      data: { status: 'confirmed', version: { increment: 1 } },
    });
    expect(tx.orderStatusEvent.create).toHaveBeenCalledWith({
      data: {
        order_id: 'order-1',
        status: 'confirmed',
        note: null,
        at: expect.any(Date) as Date,
      },
    });
  });

  it("ignores a client-supplied originator id and refuses the authenticated originator's self-approval", async () => {
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          user_id: 'staff-1',
          status: 'pending',
          version: 1,
        }),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            variant_id: 'variant-1',
            unit_price: 1000,
            variant: { sku: 'SKU-1' },
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const belowCost = {
      assertAllowed: jest.fn(
        (
          _db: unknown,
          actorId: string,
          _permissions: string[],
          _variants: unknown[],
          override: { originatorId?: string | null },
        ) => {
          assertDifferentActor(actorId, override.originatorId!);
        },
      ),
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      audit,
      undefined,
      undefined,
      belowCost as never,
    );

    await expect(
      service.updateStatus(
        'staff-1',
        'order-1',
        {
          status: 'confirmed',
          version: 1,
          below_cost_override_reason: 'Self approval attempt',
          below_cost_originator_id: 'different-user',
        } as never,
        ['sell_below_cost.approve'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(belowCost.assertAllowed).toHaveBeenCalledWith(
      tx,
      'staff-1',
      ['sell_below_cost.approve'],
      expect.any(Array),
      expect.objectContaining({ originatorId: 'staff-1' }),
    );
  });
});
