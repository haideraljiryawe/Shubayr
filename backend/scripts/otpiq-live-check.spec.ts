jest.mock('@nestjs/config', () => ({
  ConfigService: class {
    constructor(private readonly values: Record<string, unknown>) {}
    get(key: string, fallback?: unknown) {
      return this.values[key] ?? fallback;
    }
  },
}));

import { runOtpiqLiveCheck } from './otpiq-live-check';

describe('OTPIQ live-check CLI', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the real adapter with mocked HTTP and prints only safe delivery metadata', async () => {
    const smsId = 'sms-0123456789abcdef01234567';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            smsId,
            canCover: true,
            cost: 12,
            remainingCredit: 988,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            smsId,
            phoneNumber: '9647701234567',
            status: 'delivered',
            isFinalStatus: true,
            lastChannel: 'sms',
            channelFlow: [{ channel: 'sms', tried: true, success: true }],
          }),
        ),
      );
    const lines: string[] = [];
    await expect(
      runOtpiqLiveCheck(
        ['--phone', '+9647701234567', '--requester-ip', '2001:db8::7'],
        { OTPIQ_API_KEY: 'sk_dev_test-secret' },
        { log: (line) => lines.push(String(line)), error: jest.fn() },
      ),
    ).resolves.toBe(0);
    const payload = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      phoneNumber: '9647701234567',
      antiFraud: { requesterIp: '2001:db8::7' },
    });
    const text = lines.join('\n');
    expect(text).toContain(smsId);
    expect(text).toContain('remaining credit: 988');
    expect(text).not.toContain('sk_dev_test-secret');
    expect(text).not.toMatch(/verificationCode|\b\d{6}\b/);
  });

  it('refuses live credentials without explicit consent before HTTP', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      runOtpiqLiveCheck(['--phone', '+9647701234567'], {
        OTPIQ_API_KEY: 'sk_live_test-secret',
      }),
    ).rejects.toThrow('--allow-live');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
