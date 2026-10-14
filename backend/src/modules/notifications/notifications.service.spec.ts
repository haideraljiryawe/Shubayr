jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { NotificationsService } from './notifications.service';
import {
  InvalidNotificationRecipientError,
  NotificationDeliveryError,
} from './notification-provider';

describe('NotificationsService history', () => {
  it('excludes test events while filtering by type and unread state', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      notificationEvent: { count, findMany },
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    const service = makeService(prisma);

    await service.history('user-1', {
      unread: true,
      type: 'order_acceptance_late',
      page: 2,
      per_page: 5,
    });

    const where = {
      user_id: 'user-1',
      is_test: false,
      read_at: null,
      type: 'order_acceptance_late',
    };
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 5, take: 5 }),
    );
  });
});

describe('NotificationsService registration eligibility', () => {
  it('binds registration to the authenticated session and retires its old token', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      refreshToken: {
        findFirst: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
      },
      deviceToken: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({
          id: 'device-2',
          user_id: 'user-1',
          session_id: 'session-1',
          token: 'new-token',
          platform: 'ios',
          locale: 'en',
          is_active: true,
          last_seen_at: new Date(),
          deactivated_at: null,
          created_at: new Date(),
        }),
      },
    };
    const prisma = transactionPrisma(tx);
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = makeService(prisma, { audit });

    const result = await service.register('user-1', 'session-1', 4, {
      token: 'new-token',
      platform: 'ios',
      locale: 'en',
    });

    expect(tx.deviceToken.updateMany).toHaveBeenCalledWith({
      where: {
        user_id: 'user-1',
        session_id: 'session-1',
        token: { not: 'new-token' },
        is_active: true,
      },
      data: { is_active: false, deactivated_at: expect.any(Date) as Date },
    });
    expect(result).not.toHaveProperty('session_id');
  });
});

describe('NotificationsService push dispatch', () => {
  it('deactivates only the current owner binding for UNREGISTERED', async () => {
    const { service, tx, prisma, push } = dispatchFixture(
      new InvalidNotificationRecipientError(),
    );

    await service.dispatch('event-1');

    expect(tx.deviceToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'device-1',
        user_id: 'user-1',
        token: 'registration-token',
        is_active: true,
      },
      data: {
        is_active: false,
        deactivated_at: expect.any(Date) as Date,
      },
    });
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(prisma.notificationEvent.updateMany).toHaveBeenCalled();
  });

  it('retries a transient failure and does not mark the event processed', async () => {
    const error = new NotificationDeliveryError('FCM_UNAVAILABLE', true);
    const { service, tx, prisma } = dispatchFixture(error);

    await expect(service.dispatch('event-1')).rejects.toBe(error);

    expect(tx.notificationLog.update).toHaveBeenCalledWith({
      where: { id: 'log-push' },
      data: {
        status: 'failed',
        error: 'FCM_UNAVAILABLE',
        error_code: 'FCM_UNAVAILABLE',
        lease_until: null,
      },
    });
    expect(prisma.notificationEvent.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a token active for payload INVALID_ARGUMENT', async () => {
    const error = new NotificationDeliveryError('FCM_INVALID_ARGUMENT', false);
    const { service, tx, prisma } = dispatchFixture(error);

    await service.dispatch('event-1');

    expect(tx.deviceToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.notificationEvent.updateMany).toHaveBeenCalled();
  });

  it('rechecks ownership and session eligibility immediately before send', async () => {
    const { service, tx, push } = dispatchFixture(undefined, false);

    await service.dispatch('event-1');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
  });

  it('atomically claims a delivery so concurrent workers send once', async () => {
    const { service, tx, push } = dispatchFixture();
    tx.notificationLog.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await Promise.all([
      service.dispatch('event-1'),
      service.dispatch('event-1'),
    ]);

    expect(push.send).toHaveBeenCalledTimes(1);
  });
});

function dispatchFixture(failure?: Error, eligibleAtSend = true) {
  const token = {
    id: 'device-1',
    user_id: 'user-1',
    session_id: 'session-1',
    token: 'registration-token',
    platform: 'ios',
    locale: 'en',
    last_seen_at: new Date(),
  };
  const tx = dispatchTransaction(eligibleAtSend);
  const event = {
    id: 'event-1',
    user_id: 'user-1',
    type: 'order_placed',
    target_role: 'customer',
    entity_type: 'order',
    entity_id: '11111111-1111-4111-8111-111111111111',
    title_ar: 'ar',
    body_ar: 'ar',
    title_en: 'en',
    body_en: 'en',
    is_test: false,
    target_device_ids: [],
    processed_at: null,
    user: { phone: null, is_active: true },
  };
  const prisma = Object.assign(transactionPrisma(tx), {
    $queryRaw: jest.fn().mockResolvedValue([token]),
    notificationEvent: {
      findUnique: jest.fn().mockResolvedValue(event),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
    notificationChannelPreference: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ channel: 'sms', enabled: false }]),
    },
  });
  const push = {
    send: failure
      ? jest.fn().mockRejectedValue(failure)
      : jest.fn().mockResolvedValue({ messageId: 'message-1' }),
  };
  return {
    service: makeService(prisma, { push }),
    tx,
    prisma,
    push,
  };
}

function dispatchTransaction(eligibleAtSend: boolean) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest
      .fn()
      .mockResolvedValue(eligibleAtSend ? [{ id: 'device-1' }] : []),
    notificationLog: {
      upsert: jest.fn().mockResolvedValue({
        id: 'log-push',
        status: 'queued',
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    deviceToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

function transactionPrisma(tx: object) {
  return {
    $transaction: jest.fn((input: unknown) => {
      if (Array.isArray(input)) return Promise.all(input);
      return (input as (client: typeof tx) => unknown)(tx);
    }),
  };
}

function makeService(
  prisma: object,
  overrides: {
    audit?: object;
    push?: object;
    sms?: object;
  } = {},
) {
  return new NotificationsService(
    prisma as never,
    (overrides.audit ?? { record: jest.fn() }) as never,
    {} as never,
    (overrides.push ?? {
      send: jest.fn().mockResolvedValue({ messageId: 'push-1' }),
    }) as never,
    (overrides.sms ?? {
      send: jest.fn().mockResolvedValue({ messageId: 'sms-1' }),
    }) as never,
  );
}
