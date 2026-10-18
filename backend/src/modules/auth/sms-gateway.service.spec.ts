jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

import { ServiceUnavailableException } from '@nestjs/common';
import { SmsGatewayService } from './sms-gateway.service';

const phone = '+9647700000000';
const code = '123456';

function config(values: Record<string, unknown>) {
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    getOrThrow: jest.fn((key: string) => {
      if (values[key] === undefined) throw new Error(`Missing ${key}`);
      return values[key];
    }),
  };
}

describe('SmsGatewayService', () => {
  const originalFetch = global.fetch;
  const failures: Array<[string, () => Promise<Response>]> = [
    [
      'non-2xx response',
      () => Promise.resolve(new Response('', { status: 500 })),
    ],
    ['network error', () => Promise.reject(new TypeError('network'))],
    [
      'timeout',
      () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    ],
  ];

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns SMS_NOT_CONFIGURED without making a request when disabled', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const service = new SmsGatewayService(
      config({ APP_ENV: 'production', SMS_GATEWAY_URL: 'disabled' }) as never,
    );

    await expect(service.sendOtp(phone, code)).rejects.toMatchObject({
      response: { code: 'SMS_NOT_CONFIGURED' },
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(failures)(
    'maps a %s to OTP_DELIVERY_UNAVAILABLE',
    async (_name, result) => {
      const fetchMock = jest.fn(result);
      global.fetch = fetchMock;
      const service = new SmsGatewayService(
        config({
          APP_ENV: 'production',
          SMS_GATEWAY_URL: 'https://sms.example.test/send',
          SMS_GATEWAY_TOKEN: 'secret-token',
          SMS_GATEWAY_TIMEOUT_MS: 7_500,
        }) as never,
      );

      await expect(service.sendOtp(phone, code)).rejects.toMatchObject({
        response: { code: 'OTP_DELIVERY_UNAVAILABLE' },
        status: 503,
      });
    },
  );

  it('sends successfully with a configured abort signal', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
    const service = new SmsGatewayService(
      config({
        APP_ENV: 'production',
        SMS_GATEWAY_URL: 'https://sms.example.test/send',
        SMS_GATEWAY_TOKEN: 'secret-token',
        SMS_GATEWAY_TIMEOUT_MS: 7_500,
      }) as never,
    );

    await expect(service.sendOtp(phone, code)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sms.example.test/send',
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  it('does not remap its own structured errors', async () => {
    const service = new SmsGatewayService(
      config({ APP_ENV: 'production', SMS_GATEWAY_URL: 'disabled' }) as never,
    );
    await expect(service.sendOtp(phone, code)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
