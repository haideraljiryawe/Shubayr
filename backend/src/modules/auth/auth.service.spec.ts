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

import {
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac } from 'node:crypto';
import { AuthService } from './auth.service';
import { SmsGatewayService } from './sms-gateway.service';

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
const otpProtection = {
  reserve: jest.fn().mockResolvedValue({
    resendAfterSeconds: 60,
    release: jest.fn().mockResolvedValue(undefined),
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
  preferred_ui_language: 'ar',
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
      otpProtection as never,
    );

    await expect(
      service.requestOtp({ phone: '+9647700000000' }),
    ).resolves.toEqual({
      otp_sent: true,
      dev_otp: '000000',
      resend_after_seconds: 60,
    });
    expect(sms.sendOtp).toHaveBeenCalledWith(
      '+9647700000000',
      '000000',
      undefined,
    );
    const createInput = createdInput as {
      data: { phone: string; code_hash: string };
    };
    expect(createInput.data.phone).toBe('+9647700000000');
    expect(createInput.data.code_hash).not.toContain('000000');
  });

  it('does not persist or invalidate an OTP when delivery fails', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const create = jest.fn().mockResolvedValue({});
    const transaction = jest.fn();
    const prisma = {
      otpCode: { updateMany, create },
      $transaction: transaction,
    };
    const sms = {
      sendOtp: jest.fn().mockRejectedValue(
        new ServiceUnavailableException({
          code: 'OTP_DELIVERY_UNAVAILABLE',
        }),
      ),
    };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      sms as never,
      otpProtection as never,
    );

    await expect(
      service.requestOtp({ phone: '+9647700000000' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
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
      otpProtection as never,
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
          session_id: id,
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
      otpProtection as never,
    );

    const rotated = await service.refresh({ refresh_token: oldToken });
    expect(typeof rotated.access_token).toBe('string');
    expect(typeof rotated.refresh_token).toBe('string');
    expect(tx.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ session_id: id }) as object,
      }),
    );
    await expect(service.refresh({ refresh_token: oldToken })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lets a concurrent admin refresh continue after another instance rotates first', async () => {
    const id = '22222222-2222-4222-8222-222222222223';
    const sessionId = '33333333-3333-4333-8333-333333333334';
    const adminUser = { ...user, username: 'admin', role: null };
    const oldToken = await jwt.signAsync(
      {
        sub: adminUser.id,
        typ: 'refresh',
        jti: id,
        sid: sessionId,
        surface: 'admin',
        ver: 1,
      },
      { secret: refreshSecret, expiresIn: 3600 },
    );
    const rotatedAt = new Date();
    const original = {
      id,
      session_id: sessionId,
      user_id: adminUser.id,
      token_hash: createHash('sha256').update(oldToken).digest('hex'),
      expires_at: new Date(Date.now() + 3_600_000),
      revoked_at: null,
      created_at: new Date(Date.now() - 60_000),
      surface: 'admin',
      client: null,
      session_version: 1,
      user: adminUser,
    };
    const current = { ...original, revoked_at: rotatedAt };
    const tx = {
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(current),
        findFirst: jest.fn().mockResolvedValue({ id: 'successor' }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue(original),
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
      otpProtection as never,
    );

    const result = await service.refresh({ refresh_token: oldToken });

    expect(result.refresh_token).not.toBe(oldToken);
    expect(tx.refreshToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session_id: sessionId,
          surface: 'admin',
          revoked_at: null,
        }) as object,
      }),
    );
    expect(tx.refreshToken.create).toHaveBeenCalled();
  });

  it('ends one admin session family when a rotated token is replayed after the grace', async () => {
    const id = '22222222-2222-4222-8222-222222222224';
    const sessionId = '33333333-3333-4333-8333-333333333335';
    const adminUser = { ...user, username: 'admin', role: null };
    const oldToken = await jwt.signAsync(
      {
        sub: adminUser.id,
        typ: 'refresh',
        jti: id,
        sid: sessionId,
        surface: 'admin',
        ver: 1,
      },
      { secret: refreshSecret, expiresIn: 3600 },
    );
    const revokeFamily = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue({
          id,
          session_id: sessionId,
          user_id: adminUser.id,
          token_hash: createHash('sha256').update(oldToken).digest('hex'),
          expires_at: new Date(Date.now() + 3_600_000),
          revoked_at: new Date(Date.now() - 31_000),
          created_at: new Date(Date.now() - 60_000),
          surface: 'admin',
          client: null,
          session_version: 1,
          user: adminUser,
        }),
        findFirst: jest.fn(),
        updateMany: revokeFamily,
      },
      $transaction: jest.fn(),
    };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      { sendOtp: jest.fn() } as never,
      otpProtection as never,
    );

    await expect(service.refresh({ refresh_token: oldToken })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(revokeFamily).toHaveBeenCalledWith({
      where: {
        user_id: adminUser.id,
        session_id: sessionId,
        revoked_at: null,
      },
      data: { revoked_at: expect.any(Date) as Date },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('logs out one refresh family and only its bound devices', async () => {
    const tokenId = '22222222-2222-4222-8222-222222222222';
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const token = await jwt.signAsync(
      {
        sub: user.id,
        typ: 'refresh',
        jti: tokenId,
        sid: sessionId,
        surface: 'app',
        client: 'mobile',
        ver: 1,
      },
      { secret: refreshSecret, expiresIn: 3600 },
    );
    const tx = {
      refreshToken: {
        findFirst: jest.fn().mockResolvedValue({
          id: tokenId,
          user_id: user.id,
          session_id: sessionId,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      deviceToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      { sendOtp: jest.fn() } as never,
      otpProtection as never,
    );

    await service.logout({ refresh_token: token });

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ session_id: sessionId }) as Record<
          string,
          unknown
        >,
      }),
    );
    expect(tx.deviceToken.updateMany).toHaveBeenCalledWith({
      where: {
        user_id: user.id,
        session_id: sessionId,
        is_active: true,
      },
      data: { is_active: false, deactivated_at: expect.any(Date) as Date },
    });
  });

  it('rejects an incorrect OTP without creating a user', async () => {
    const prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'otp-id',
          code_hash: 'bad',
          attempt_count: 0,
          consumed_at: null,
        }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ attempt_count: 1, consumed_at: null }]),
    };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      { sendOtp: jest.fn() } as never,
      otpProtection as never,
    );
    await expect(
      service.verifyOtp({ phone: '+9647700000000', code: '000000' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('allows exactly one of two concurrent sends for the same phone', async () => {
    const release = jest.fn().mockResolvedValue(undefined);
    const reserve = jest
      .fn()
      .mockResolvedValueOnce({ resendAfterSeconds: 60, release })
      .mockRejectedValueOnce(
        new HttpException(
          {
            status: 429,
            code: 'OTP_RESEND_TOO_SOON',
            retry_after_seconds: 60,
          },
          429,
        ),
      );
    const sms = { sendOtp: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      otpCode: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      sms as never,
      { reserve } as never,
    );
    const results = await Promise.allSettled([
      service.requestOtp({ phone: '+9647700000000' }, '203.0.113.8'),
      service.requestOtp({ phone: '+9647700000000' }, '203.0.113.8'),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('atomically counts parallel wrong codes and invalidates at the exact limit', async () => {
    let attempts = 0;
    let consumedAt: Date | null = null;
    const otpHash = createHmac('sha256', accessSecret)
      .update('+9647700000000:654321')
      .digest('hex');
    const prisma = {
      otpCode: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'otp-id',
            code_hash: otpHash,
            attempt_count: attempts,
            consumed_at: consumedAt,
          }),
        ),
      },
      $queryRaw: jest.fn(() => {
        if (consumedAt || attempts >= 5) return Promise.resolve([]);
        attempts += 1;
        if (attempts >= 5) consumedAt = new Date();
        return Promise.resolve([
          { attempt_count: attempts, consumed_at: consumedAt },
        ]);
      }),
    };
    const service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      { sendOtp: jest.fn() } as never,
      otpProtection as never,
    );
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.verifyOtp({ phone: '+9647700000000', code: '000000' }),
      ),
    );
    expect(attempts).toBe(5);
    expect(
      results.filter(
        (result) =>
          result.status === 'rejected' &&
          (result.reason as { response?: { code?: string } }).response?.code ===
            'OTP_ATTEMPTS_EXCEEDED',
      ),
    ).toHaveLength(1);
    await expect(
      service.verifyOtp({ phone: '+9647700000000', code: '654321' }),
    ).rejects.toMatchObject({
      response: { code: 'OTP_ATTEMPTS_EXCEEDED', attempts_remaining: 0 },
    });
  });
});

