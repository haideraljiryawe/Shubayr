jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

import {
  SmsDeliveryUnavailableException,
  SmsGatewayService,
} from './sms-gateway.service';
import { Logger } from '@nestjs/common';

const phone = '+9647701234567';
const phoneNumber = '9647701234567';
const smsId = 'sms-0123456789abcdef01234567';
const code = '123456';
const apiKey = 'test-key-not-a-real-secret';
const submitted = { smsId, canCover: true };
const sent = {
  smsId,
  phoneNumber,
  status: 'sent',
  isFinalStatus: true,
  lastChannel: 'sms',
  channelFlow: [{ channel: 'sms', tried: true, success: true }],
};
const pending = {
  ...sent,
  status: 'pending',
  isFinalStatus: false,
  channelFlow: [],
};
const unavailable = {
  status: 503,
  response: {
    status: 503,
    code: 'OTP_DELIVERY_UNAVAILABLE',
    message: 'OTP delivery is unavailable',
    errors: [],
  },
};

function service(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    APP_ENV: 'production',
    SMS_PROVIDER: 'otpiq',
    OTPIQ_API_KEY: apiKey,
    OTPIQ_TIMEOUT_MS: 1000,
    ...overrides,
  };
  return new SmsGatewayService({
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as never);
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function failure(
  promise: Promise<unknown>,
): Promise<SmsDeliveryUnavailableException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SmsDeliveryUnavailableException);
    return error as SmsDeliveryUnavailableException;
  }
  throw new Error('Expected OTPIQ delivery to fail');
}

