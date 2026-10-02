jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { OrderTimeoutService } from './order-timeout.service';

describe('OrderTimeoutService', () => {
  const now = new Date('2026-10-08T08:00:00.000Z');

  function fixture(order: Record<string, unknown>) {
    let current = { ...order };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      order: {
        findUnique: jest.fn().mockImplementation(() => current),
        updateMany: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            current = {
              ...current,
              status: data.status,
              version: Number(current.version) + 1,
            };
            return { count: 1 };
          }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            current = { ...current, ...data };
            return current;
          }),
      },
      orderStatusEvent: { create: jest.fn() },
    };
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([{ id: 'order-1' }]) },
      $transaction: jest
        .fn()
        .mockImplementation((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const inventory = { releaseOrder: jest.fn() };
    const audit = { record: jest.fn() };
    const notifications = {
      record: jest.fn(),
      recordStaffWithPermission: jest.fn(),
    };
    return {
      service: new OrderTimeoutService(
        prisma as unknown as ConstructorParameters<
          typeof OrderTimeoutService
        >[0],
        inventory as unknown as ConstructorParameters<
          typeof OrderTimeoutService
        >[1],
        audit,
        notifications as unknown as ConstructorParameters<
          typeof OrderTimeoutService
        >[3],
      ),
      tx,
      inventory,
      audit,
      notifications,
    };
  }

  it('auto-cancels once and releases reservations once', async () => {
    const test = fixture({
      id: 'order-1',
      user_id: 'customer-1',
      status: 'pending',
      version: 3,
      auto_cancel_deadline: new Date('2026-10-08T07:59:00.000Z'),
      acceptance_deadline: new Date('2026-10-08T07:00:00.000Z'),
      acceptance_alerted_at: null,
    });
    await test.service.run(now);
    await test.service.run(now);

    expect(test.inventory.releaseOrder).toHaveBeenCalledTimes(1);
    expect(test.tx.orderStatusEvent.create).toHaveBeenCalledTimes(1);
    expect(test.audit.record).toHaveBeenCalledTimes(1);
    expect(test.notifications.record).toHaveBeenCalledTimes(1);
  });

  it('marks a late order and alerts permission-scoped staff once', async () => {
    const test = fixture({
      id: 'order-1',
      user_id: 'customer-1',
      status: 'pending',
      version: 1,
      auto_cancel_deadline: null,
      acceptance_deadline: new Date('2026-10-08T07:59:00.000Z'),
      acceptance_alerted_at: null,
      late_for_acceptance: false,
    });
    await test.service.run(now);
    await test.service.run(now);

    expect(test.tx.order.update).toHaveBeenCalledTimes(1);
    expect(test.inventory.releaseOrder).not.toHaveBeenCalled();
    expect(test.notifications.recordStaffWithPermission).toHaveBeenCalledTimes(
      1,
    );
    expect(test.notifications.recordStaffWithPermission).toHaveBeenCalledWith(
      test.tx,
      'orders.accept',
      'order_acceptance_late',
      'order',
      'order-1',
      expect.any(String),
    );
  });
});
