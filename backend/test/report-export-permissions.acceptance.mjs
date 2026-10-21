import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error(
    'Report export acceptance requires the disposable *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error(
    'Report export acceptance requires the runner-owned loopback API',
  );
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function ok(value, message) {
  assert.ok(value, message);
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
  const contentType = response.headers.get('content-type') ?? '';
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString('utf8');
  check(response.status, expected, `${method} ${path}: ${text}`);
  return text && contentType.includes('json') ? JSON.parse(text) : bytes;
}

async function login(username) {
  const result = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username, password: 'Shubayr-Dev-Staff!2026' },
  });
  return result.access_token;
}

const admin = await db.query(`SELECT id FROM users WHERE username='admin'`);
const supplier = await db.query(
  `SELECT id FROM suppliers ORDER BY created_at, id LIMIT 1`,
);
ok(admin.rows[0]?.id, 'the reference admin exists');
ok(supplier.rows[0]?.id, 'a supplier exists for the statement export');
const adminId = admin.rows[0].id;
const supplierId = supplier.rows[0].id;

const period = { from: '2025-01-01', to: '2026-10-20' };
const asOf = { as_of: '2026-10-20' };
const cases = [
  {
    report_type: 'sales',
    permission: 'reports.sales.read',
    ...period,
    group_by: 'day',
  },
  {
    report_type: 'profitability',
    permission: 'reports.profit.read',
    ...period,
    group_by: 'product',
  },
  {
    report_type: 'profit_loss',
    permission: 'reports.financial.read',
    ...period,
  },
  {
    report_type: 'trial_balance',
    permission: 'reports.financial.read',
    ...asOf,
  },
  {
    report_type: 'balance_sheet',
    permission: 'reports.financial.read',
    ...asOf,
  },
  { report_type: 'cash', permission: 'reports.cash.read', ...period },
  { report_type: 'delivery_custody', permission: 'reports.cash.read', ...asOf },
  {
    report_type: 'liabilities',
    permission: 'reports.liabilities.read',
    ...asOf,
  },
  {
    report_type: 'inventory_valuation',
    permission: 'reports.inventory.read',
    ...asOf,
  },
  {
    report_type: 'purchases',
    permission: 'reports.purchases.read',
    ...period,
    group_by: 'period',
  },
  {
    report_type: 'supplier_statement',
    permission: 'reports.suppliers.read',
    ...asOf,
    supplier_id: supplierId,
  },
  {
    report_type: 'stock_movement',
    permission: 'reports.stock.read',
    ...period,
  },
  {
    report_type: 'expenses',
    permission: 'reports.expenses.read',
    ...period,
    group_by: 'category',
  },
];

const costReports = new Set([
  'inventory_valuation',
  'purchases',
  'stock_movement',
]);
const tokens = new Map();
for (const permission of new Set(cases.map((item) => item.permission))) {
  const username = `c20a_${permission.replaceAll('.', '_')}`;
  const created = await db.query(
    `INSERT INTO users (username,name,password_hash,must_change_password,is_active)
     SELECT $1,$2,password_hash,FALSE,TRUE FROM users WHERE username='operations'
     RETURNING id`,
    [username, `C20a ${permission}`],
  );
  ok(created.rows[0]?.id, `${permission} test user was created`);
  const userId = created.rows[0].id;
  const grants = [permission];
  if (
    cases.some(
      (item) =>
        item.permission === permission && costReports.has(item.report_type),
    )
  ) {
    grants.push('cost.view');
  }
  await db.query(
    `INSERT INTO user_permission_grants (user_id,permission_id,granted_by,reason)
     SELECT $1,p.id,$2,'C20a report export acceptance'
     FROM permissions p WHERE p.key=ANY($3::text[])`,
    [userId, adminId, grants],
  );
  const held = await db.query(
    `SELECT p.key FROM user_permission_grants g
     JOIN permissions p ON p.id=g.permission_id
     WHERE g.user_id=$1 AND p.key LIKE 'reports.%' ORDER BY p.key`,
    [userId],
  );
  check(
    held.rows.map((row) => row.key),
    [permission],
    `${permission} user has no other report permission`,
  );
  tokens.set(permission, await login(username));
}

const deniedUser = await db.query(
  `INSERT INTO users (username,name,password_hash,must_change_password,is_active)
   SELECT 'c20a_no_reports','C20a no reports',password_hash,FALSE,TRUE
   FROM users WHERE username='operations' RETURNING id`,
);
ok(deniedUser.rows[0]?.id, 'the no-report-permission user was created');
const deniedToken = await login('c20a_no_reports');

for (const item of cases) {
  const { permission, ...input } = item;
  const token = tokens.get(permission);
  const queued = await request('/admin/reports/exports', {
    token,
    method: 'POST',
    expected: 202,
    body: { ...input, format: 'csv', language: 'en' },
  });

  await request('/admin/reports/exports', {
    token: deniedToken,
    method: 'POST',
    expected: 403,
    body: { ...input, format: 'csv', language: 'en' },
  });

  let progress = queued;
  for (
    let attempt = 0;
    attempt < 200 && !['completed', 'failed'].includes(progress.status);
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    progress = await request(`/admin/reports/exports/${queued.id}/progress`, {
      token,
    });
  }
  check(
    progress.status,
    'completed',
    `${item.report_type} export completed: ${progress.last_error ?? ''}`,
  );

  await request(`/admin/reports/exports/${queued.id}/download`, {
    token: deniedToken,
    expected: 403,
  });
  const download = await request(
    `/admin/reports/exports/${queued.id}/download`,
    {
      token,
    },
  );
  ok(
    Buffer.isBuffer(download) && download.length > 0,
    `${item.report_type} export downloads`,
  );
}

await db.end();
console.log(`Report export permission acceptance assertions: ${assertions}`);
