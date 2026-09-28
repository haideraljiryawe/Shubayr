jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class {
    signAsync(payload: object): Promise<string> {
      return Promise.resolve(
        `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`,
      );
    }

    verifyAsync<T>(token: string): Promise<T> {
      return Promise.resolve(
        JSON.parse(
          Buffer.from(token.split('.')[1], 'base64url').toString(),
        ) as T,
      );
    }
  },
}));

import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac } from 'node:crypto';
import { AuthService } from './auth.service';

const accessSecret = 'access-secret-at-least-thirty-two-characters';
const refreshSecret = 'refresh-secret-at-least-thirty-two-characters';
const config = {
  get: jest.fn((key: string, fallback?: unknown) => {
    const values: Record<string, unknown> = {
      APP_ENV: 'development',
      DEV_OTP: '000000',
      OTP_TTL_SECONDS: 300,
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '30d',
    };
    return values[key] ?? fallback;
  }),
  getOrThrow: jest.fn((key: string) => {
    if (key === 'JWT_SECRET') return accessSecret;
    if (key === 'JWT_REFRESH_SECRET') return refreshSecret;
    throw new Error(`Unexpected config key ${key}`);
  }),
};

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  name: null,
  phone: '+9647700000000',
  username: null,
  email: null,
  is_active: true,
  must_change_password: false,
  failed_login_attempts: 0,
  locked_until: null,
  session_version: 1,
  permission_version: 1,
  work_profile: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  role: {
    name: 'customer',
  },
};

describe('AuthService', () => {
  const jwt = new JwtService();

  it('persists a one-time development OTP and returns it only in development', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    let createdInput: unknown;
    const create = jest.fn((input: unknown) => {
      createdInput = input;
      return Promise.resolve({});
    });
    const prisma = {
      otpCode: { updateMany, create },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const sms = { sendOtp: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      sms as never,
    );

    await expect(
      service.requestOtp({ phone: '+9647700000000' }),
    ).resolves.toEqual({ otp_sent: true, dev_otp: '000000' });
    expect(sms.sendOtp).toHaveBeenCalledWith('+9647700000000', '000000');
    const createInput = createdInput as {
      data: { phone: string; code_hash: string };
    };
    expect(createInput.data.phone).toBe('+9647700000000');
    expect(createInput.data.code_hash).not.toContain('000000');
  });

  it('consumes a valid OTP, creates a customer, and persists a refresh digest', async () => {
    const otpHash = createHmac('sha256', accessSecret)
      .update('+9647700000000:000000')
      .digest('hex');
    let createdRefreshInput: unknown;
    const refreshCreate = jest.fn((input: unknown) => {
      createdRefreshInput = input;
      return Promise.resolve({});
    });
    const tx = {
      otpCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-role' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(user),
      },
    };
    const prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'otp-id',
          code_hash: otpHash,
        }),
      },
      refreshToken: { create: refreshCreate },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      { sendOtp: jest.fn() } as never,
    );

    const result = await service.verifyOtp({
      phone: '+9647700000000',
      code: '000000',
    });

    expect(result.user).toEqual(
      expect.objectContaining({
        role: 'customer',
        permissions: [],
        surface: 'app',
      }),
    );
    expect(result.access_token).not.toEqual(result.refresh_token);
    const refreshInput = createdRefreshInput as {
      data: { user_id: string; token_hash: string };
    };
    expect(refreshInput.data.user_id).toBe(user.id);
    expect(refreshInput.data.token_hash).not.toContain(result.refresh_token);
  });

  it('rotates a valid refresh token and rejects its replay', async () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const oldToken = await jwt.signAsync(
      {
        sub: user.id,
        typ: 'refresh',
        jti: id,
        surface: 'app',
        client: 'mobile',
        ver: 1,
      },
      { secret: refreshSecret, expiresIn: 3600 },
    );
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const tx = {
      refreshToken: { updateMany, create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue({
          id,
          user_id: user.id,
          token_hash: createHash('sha256').update(oldToken).digest('hex'),
          expires_at: new Date(Date.now() + 3_600_000),
          revoked_at: null,
          surface: 'app',
          client: 'mobile',
          session_version: 1,
          user,
        }),
      },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      { sendOtp: jest.fn() } as never,
    );

    const rotated = await service.refresh({ refresh_token: oldToken });
    expect(typeof rotated.access_token).toBe('string');
    expect(typeof rotated.refresh_token).toBe('string');
    await expect(service.refresh({ refresh_token: oldToken })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an incorrect OTP without creating a user', async () => {
    const prisma = {
      otpCode: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'otp-id', code_hash: 'bad' }),
      },
    };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      { sendOtp: jest.fn() } as never,
    );
    await expect(
      service.verifyOtp({ phone: '+9647700000000', code: '000000' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