describe('OTPIQ SMS delivery', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('Unexpected outbound request')) as jest.Mock;
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['sent', 'delivered'])(
    'confirms %s through tracking using the same deadline',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(json(submitted))
        .mockResolvedValueOnce(json({ ...sent, status }));
      await expect(service().sendOtp(phone, code)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.otpiq.com/api/sms');
      expect(options).toMatchObject({
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
      });
      expect(JSON.parse(options.body as string)).toEqual({
        phoneNumber,
        smsType: 'verification',
        provider: 'sms',
        verificationCode: code,
      });
      expect(fetchMock.mock.calls[1]).toEqual([
        `https://api.otpiq.com/api/sms/track/${smsId}`,
        expect.objectContaining({
          method: 'GET',
          signal: options.signal,
          redirect: 'error',
        }),
      ]);
    },
  );

  it('waits for pending dispatch without resubmitting the SMS', async () => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockResolvedValueOnce(json(pending))
      .mockResolvedValueOnce(json(sent));
    await expect(service().sendOtp(phone, code)).resolves.toBeUndefined();
    expect(
      fetchMock.mock.calls.map((call: [string, RequestInit]) => call[1].method),
    ).toEqual(['POST', 'GET', 'GET']);
  });

  it('waits for a final status when sent is still non-final', async () => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockResolvedValueOnce(
        json({ ...sent, status: 'sent', isFinalStatus: false }),
      )
      .mockResolvedValueOnce(json({ ...sent, status: 'delivered' }));
    await expect(service().sendOtp(phone, code)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails a queued task at the deadline instead of reporting success', async () => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockImplementation(() => Promise.resolve(json(pending)));
    const error = await failure(
      service({ OTPIQ_TIMEOUT_MS: 25 }).sendOtp(phone, code),
    );
    expect(error.diagnostic).toMatchObject({
      reason: 'OTPIQ tracking deadline expired',
      smsId,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 402, 403, 429, 500, 503])(
    'sanitizes submission HTTP %s without retrying',
    async (status) => {
      fetchMock.mockResolvedValue(
        json({ message: `${apiKey} ${phone} ${code}` }, status),
      );
      const error = await failure(service().sendOtp(phone, code));
      expect(error.diagnostic).toEqual({
        reason: `OTPIQ submission rejected with HTTP ${status}`,
        httpStatus: status,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([401, 404, 429, 500])(
    'sanitizes tracking HTTP %s without resubmitting',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(json(submitted))
        .mockResolvedValueOnce(json({ message: apiKey }, status));
      const error = await failure(service().sendOtp(phone, code));
      expect(error.diagnostic).toEqual({
        reason: `OTPIQ tracking rejected with HTTP ${status}`,
        httpStatus: status,
        smsId,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    null,
    [],
    {},
    { ...submitted, canCover: false },
    { smsId },
    { ...submitted, smsId: '../../other' },
    { ...submitted, smsId: 42 },
  ])('rejects malformed or unfunded submission %#', async (body) => {
    fetchMock.mockResolvedValue(json(body));
    const error = await failure(service().sendOtp(phone, code));
    expect(error.diagnostic.reason).toBe(
      body === null || Array.isArray(body)
        ? 'OTPIQ submission response not an object'
        : 'OTPIQ submission response was invalid or unfunded',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, 'OTPIQ tracking response not an object'],
    [{}, 'OTPIQ tracking smsId mismatch'],
    [
      { ...sent, status: 'failed' },
      'OTPIQ tracking unexpected status failed/true',
    ],
    [
      { ...pending, isFinalStatus: true },
      'OTPIQ tracking unexpected status pending/true',
    ],
    [{ ...sent, smsId: 'sms-other' }, 'OTPIQ tracking smsId mismatch'],
    [
      { ...sent, phoneNumber: '9647709999999' },
      'OTPIQ tracking phone mismatch',
    ],
    [{ ...sent, lastChannel: 'whatsapp' }, 'OTPIQ tracking unexpected channel'],
    [{ ...sent, channelFlow: [] }, 'OTPIQ tracking unexpected channel'],
    [
      {
        ...sent,
        channelFlow: [{ channel: 'sms', tried: true, success: false }],
      },
      'OTPIQ tracking unexpected channel',
    ],
    [
      { ...sent, status: 'unknown' },
      'OTPIQ tracking unexpected status unknown/true',
    ],
    [
      { ...sent, isFinalStatus: undefined },
      'OTPIQ tracking unexpected status sent/invalid',
    ],
  ])('rejects failed or unconfirmed tracking %#', async (body, reason) => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockResolvedValueOnce(json(body));
    const error = await failure(service().sendOtp(phone, code));
    expect(error.diagnostic).toMatchObject({ reason, smsId });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['submission', 'tracking'])(
    'sanitizes %s network errors',
    async (stage) => {
      if (stage === 'tracking')
        fetchMock.mockResolvedValueOnce(json(submitted));
      fetchMock.mockRejectedValueOnce(
        new TypeError(`${apiKey} ${phone} ${code}`),
      );
      const error = await failure(service().sendOtp(phone, code));
      expect(error.diagnostic).toMatchObject({
        reason: `OTPIQ ${stage} transport failure`,
        ...(stage === 'tracking' ? { smsId } : {}),
      });
    },
  );

  it.each(['submission', 'tracking'])(
    'aborts stalled %s at the shared deadline',
    async (stage) => {
      if (stage === 'tracking')
        fetchMock.mockResolvedValueOnce(json(submitted));
      fetchMock.mockImplementationOnce(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal!.addEventListener(
              'abort',
              () => reject(new Error('sensitive timeout detail')),
              { once: true },
            );
          }),
      );
      const error = await failure(
        service({ OTPIQ_TIMEOUT_MS: 25 }).sendOtp(phone, code),
      );
      expect(error.diagnostic).toMatchObject({
        reason: `OTPIQ ${stage} deadline expired`,
        ...(stage === 'tracking' ? { smsId } : {}),
      });
      const [, options] = fetchMock.mock.calls.at(-1)! as [
        unknown,
        RequestInit,
      ];
      expect(options.signal!.aborted).toBe(true);
    },
  );

  it.each(['submission', 'tracking'])(
    'reports invalid JSON at the %s stage',
    async (stage) => {
      if (stage === 'tracking')
        fetchMock.mockResolvedValueOnce(json(submitted));
      fetchMock.mockResolvedValueOnce(
        new Response('<html>upstream error</html>'),
      );
      const error = await failure(service().sendOtp(phone, code));
      expect(error.diagnostic).toMatchObject({
        reason: `OTPIQ ${stage} response JSON invalid`,
        httpStatus: 200,
        ...(stage === 'tracking' ? { smsId } : {}),
      });
    },
  );

  it('lets a dev key track the dashboard phone but still checks smsId', async () => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockResolvedValueOnce(json({ ...sent, phoneNumber: '9647700000000' }));
    await expect(
      service({ OTPIQ_API_KEY: 'sk_dev_test-secret' }).sendOtp(phone, code),
    ).resolves.toBeUndefined();

    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockResolvedValueOnce(
        json({ ...sent, smsId: 'sms-fedcba987654321001234567' }),
      );
    const error = await failure(
      service({ OTPIQ_API_KEY: 'sk_dev_test-secret' }).sendOtp(phone, code),
    );
    expect(error.diagnostic.reason).toBe('OTPIQ tracking smsId mismatch');
  });

  it('keeps the strict tracking phone check for live keys', async () => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockResolvedValueOnce(json({ ...sent, phoneNumber: '9647700000000' }));
    const error = await failure(
      service({ OTPIQ_API_KEY: 'sk_live_test-secret' }).sendOtp(phone, code),
    );
    expect(error.diagnostic.reason).toBe('OTPIQ tracking phone mismatch');
  });

  it('validates tracking-only inputs with fixed reasons', async () => {
    const badId = await failure(service().inspectOtpiqTracking('bad', phone));
    expect(badId.diagnostic.reason).toBe('OTPIQ tracking smsId invalid');
    const badPhone = await failure(
      service().inspectOtpiqTracking(smsId, '07701234567'),
    );
    expect(badPhone.diagnostic).toEqual({
      reason: 'OTPIQ phone not E.164',
      smsId,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns only a safe tracking snapshot', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        ...sent,
        phoneNumber: '9647700000000',
        lastChannel: 'sms',
        channelFlow: [
          { channel: 'sms', tried: true, success: true, raw: phone },
          { channel: '<unsafe>', tried: 'yes', success: null },
        ],
      }),
    );
    await expect(service().inspectOtpiqTracking(smsId, phone)).resolves.toEqual(
      {
        smsId,
        status: 'sent',
        isFinalStatus: true,
        lastChannel: 'sms',
        channelFlow: [
          { channel: 'sms', tried: true, success: true },
          { channel: 'unknown', tried: null, success: null },
        ],
        phoneNumberMatched: false,
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options).toMatchObject({ method: 'GET' });
  });

  it('rejects missing credentials without sending', async () => {
    await expect(
      service({ OTPIQ_API_KEY: '' }).sendOtp(phone, code),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'SMS_NOT_CONFIGURED' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '07701234567',
    '009647701234567',
    '+964 770 1234567',
    '+9647701234567x',
  ])('does not guess or rewrite a noncanonical identity: %s', async (input) => {
    await expect(service().sendOtp(input, code)).rejects.toMatchObject(
      unavailable,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves international numbers already normalized by Flutter', async () => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockResolvedValueOnce(json({ ...sent, phoneNumber: '447911123456' }));
    await service().sendOtp('+447911123456', code);
    const [, options] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const payload = JSON.parse(options.body as string) as {
      phoneNumber: string;
    };
    expect(payload.phoneNumber).toBe('447911123456');
  });

  it.each(['203.0.113.44', '2001:db8::44'])(
    'passes a validated requester IP in the isolated camelCase shape: %s',
    async (requesterIp) => {
      fetchMock
        .mockResolvedValueOnce(json(submitted))
        .mockResolvedValueOnce(json(sent));
      await service().sendOtp(phone, code, requesterIp);
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const payload = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(payload.antiFraud).toEqual({ requesterIp });
      expect(payload).not.toHaveProperty('anti_fraud');
    },
  );

  it('omits anti-fraud rather than sending an unknown IP', async () => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockResolvedValueOnce(json(sent));
    await service().sendOtp(phone, code, 'unknown');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(options.body as string) as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('antiFraud');
  });

  it('logs only a sanitized provider reason, never the key, code or phone', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fetchMock.mockResolvedValue(
      json({ message: `${apiKey} ${phone} ${code}` }, 429),
    );
    await expect(service().sendOtp(phone, code)).rejects.toMatchObject(
      unavailable,
    );
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('HTTP 429');
    expect(logged).not.toContain(apiKey);
    expect(logged).not.toContain(code);
    expect(logged).not.toContain(phone);
    expect(logged).not.toContain(phoneNumber);
  });

  it('never sends real SMS in development, including with otpiq selected', async () => {
    await service({ APP_ENV: 'development' }).sendOtp(phone, '000000');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
