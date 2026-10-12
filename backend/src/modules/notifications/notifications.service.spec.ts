jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { NotificationsService } from './notifications.service';
import { InvalidNotificationRecipientError } from './notification-provider';

describe('NotificationsService history', () => {
  it('filters the inbox by notification type as well as unread state', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      notificationEvent: { count, findMany },
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    const service = new NotificationsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.history('user-1', {
      unread: true,
      type: 'order_acceptance_late',
      page: 2,
      per_page: 5,
    });

    const where = {
      user_id: 'user-1',
      read_at: null,
      type: 'order_acceptance_late',
    };
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 5, take: 5 }),
    );
  });
});

describe('NotificationsService push dispatch', () => {
  it('deactivates a token rejected by FCM as invalid', async () => {
    const deviceUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const logUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      notificationEvent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event-1',
          user_id: 'user-1',
          type: 'order_placed',
          target_role: 'customer',
          entity_type: 'order',
          entity_id: 'order-1',
          processed_at: null,
          user: { phone: null },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      deviceToken: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'device-1',
            token: 'expired-token',
            locale: 'en',
            last_seen_at: new Date(),
          },
        ]),
        updateMany: deviceUpdate,
      },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      notificationChannelPreference: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      notificationLog: {
        upsert: jest.fn(
          ({
            create,
          }: {
            create: { channel: string; [key: string]: unknown };
          }) => Promise.resolve({ id: `log-${create.channel}`, ...create }),
        ),
        update: logUpdate,
      },
    };
    const push = {
      send: jest
        .fn()
        .mockRejectedValue(new InvalidNotificationRecipientError()),
    };
    const service = new NotificationsService(
      prisma as never,
      {} as never,
      {} as never,
      push,
      { send: jest.fn().mockResolvedValue(undefined) },
    );

    await service.dispatch('event-1');

    expect(deviceUpdate).toHaveBeenCalledWith({
      where: {
        id: 'device-1',
        token: 'expired-token',
        is_active: true,
      },
      data: {
        is_active: false,
        deactivated_at: expect.any(Date) as Date,
      },
    });
    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-push' },
        data: expect.objectContaining({ status: 'failed' }) as Record<
          string,
          unknown
        >,
      }),
    );
  });
});
