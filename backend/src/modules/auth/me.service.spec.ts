jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UserSelfUpdateDto } from './dto/user-self-update.dto';
import { MeController } from './me.controller';
import { MeService } from './me.service';

const storedUser = {
  id: 'current-user',
  name: 'Updated Customer',
  phone: '+9647700000000',
  email: 'updated@example.com',
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
  role: {
    name: 'customer',
    role_permissions: [
      { permission: { key: 'orders.create' } },
      { permission: { key: 'returns.create' } },
    ],
  },
};

describe('MeService', () => {
  const findUniqueOrThrow = jest.fn().mockResolvedValue(storedUser);
  const update = jest.fn().mockResolvedValue(storedUser);
  const service = new MeService(
    {
      user: { findUniqueOrThrow, update },
    } as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('loads the current profile with role permissions', async () => {
    await expect(service.getCurrentUser('current-user')).resolves.toEqual(
      expect.objectContaining({
        id: 'current-user',
        role: 'customer',
        permissions: ['orders.create', 'returns.create'],
      }),
    );
    expect(findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'current-user' } }),
    );
  });

  it('updates only the authenticated user and only self-service fields', async () => {
    const result = await service.updateCurrentUser('current-user', {
      name: '  Updated Customer  ',
      email: '  updated@example.com  ',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'current-user' },
        data: {
          name: 'Updated Customer',
          email: 'updated@example.com',
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'current-user',
        phone: '+9647700000000',
        role: 'customer',
        permissions: ['orders.create', 'returns.create'],
      }),
    );
  });

  it('rejects an empty update', async () => {
    await expect(service.updateCurrentUser('current-user', {})).rejects.toThrow(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects phone changes at the request boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        { phone: '+9647800000000' },
        { type: 'body', metatype: UserSelfUpdateDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('MeController', () => {
  it('takes the update target from the authenticated request', async () => {
    const updateCurrentUser = jest.fn().mockResolvedValue(storedUser);
    const controller = new MeController({ updateCurrentUser } as never);

    await controller.updateCurrentUser(
      {
        user: {
          id: 'current-user',
          role: 'customer',
          permissions: [],
        },
      } as never,
      { name: 'Updated Customer' },
    );

    expect(updateCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'current-user' }),
      {
        name: 'Updated Customer',
      },
    );
  });

  it('takes the account-deletion target from the authenticated request', async () => {
    const deleteCustomerAccount = jest.fn().mockResolvedValue(undefined);
    const controller = new MeController({ deleteCustomerAccount } as never);

    await controller.deleteAccount({ user: { id: 'current-user' } } as never);

    expect(deleteCustomerAccount).toHaveBeenCalledWith('current-user');
  });
});

describe('MeService account deletion', () => {
  function makeService(blockers = [0, 0, 0, 0]) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'current-user' }]),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'current-user',
          name: 'Customer',
          phone: '+9647700000000',
          email: 'customer@example.com',
          is_active: true,
          anonymized_at: null,
          role: { name: 'customer' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      order: { count: jest.fn().mockResolvedValue(blockers[0]) },
      return: { count: jest.fn().mockResolvedValue(blockers[1]) },
      refundLedgerEntry: { count: jest.fn().mockResolvedValue(blockers[2]) },
      deliveryCollection: { count: jest.fn().mockResolvedValue(blockers[3]) },
      address: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      notificationEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationLog: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      deviceToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      otpCode: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    return {
      tx,
      audit,
      service: new MeService(prisma as never, audit),
    };
  }

  it('refuses deletion with a stable code and every blocker', async () => {
    const { service, tx } = makeService([2, 1, 1, 1]);

    await expect(
      service.deleteCustomerAccount('current-user'),
    ).rejects.toMatchObject({
      response: {
        code: 'ACCOUNT_DELETION_BLOCKED',
        errors: [
          expect.objectContaining({ code: 'OPEN_ORDERS' }),
          expect.objectContaining({ code: 'PENDING_RETURNS' }),
          expect.objectContaining({ code: 'UNSETTLED_AMOUNTS' }),
        ],
      },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('anonymizes identity, releases the phone, removes devices and revokes sessions', async () => {
    const { service, tx, audit } = makeService();

    await service.deleteCustomerAccount('current-user');

    expect(tx.address.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'current-user' },
    });
    expect(tx.notificationEvent.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'current-user', processed_at: null },
      data: { processed_at: expect.any(Date) as Date },
    });
    expect(tx.notificationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: 'current-user' }) as object,
        data: expect.objectContaining({
          status: 'skipped',
          error_code: 'ACCOUNT_DELETED',
        }) as object,
      }),
    );
    expect(tx.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'current-user' },
    });
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'current-user' },
    });
    expect(tx.otpCode.deleteMany).toHaveBeenCalledWith({
      where: { phone: '+9647700000000' },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'current-user' },
      data: expect.objectContaining({
        name: null,
        phone: null,
        email: null,
        is_active: false,
        anonymized_at: expect.any(Date) as Date,
        session_version: { increment: 1 },
      }) as Record<string, unknown>,
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'customer.account_delete' }),
    );
  });
});
