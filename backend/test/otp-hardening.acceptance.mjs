import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error('OTP acceptance requires a runner-owned disposable database');
}
if (!api) throw new Error('ACCEPTANCE_API_URL is required');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
let assertions = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};

async function request(path, { body, ip = '203.0.113.90', expected = 200 }) {
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  check(response.status, expected, `${path}: ${JSON.stringify(payload)}`);
  return payload;
}

const prefix = `shubayr:otp:${createHash('sha256')
  .update(`/${databaseName}`)
  .digest('hex')
  .slice(0, 16)}`;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const phoneKeys = (phone) => {
  const key = digest(phone);
  return {
    cooldown: `${prefix}:cooldown:${key}`,
    window: `${prefix}:phone-window:${key}`,
    daily: `${prefix}:phone-daily:${key}`,
    lock: `${prefix}:lock:${key}`,
  };
};

await db.connect();
try {
  const concurrentPhone = '+9647701234501';
  const firstSend = request('/auth/request-otp', {
    body: { phone: concurrentPhone },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const concurrent = await Promise.all([
    firstSend,
    request('/auth/request-otp', {
      body: { phone: concurrentPhone },
      expected: 429,
    }),
  ]);
  const success = concurrent.find((value) => value.otp_sent === true);
  const refused = concurrent.find((value) => value.code);
  check(success.resend_after_seconds, 60, 'success exposes resend countdown');
  check(refused.code, 'OTP_RESEND_TOO_SOON', 'parallel send is serialized');
  check(refused.retry_after_seconds > 0, true, 'retry time is positive');

  const failedPhone = '+9647709999999';
  const failed = await request('/auth/request-otp', {
    body: { phone: failedPhone },
    expected: 503,
  });
  check(failed.code, 'OTP_DELIVERY_UNAVAILABLE', 'provider 429 is sanitized');
  const failedRetry = await request('/auth/request-otp', {
    body: { phone: failedPhone },
    expected: 429,
  });
  check(
    failedRetry.code,
    'OTP_RESEND_TOO_SOON',
    'provider failure retains cooldown',
  );

  const delayedTrackingPhone = '+9647701234506';
  const acceptedWhilePending = await request('/auth/request-otp', {
    body: { phone: delayedTrackingPhone },
  });
  check(
    acceptedWhilePending.otp_sent,
    true,
    'funded provider submission is accepted before tracking is final',
  );
  const storedPending = await db.query(
    `SELECT id FROM otp_codes
     WHERE phone = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [delayedTrackingPhone],
  );
  check(
    storedPending.rowCount,
    1,
    'accepted submission stores exactly one usable challenge',
  );
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const delayedCode = '123456';
  const delayedHash = createHmac('sha256', process.env.JWT_SECRET)
    .update(`${delayedTrackingPhone}:${delayedCode}`)
    .digest('hex');
  await db.query(`UPDATE otp_codes SET code_hash = $1 WHERE id = $2`, [
    delayedHash,
    storedPending.rows[0].id,
  ]);
  const delayedVerification = await request('/auth/verify-otp', {
    body: { phone: delayedTrackingPhone, code: delayedCode },
  });
  check(
    typeof delayedVerification.access_token,
    'string',
    'tracking timeout does not invalidate the accepted challenge',
  );

  const phoneQuota = '+9647701234502';
  const now = Date.now();
  const phoneQuotaKeys = phoneKeys(phoneQuota);
  await redis.zadd(
    phoneQuotaKeys.window,
    now - 3000,
    'a',
    now - 2000,
    'b',
    now - 1000,
    'c',
  );
  await redis.pexpire(phoneQuotaKeys.window, 600_000);
  const phoneLimited = await request('/auth/request-otp', {
    body: { phone: phoneQuota },
    expected: 429,
  });
  check(phoneLimited.code, 'OTP_PHONE_QUOTA_EXCEEDED', 'phone window enforced');

  const dailyQuotaPhone = '+9647701234505';
  const dailyQuotaKeys = phoneKeys(dailyQuotaPhone);
  const dailyMembers = Array.from({ length: 10 }, (_, index) => [
    now - 20_000 - index,
    `daily-${index}`,
  ]).flat();
  await redis.zadd(dailyQuotaKeys.daily, ...dailyMembers);
  await redis.pexpire(dailyQuotaKeys.daily, 86_400_000);
  const dailyLimited = await request('/auth/request-otp', {
    body: { phone: dailyQuotaPhone },
    expected: 429,
  });
  check(
    dailyLimited.code,
    'OTP_PHONE_QUOTA_EXCEEDED',
    'rolling 24-hour phone quota enforced',
  );

  const ipQuotaPhone = '+9647701234503';
  const ip = '2001:db8::90';
  const ipKey = `${prefix}:ip-hour:${digest(ip)}`;
  const ipMembers = Array.from({ length: 60 }, (_, index) => [
    now - index,
    `ip-${index}`,
  ]).flat();
  await redis.zadd(ipKey, ...ipMembers);
  await redis.pexpire(ipKey, 3_600_000);
  const ipLimited = await request('/auth/request-otp', {
    body: { phone: ipQuotaPhone },
    ip,
    expected: 429,
  });
  check(
    ipLimited.code,
    'OTP_IP_QUOTA_EXCEEDED',
    'real client IP quota enforced',
  );

  const verifyPhone = '+9647701234504';
  await request('/auth/request-otp', { body: { phone: verifyPhone } });
  const knownCode = '654321';
  const codeHash = createHmac('sha256', process.env.JWT_SECRET)
    .update(`${verifyPhone}:${knownCode}`)
    .digest('hex');
  await db.query(
    `UPDATE otp_codes SET code_hash = $1 WHERE id = (
       SELECT id FROM otp_codes WHERE phone = $2 ORDER BY created_at DESC LIMIT 1
     )`,
    [codeHash, verifyPhone],
  );
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await request('/auth/verify-otp', {
      body: { phone: verifyPhone, code: '000000' },
      expected: 401,
      ip: '203.0.113.91',
    });
    check(
      result.attempts_remaining,
      5 - attempt,
      `wrong attempt ${attempt} returns exact remainder`,
    );
    check(
      result.code,
      attempt === 5 ? 'OTP_ATTEMPTS_EXCEEDED' : 'UNAUTHORIZED',
      `wrong attempt ${attempt} returns stable code`,
    );
  }
  const exhausted = await request('/auth/verify-otp', {
    body: { phone: verifyPhone, code: knownCode },
    expected: 401,
    ip: '203.0.113.91',
  });
  check(
    exhausted.code,
    'OTP_ATTEMPTS_EXCEEDED',
    'exhausted code stays invalid',
  );

  const calls = (await readFile(process.env.OTPIQ_MOCK_CALLS_PATH, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse);
  const concurrentCalls = calls.filter(
    (call) => call.phoneNumber === concurrentPhone.slice(1),
  );
  check(concurrentCalls.length, 1, 'parallel requests issue one provider POST');
  check(
    concurrentCalls[0].antiFraud,
    { requesterIp: '203.0.113.90' },
    'trusted requester IP reaches provider anti-fraud payload',
  );
  check(
    JSON.stringify(calls).includes('verificationCode'),
    false,
    'mock evidence never stores verification codes',
  );
} finally {
  const stream = redis.scanStream({ match: `${prefix}:*`, count: 100 });
  for await (const keys of stream) {
    if (keys.length) await redis.del(...keys);
  }
  await redis.quit();
  await db.end();
}

console.log(`OTP hardening acceptance: ${assertions} assertions`);
