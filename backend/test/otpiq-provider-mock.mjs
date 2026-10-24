import { appendFileSync } from 'node:fs';

const originalFetch = globalThis.fetch;
const submissions = new Map();
let sequence = 0;

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith('https://api.otpiq.com/api/sms')) {
    return originalFetch(input, init);
  }
  if (init?.method === 'POST') {
    const payload = JSON.parse(String(init.body));
    if (String(payload.phoneNumber).endsWith('9999999')) {
      return new Response(
        JSON.stringify({ message: 'mock provider limit', waitMinutes: 1 }),
        { status: 429 },
      );
    }
    sequence += 1;
    const smsId = `sms-${sequence.toString(16).padStart(24, '0')}`;
    submissions.set(smsId, payload.phoneNumber);
    const path = process.env.OTPIQ_MOCK_CALLS_PATH;
    if (path) {
      appendFileSync(
        path,
        `${JSON.stringify({
          smsId,
          phoneNumber: payload.phoneNumber,
          antiFraud: payload.antiFraud ?? null,
        })}\n`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
    return new Response(
      JSON.stringify({
        message: 'queued',
        smsId,
        remainingCredit: 999,
        cost: 1,
        canCover: true,
        paymentType: 'prepaid',
      }),
    );
  }
  const smsId = decodeURIComponent(url.split('/').at(-1));
  const phoneNumber = submissions.get(smsId);
  return new Response(
    JSON.stringify({
      smsId,
      phoneNumber,
      status: 'sent',
      isFinalStatus: true,
      lastChannel: 'sms',
      channelFlow: [{ channel: 'sms', tried: true, success: true }],
    }),
  );
};
