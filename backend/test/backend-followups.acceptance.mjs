import assert from 'node:assert/strict';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(process.env.ACCEPTANCE_DATABASE_NAME ?? '')) {
  throw new Error('Backend-followups acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Backend-followups acceptance requires the runner-owned loopback API');
}

let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

async function request(
  path,
  { token, method = 'GET', body, expected = 200, forwardedFor } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}

async function staffLogin(username, password, forwardedFor, expected = 201) {
  return request('/admin/auth/login', {
    method: 'POST',
    body: { username, password },
    forwardedFor,
    expected,
  });
}

const adminIp = '198.51.100.5';
const adminSession = await staffLogin(
  'admin',
  'Shubayr-Dev-Admin!2026',
  adminIp,
);
const admin = adminSession.access_token;

// Legacy callers still receive arrays when no query string is supplied.
const legacyStaff = await request('/admin/staff', { token: admin });
check(Array.isArray(legacyStaff), true, 'unqueried staff list remains an array');
const staff = await request('/admin/staff?q=operations&status=active&sort=username&dir=desc&page=1&per_page=1', {
  token: admin,
});
check(staff.page, 1, 'staff list is paginated when queried');
check(staff.data[0].username, 'operations', 'staff search runs on the server');

const presets = await request('/admin/presets?kind=system&permission_key=audit.view&sort=permissions&dir=desc&page=1', {
  token: admin,
});
check(presets.total, 1, 'preset filters include the owner preset');
check(presets.data[0].name, 'super_admin', 'audit.view belongs to the owner preset');

const workPhones = await request(
  '/admin/work-phones?q=00000005&role=delivery_agent&status=active&sort=phone&dir=asc&page=1',
  { token: admin },
);
check(workPhones.data.length > 0, true, 'work-phone role filter returns data');
check(
  typeof workPhones.data[0].phone,
  'string',
  'work-phone rows expose top-level phone',
);

// Two real staff members behind the trusted BFF have independent login limits.
const operationsIp = '198.51.100.31';
const catalogIp = '203.0.113.32';
for (let attempt = 0; attempt < 30; attempt += 1) {
  await staffLogin(
    'operations',
    'Shubayr-Dev-Staff!2026',
    operationsIp,
  );
}
await staffLogin(
  'operations',
  'Shubayr-Dev-Staff!2026',
  operationsIp,
  429,
);
await staffLogin('catalog', 'Shubayr-Dev-Staff!2026', catalogIp);

const loginAudit = await request(
  `/admin/audit-logs?action=admin.login&from=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}&page=1&per_page=100`,
  { token: admin },
);
const operationsLogin = loginAudit.data.find(
  (row) => row.actor?.username === 'operations',
);
const catalogLogin = loginAudit.data.find(
  (row) => row.actor?.username === 'catalog',
);
check(operationsLogin.ip, operationsIp, 'first staff audit uses first client IP');
check(catalogLogin.ip, catalogIp, 'second staff audit uses second client IP');

const suffix = Date.now().toString(36);
const created = await request('/admin/staff', {
  token: admin,
  method: 'POST',
  forwardedFor: '192.0.2.44',
  expected: 201,
  body: {
    username: `audit_${suffix}`,
    name: 'Audit IP Verify',
    password: 'Temporary-Audit!2026',
    reason: 'Verify request-scoped audit IP',
  },
});
const mutationAudit = await request(
  `/admin/audit-logs?action=staff.create&entity_type=user&entity_id=${created.id}&actor=admin&page=1`,
  { token: admin },
);
check(mutationAudit.total, 1, 'audit filters identify the mutation');
check(mutationAudit.data[0].ip, '192.0.2.44', 'mutation audit uses resolved client IP');

for (let index = 1; index < loginAudit.data.length; index += 1) {
  const previous = loginAudit.data[index - 1];
  const current = loginAudit.data[index];
  check(
    previous.created_at > current.created_at ||
      (previous.created_at === current.created_at && previous.id > current.id),
    true,
    'audit results use a stable newest-first order',
  );
}

console.log(`Backend-followups acceptance assertions: ${assertions}`);
