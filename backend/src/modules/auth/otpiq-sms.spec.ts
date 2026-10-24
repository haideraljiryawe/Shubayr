jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

import { SmsGatewayService } from './sms-gateway.service';

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

  it('fails a queued task at the deadline instead of reporting success', async () => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockImplementation(() => Promise.resolve(json(pending)));
    await expect(
      service({ OTPIQ_TIMEOUT_MS: 25 }).sendOtp(phone, code),
    ).rejects.toMatchObject(unavailable);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 402, 403, 429, 500, 503])(
    'sanitizes submission HTTP %s without retrying',
    async (status) => {
      fetchMock.mockResolvedValue(
        json({ message: `${apiKey} ${phone} ${code}` }, status),
      );
      await expect(service().sendOtp(phone, code)).rejects.toMatchObject(
        unavailable,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([401, 404, 429, 500])(
    'sanitizes tracking HTTP %s without resubmitting',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(json(submitted))
        .mockResolvedValueOnce(json({ message: apiKey }, status));
      await expect(service().sendOtp(phone, code)).rejects.toMatchObject(
        unavailable,
      );
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
    await expect(service().sendOtp(phone, code)).rejects.toMatchObject(
      unavailable,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    {},
    { ...sent, status: 'failed' },
    { ...pending, isFinalStatus: true },
    { ...sent, smsId: 'sms-other' },
    { ...sent, phoneNumber: '9647709999999' },
    { ...sent, lastChannel: 'whatsapp' },
    { ...sent, channelFlow: [] },
    { ...sent, channelFlow: [{ channel: 'sms', tried: true, success: false }] },
    { ...sent, status: 'unknown' },
    { ...sent, isFinalStatus: undefined },
  ])('rejects failed or unconfirmed tracking %#', async (body) => {
    fetchMock
      .mockResolvedValueOnce(json(submitted))
      .mockResolvedValueOnce(json(body));
    await expect(service().sendOtp(phone, code)).rejects.toMatchObject(
      unavailable,
    );
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
      await expect(service().sendOtp(phone, code)).rejects.toMatchObject(
        unavailable,
      );
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
      await expect(
        service({ OTPIQ_TIMEOUT_MS: 25 }).sendOtp(phone, code),
      ).rejects.toMatchObject(unavailable);
      const [, options] = fetchMock.mock.calls.at(-1)! as [
        unknown,
        RequestInit,
      ];
      expect(options.signal!.aborted).toBe(true);
    },
  );

  it('sanitizes invalid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>upstream error</html>'));
    await expect(service().sendOtp(phone, code)).rejects.toMatchObject(
      unavailable,
    );
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

  it('never sends real SMS in development, including with otpiq selected', async () => {
    await service({ APP_ENV: 'development' }).sendOtp(phone, '000000');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
