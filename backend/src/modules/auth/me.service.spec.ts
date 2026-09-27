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
  const service = new MeService({
    user: { findUniqueOrThrow, update },
  } as never);

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
});