describe('AuthService with OTPIQ (mocked HTTP and database)', () => {
  const phone = '+9647701234567';
  const smsId = 'sms-0123456789abcdef01234567';
  const productionConfig = {
    ...config,
    get: (key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        APP_ENV: 'production',
        SMS_PROVIDER: 'otpiq',
        OTPIQ_API_KEY: 'test-project-key',
        OTPIQ_TIMEOUT_MS: 25,
      };
      return values[key] ?? config.get(key, fallback);
    },
  };
  const tracking = {
    smsId,
    phoneNumber: phone.slice(1),
    status: 'sent',
    isFinalStatus: true,
    lastChannel: 'sms',
    channelFlow: [{ channel: 'sms', tried: true, success: true }],
  };
  afterEach(() => jest.restoreAllMocks());

  function fixture() {
    const create = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      otpCode: { create, updateMany },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    return {
      prisma,
      service: new AuthService(
        prisma as never,
        new JwtService(),
        productionConfig as never,
        new SmsGatewayService(productionConfig as never),
        otpProtection as never,
      ),
    };
  }

  it('stores only the generated code digest after confirmed dispatch and preserves TTL and E.164 identity', async () => {
    const { prisma, service } = fixture();
    let deliveredCode = '';
    const before = Date.now();
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
      if (init?.method === 'POST') {
        const payload = JSON.parse(init.body as string) as {
          verificationCode: string;
        };
        deliveredCode = payload.verificationCode;
        return Promise.resolve(
          new Response(JSON.stringify({ smsId, canCover: true })),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(tracking)));
    });
    await expect(service.requestOtp({ phone })).resolves.toEqual({
      otp_sent: true,
      resend_after_seconds: 60,
    });
    expect(deliveredCode).toMatch(/^\d{6}$/);
    const [{ data }] = prisma.otpCode.create.mock.calls[0] as [
      {
        data: { phone: string; code_hash: string; expires_at: Date };
      },
    ];
    expect(data.phone).toBe(phone);
    expect(data.code_hash).toBe(
      createHmac('sha256', accessSecret)
        .update(`${phone}:${deliveredCode}`)
        .digest('hex'),
    );
    expect(data.expires_at.getTime()).toBeGreaterThanOrEqual(before + 300000);
    expect(data.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 300000);
    expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({
      where: { phone, consumed_at: null },
      data: { consumed_at: expect.any(Date) as Date },
    });
  });

  it.each(['failed', 'pending'])(
    'does not invalidate the previous OTP or issue a usable replacement for %s dispatch',
    async (status) => {
      const { prisma, service } = fixture();
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ smsId, canCover: true })),
        )
        .mockImplementation(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                ...tracking,
                status,
                isFinalStatus: status !== 'pending',
              }),
            ),
          ),
        );
      await expect(service.requestOtp({ phone })).rejects.toMatchObject({
        status: 503,
        response: { code: 'OTP_DELIVERY_UNAVAILABLE' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(prisma.otpCode.updateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects an expired or already consumed OTP without issuing a session', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const transaction = jest.fn();
    const jwt = new JwtService();
    const sign = jest.spyOn(jwt, 'signAsync');
    const service = new AuthService(
      { otpCode: { findFirst }, $transaction: transaction } as never,
      jwt,
      productionConfig as never,
      {} as never,
      otpProtection as never,
    );
    await expect(
      service.verifyOtp({ phone, code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        phone,
        expires_at: { gt: expect.any(Date) as Date },
      },
      orderBy: { created_at: 'desc' },
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it('rejects a concurrent OTP replay when atomic consumption loses', async () => {
    const tx = {
      otpCode: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: { findUnique: jest.fn() },
    };
    const prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'otp-id',
          code_hash: createHmac('sha256', accessSecret)
            .update(`${phone}:123456`)
            .digest('hex'),
          attempt_count: 0,
          consumed_at: null,
        }),
      },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const jwt = new JwtService();
    const sign = jest.spyOn(jwt, 'signAsync');
    const service = new AuthService(
      prisma as never,
      jwt,
      productionConfig as never,
      {} as never,
      otpProtection as never,
    );
    await expect(
      service.verifyOtp({ phone, code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });
});
