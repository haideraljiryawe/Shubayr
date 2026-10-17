import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error('C13 acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('C13 acceptance requires the runner-owned loopback API');
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

async function request(
  path,
  { token, method = 'GET', body, expected = 200 } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}

try {
  const before = await request('/settings');
  for (const key of [
    'store_legal_name_ar',
    'store_legal_name_en',
    'store_address_ar',
    'store_address_en',
    'support_phone',
    'support_whatsapp',
    'support_email',
    'privacy_email',
    'support_hours_ar',
    'support_hours_en',
    'refund_days',
    'policy_effective_date',
  ]) {
    check(before[key], null, `${key} is explicitly null before owner setup`);
  }
  check(
    before.return_window_days,
    14,
    'public settings reuse the existing numeric return window',
  );

  const login = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
  });
  const admin = login.access_token;

  const invalid = await request('/admin/settings', {
    token: admin,
    method: 'PUT',
    expected: 422,
    body: {
      settings: {
        support_phone: '07700000000',
        support_email: 'support-at-example.test',
        refund_days: '-1',
      },
    },
  });
  check(
    invalid.errors.map((entry) => entry.field).sort(),
    [
      'settings.refund_days',
      'settings.support_email',
      'settings.support_phone',
    ],
    'invalid phone, email and negative day settings are all refused',
  );

  const values = {
    store_legal_name_ar: 'شركة شبير للتجارة',
    store_legal_name_en: 'Shubayr Trading LLC',
    store_address_ar: 'بغداد، العراق',
    store_address_en: 'Baghdad, Iraq',
    support_phone: '+9647700000011',
    support_whatsapp: '+9647800000011',
    support_email: 'support@shubayr.example',
    privacy_email: 'privacy@shubayr.example',
    support_hours_ar: 'يومياً من 09:00 إلى 21:00',
    support_hours_en: 'Daily from 09:00 to 21:00',
    refund_days: '7',
    policy_effective_date: '2026-10-17',
  };
  const updated = await request('/admin/settings', {
    token: admin,
    method: 'PUT',
    body: { settings: values },
  });
  for (const [key, value] of Object.entries(values)) {
    check(updated.settings[key], value, `admin settings persist ${key}`);
  }

  const publicSettings = await request('/settings');
  for (const [key, value] of Object.entries(values)) {
    check(
      publicSettings[key],
      key === 'refund_days' ? Number(value) : value,
      `public settings expose ${key}`,
    );
  }
  check(
    publicSettings.return_window_days,
    14,
    'the public return window still comes from return_window_days',
  );

  const audit = (
    await db.query(
      `SELECT after
       FROM audit_logs
       WHERE action = 'settings.update'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
  ).rows[0];
  assert.ok(audit, 'settings update must have an audit row');
  assertions += 1;
  check(
    audit.after.settings.support_phone,
    values.support_phone,
    'settings audit stores the authenticated update result',
  );

  console.log(
    `C13 public settings acceptance: ${assertions} assertions passed`,
  );
} finally {
  await db.end();
}
