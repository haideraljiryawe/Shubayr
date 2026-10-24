jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

const evalMock = jest.fn();
const quitMock = jest.fn().mockResolvedValue('OK');
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    eval: evalMock,
    quit: quitMock,
  })),
}));

import { OtpProtectionService } from './otp-protection.service';

const values: Record<string, unknown> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/shubayr_test',
  REDIS_URL: 'redis://localhost:6379',
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_PHONE_WINDOW_MAX: 3,
  OTP_PHONE_WINDOW_SECONDS: 600,
  OTP_PHONE_DAILY_MAX: 10,
  OTP_IP_HOURLY_MAX: 60,
  OTPIQ_TIMEOUT_MS: 10_000,
  SMS_GATEWAY_TIMEOUT_MS: 10_000,
};

function service() {
  return new OtpProtectionService({
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    getOrThrow: (key: string) => values[key],
  } as never);
}

describe('OtpProtectionService', () => {
  beforeEach(() => evalMock.mockReset());

  it.each([
    [1, 'OTP_RESEND_TOO_SOON'],
    [2, 'OTP_PHONE_QUOTA_EXCEEDED'],
    [3, 'OTP_IP_QUOTA_EXCEEDED'],
  ])('maps Redis outcome %s to %s with a retry time', async (outcome, code) => {
    evalMock.mockResolvedValue([outcome, 12_001]);
    await expect(
      service().reserve('+9647701234567', '203.0.113.4'),
    ).rejects.toMatchObject({
      status: 429,
      response: {
        code,
        retry_after_seconds: 13,
        message_ar: expect.any(String) as string,
        message_en: expect.any(String) as string,
      },
    });
  });

  it.each(['203.0.113.4', '2001:db8::4'])(
    'accepts %s while hashing phone and IP Redis keys',
    async (ip) => {
      evalMock.mockResolvedValueOnce([0, 60_000]).mockResolvedValueOnce(1);
      const reservation = await service().reserve('+9647701234567', ip);
      const args = evalMock.mock.calls[0] as unknown[];
      expect(args.join(' ')).not.toContain('+9647701234567');
      expect(args.join(' ')).not.toContain(ip);
      expect(reservation.resendAfterSeconds).toBe(60);
      await reservation.release();
    },
  );

  it('omits an invalid/unknown IP from the shared IP quota', async () => {
    evalMock.mockResolvedValue([0, 60_000]);
    await service().reserve('+9647701234567', 'unknown');
    const keys = (evalMock.mock.calls[0] as unknown[]).slice(2, 7);
    expect(keys[3]).toBe('');
  });

  it('fails closed when Redis is unavailable', async () => {
    evalMock.mockRejectedValue(new Error('redis password and host'));
    await expect(service().reserve('+9647701234567')).rejects.toMatchObject({
      status: 503,
      response: { code: 'OTP_DELIVERY_UNAVAILABLE' },
    });
  });

  it('keeps the reserved cooldown after the request lock is released', async () => {
    evalMock
      .mockResolvedValueOnce([0, 60_000])
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce([1, 55_000]);
    const protection = service();
    const reservation = await protection.reserve('+9647701234567');
    await reservation.release();
    await expect(protection.reserve('+9647701234567')).rejects.toMatchObject({
      response: {
        code: 'OTP_RESEND_TOO_SOON',
        retry_after_seconds: 55,
      },
    });
  });
});
