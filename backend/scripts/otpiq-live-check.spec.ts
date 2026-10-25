jest.mock('@nestjs/config', () => ({
  ConfigService: class {
    constructor(private readonly values: Record<string, unknown>) {}
    get(key: string, fallback?: unknown) {
      return this.values[key] ?? fallback;
    }
  },
}));
jest.mock('node:crypto', () => ({ randomInt: () => 654321 }));

import { Logger } from '@nestjs/common';
import { runOtpiqLiveCheck } from './otpiq-live-check';

const phone = '+9647701234567';
const phoneNumber = '9647701234567';
const dashboardPhoneNumber = '9647700000000';
const smsId = 'sms-0123456789abcdef01234567';
const devKey = 'sk_dev_test-secret';

function output() {
  const lines: string[] = [];
  return {
    lines,
    writer: {
      log: (line: unknown) => lines.push(String(line)),
      error: (line: unknown) => lines.push(String(line)),
    },
  };
}

function expectNoSecrets(text: string, key: string) {
  expect(text).not.toContain(key);
  expect(text).not.toContain(phone);
  expect(text).not.toContain(phoneNumber);
  expect(text).not.toContain(dashboardPhoneNumber);
  expect(text).not.toContain('654321');
}

describe('OTPIQ live-check CLI', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the real adapter with mocked HTTP and prints only safe delivery metadata', async () => {
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
            phoneNumber: dashboardPhoneNumber,
            status: 'delivered',
            isFinalStatus: true,
            lastChannel: 'sms',
            channelFlow: [{ channel: 'sms', tried: true, success: true }],
          }),
        ),
      );
    const capture = output();
    await expect(
      runOtpiqLiveCheck(
        ['--phone', phone, '--requester-ip', '2001:db8::7'],
        { OTPIQ_API_KEY: devKey },
        capture.writer,
      ),
    ).resolves.toBe(0);
    const payload = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      phoneNumber: '9647701234567',
      antiFraud: { requesterIp: '2001:db8::7' },
    });
    const text = capture.lines.join('\n');
    expect(text).toContain(smsId);
    expect(text).toContain('remaining credit: 988');
    expect(text).toContain('anti-fraud field: antiFraud.requesterIp');
    expect(text).toContain(
      'note: dev key — delivered to the dashboard dev phone',
    );
    expect(text).not.toContain('verificationCode');
    expectNoSecrets(text, devKey);
  });

  it('prints diagnostics after submission even when the Nest logger is silent', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const liveKey = 'sk_live_test-secret';
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ smsId, canCover: true })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            smsId,
            phoneNumber: dashboardPhoneNumber,
            status: 'sent',
            isFinalStatus: true,
            lastChannel: 'sms',
            channelFlow: [{ channel: 'sms', tried: true, success: true }],
          }),
        ),
      );
    const capture = output();
    await expect(
      runOtpiqLiveCheck(
        ['--phone', phone, '--allow-live'],
        { OTPIQ_API_KEY: liveKey },
        capture.writer,
      ),
    ).resolves.toBe(1);
    const text = capture.lines.join('\n');
    expect(text).toContain('reason: OTPIQ tracking phone mismatch');
    expect(text).toContain('http status: 200');
    expect(text).toContain(`smsId: ${smsId}`);
    expectNoSecrets(text, liveKey);
  });

  it('tracks an existing smsId with one GET and sends no SMS', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          smsId,
          phoneNumber: dashboardPhoneNumber,
          status: 'delivered',
          isFinalStatus: true,
          lastChannel: 'sms',
          channelFlow: [
            { channel: 'whatsapp', tried: true, success: false },
            { channel: 'sms', tried: true, success: true },
          ],
        }),
      ),
    );
    const capture = output();
    await expect(
      runOtpiqLiveCheck(
        ['--phone', phone, '--track', smsId],
        { OTPIQ_API_KEY: 'sk_live_test-secret' },
        capture.writer,
      ),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.otpiq.com/api/sms/track/${smsId}`,
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
    const text = capture.lines.join('\n');
    expect(text).toContain('status: delivered');
    expect(text).toContain('is final status: true');
    expect(text).toContain('last channel: sms');
    expect(text).toContain('whatsapp(tried=true,success=false)');
    expect(text).toContain('phone matched: false');
    expect(text).toContain('anti-fraud field: not sent (track mode)');
    expectNoSecrets(text, 'sk_live_test-secret');
  });

  it('prints safe tracking-only HTTP failures', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('private body', { status: 503 }));
    const capture = output();
    await expect(
      runOtpiqLiveCheck(
        ['--phone', phone, '--track', smsId],
        { OTPIQ_API_KEY: devKey },
        capture.writer,
      ),
    ).resolves.toBe(1);
    const text = capture.lines.join('\n');
    expect(text).toContain('reason: OTPIQ tracking rejected with HTTP 503');
    expect(text).toContain('http status: 503');
    expect(text).toContain(`smsId: ${smsId}`);
    expect(text).not.toContain('private body');
    expectNoSecrets(text, devKey);
  });

  it('refuses live credentials without explicit consent before HTTP', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      runOtpiqLiveCheck(['--phone', phone], {
        OTPIQ_API_KEY: 'sk_live_test-secret',
      }),
    ).rejects.toThrow('--allow-live');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
