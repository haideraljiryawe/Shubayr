jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { NotificationsService } from './notifications.service';

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
