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

const input = { address_id: 'address-1', payment_method: 'cod' as const };
const fingerprint = createHash('sha256')
  .update(
    JSON.stringify({
      address_id: input.address_id,
      coupon_code: null,
      payment_method: 'cod',
    }),
  )
  .digest('hex');

describe('OrdersService', () => {
  const audit = { record: jest.fn() };
  it('returns the original order for an idempotent retry without touching the cleared cart', async () => {
    const row = {
      id: 'order-1',
      user_id: 'user-1',
      order_number: 'ORD-1',
      status: 'pending',
      payment_method: 'cod',
      address_id: 'address-1',
      delivery_id: 'delivery-1',
      subtotal: 20.15,
      delivery_fee: 0,
      discount: 0,
      total: 20.15,
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

  it('releases the temporary stock hold and appends a tracking event on cancellation', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          user_id: 'user-1',
          status: 'confirmed',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: { count: jest.fn().mockResolvedValue(0) },
      orderStatusEvent: { create: jest.fn() },
      simpleStockHold: { updateMany: jest.fn() },
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
    const service = new OrdersService(prisma as never, {} as never, audit);
    await service.cancel('user-1', 'order-1');
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: { in: ['pending', 'confirmed'] } },
      data: { status: 'cancelled' },
    });
    expect(tx.simpleStockHold.updateMany).toHaveBeenCalledWith({
      where: { order_id: 'order-1', status: 'held' },
      data: { status: 'released', released_at: expect.any(Date) as Date },
    });
    expect(tx.orderStatusEvent.create).toHaveBeenCalledWith({
      data: {
        order_id: 'order-1',
        status: 'cancelled',
        note: 'Cancelled by customer',
        at: expect.any(Date) as Date,
      },
    });
  });

  it('rejects a disallowed staff transition without writing an event', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'order-1', status: 'pending' }),
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
        status: 'out_for_delivery',
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
          .mockResolvedValue({ id: 'order-1', status: 'pending' }),
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
    await service.updateStatus('staff-1', 'order-1', { status: 'confirmed' });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'pending' },
      data: { status: 'confirmed' },
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
});
