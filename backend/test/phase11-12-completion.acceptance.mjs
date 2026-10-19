import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error('C15 acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('C15 acceptance requires the runner-owned loopback API');
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
  { token, method = 'GET', body, key, expected = 200 } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get('content-type') ?? '';
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString('utf8');
  const payload = text && type.includes('json') ? JSON.parse(text) : bytes;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}
async function login(username, password) {
  return (
    await request('/admin/auth/login', {
      method: 'POST',
      expected: 201,
      body: { username, password },
    })
  ).access_token;
}
function key(label) {
  return `c15-${label}-${randomUUID()}`;
}
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const boundary = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
check(
  boundary.format(new Date('2026-10-17T20:59:59.999Z')),
  '2026-10-17',
  'the instant before Baghdad midnight stays on the prior business date',
);
check(
  boundary.format(new Date('2026-10-17T21:00:00.000Z')),
  '2026-10-18',
  'Baghdad midnight starts the next business date',
);

const admin = await login('admin', 'Shubayr-Dev-Admin!2026');
const operations = await login('operations', 'Shubayr-Dev-Staff!2026');
const publicSettings = await request('/settings');
check(
  publicSettings.return_window_days,
  14,
  'return window is required reference data',
);

await db.query(`
  INSERT INTO users (id,name,username,password_hash,is_active)
  SELECT gen_random_uuid(),'C15 Approver','c15-approver',password_hash,TRUE
  FROM users WHERE username='admin' ON CONFLICT (username) DO NOTHING
`);
await db.query(`
  INSERT INTO user_presets (user_id,preset_id,assigned_by,reason)
  SELECT approver.id,preset.id,admin.id,'C15 separation-of-duties approver'
  FROM users approver CROSS JOIN permission_presets preset CROSS JOIN users admin
  WHERE approver.username='c15-approver' AND preset.name='super_admin'
    AND admin.username='admin' ON CONFLICT DO NOTHING
`);
const approver = await login('c15-approver', 'Shubayr-Dev-Admin!2026');

for (const path of [
  `/admin/reports/purchases?from=${today}&to=${today}`,
  `/admin/reports/stock-movement?from=${today}&to=${today}`,
  `/admin/reports/expenses?from=${today}&to=${today}`,
  '/admin/owner-transactions',
]) {
  await request(path, { token: operations, expected: 403 });
}

const options = await request(
  `/admin/expenses/form-options?currency_code=IQD&document_date=${today}`,
  { token: admin },
);
const rent = options.categories.find((row) => row.name_en === 'Rent');
const cash = options.cash_accounts[0];
ok(rent && cash, 'expense category and cash account reference data exist');

const prepaid = await request('/admin/expenses', {
  token: admin,
  method: 'POST',
  key: key('prepaid-create'),
  expected: 201,
  body: {
    category_id: rent.id,
    amount: '6000',
    currency_code: 'IQD',
    payment_mode: 'paid_now',
    recognition_mode: 'prepaid',
    prepaid_schedule: { start_date: '2026-08-31', periods: 3 },
    cash_account_id: cash.id,
    payee: 'C15 Landlord',
    description: 'Three-month prepaid rent',
    document_date: today,
  },
});
check(
  prepaid.prepaid_schedule.installments.map((row) =>
    row.scheduled_date.slice(0, 10),
  ),
  ['2026-08-31', '2026-09-30', '2026-10-31'],
  'prepaid schedule crosses month boundaries with end-of-month clamping',
);
await request(`/admin/expenses/${prepaid.id}/post`, {
  token: admin,
  method: 'POST',
  key: key('prepaid-post'),
  body: { note: 'Post prepaid schedule' },
});
let caughtUp;
for (let attempt = 0; attempt < 100; attempt += 1) {
  caughtUp = await request(`/admin/expenses/${prepaid.id}`, { token: admin });
  if (Number(caughtUp.prepaid_schedule.recognized_iqd) >= 4000) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
check(
  Number(caughtUp.prepaid_schedule.recognized_iqd),
  4000,
  'worker catches up both missed monthly installments exactly once',
);
check(
  caughtUp.prepaid_schedule.installments.filter(
    (row) => row.status === 'posted',
  ).length,
  2,
  'catch-up posts each due installment once',
);

await db.query(
  `INSERT INTO accounting_periods (month,status,closed_at,closed_by)
   VALUES ('2026-07-01','closed',now(),(SELECT id FROM users WHERE username='admin'))
   ON CONFLICT (month) DO UPDATE SET status='closed',closed_at=now(),closed_by=EXCLUDED.closed_by`,
);
const blocked = await request('/admin/expenses', {
  token: admin,
  method: 'POST',
  key: key('blocked-create'),
  expected: 201,
  body: {
    category_id: rent.id,
    amount: '3000',
    currency_code: 'IQD',
    payment_mode: 'paid_now',
    recognition_mode: 'prepaid',
    prepaid_schedule: { start_date: '2026-07-15', periods: 3 },
    cash_account_id: cash.id,
    payee: 'Closed period fixture',
    description: 'Closed period schedule',
    document_date: today,
  },
});
await request(`/admin/expenses/${blocked.id}/post`, {
  token: admin,
  method: 'POST',
  key: key('blocked-post'),
  body: { note: 'Post schedule that reaches a closed period' },
});
let blockedDetail;
for (let attempt = 0; attempt < 100; attempt += 1) {
  blockedDetail = await request(`/admin/expenses/${blocked.id}`, {
    token: admin,
  });
  if (blockedDetail.prepaid_schedule.status === 'blocked') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
check(
  blockedDetail.prepaid_schedule.status,
  'blocked',
  'closed period blocks automatic recognition',
);
check(
  blockedDetail.prepaid_schedule.installments[0].last_error,
  'EXPENSE_PREPAID_PERIOD_CLOSED',
  'blocked installment exposes a stable closed-period reason',
);
const cancelled = await request(
  `/admin/expenses/${blocked.id}/prepaid-schedule/cancel`,
  {
    token: admin,
    method: 'POST',
    key: key('cancel'),
    body: { reason: 'Cancel unused prepaid service', document_date: today },
  },
);
check(
  cancelled.prepaid_schedule.status,
  'cancelled',
  'remaining schedule is cancellable by correction',
);
check(
  Number(cancelled.prepaid_schedule.cancelled_iqd),
  3000,
  'cancellation corrects the exact remaining asset',
);

await request('/admin/settings', {
  token: admin,
  method: 'PUT',
  body: { settings: { separation_of_duties_level: 'strict' } },
});
const capital = await request('/admin/owner-transactions', {
  token: admin,
  method: 'POST',
  key: key('capital-create'),
  expected: 201,
  body: {
    kind: 'capital_deposit',
    cash_account_id: cash.id,
    currency_code: 'IQD',
    amount: '10000',
    document_date: today,
    reason: 'Owner capital contribution',
  },
});
await request(`/admin/owner-transactions/${capital.id}/post`, {
  token: admin,
  method: 'POST',
  key: key('capital-self-post'),
  expected: 403,
  body: { note: 'Self approval must fail' },
});
const postedCapital = await request(
  `/admin/owner-transactions/${capital.id}/post`,
  {
    token: approver,
    method: 'POST',
    key: key('capital-post'),
    body: { note: 'Independent owner capital approval' },
  },
);
check(
  postedCapital.status,
  'posted',
  'independent approver posts owner capital',
);
check(
  postedCapital.journal_entry.lines.reduce(
    (sum, line) => sum + Number(line.debit_base) - Number(line.credit_base),
    0,
  ),
  0,
  'owner capital journal balances',
);
const drawing = await request('/admin/owner-transactions', {
  token: admin,
  method: 'POST',
  key: key('drawing-create'),
  expected: 201,
  body: {
    kind: 'drawing',
    cash_account_id: cash.id,
    currency_code: 'IQD',
    amount: '1000',
    document_date: today,
    reason: 'Owner drawing',
  },
});
const postedDrawing = await request(
  `/admin/owner-transactions/${drawing.id}/post`,
  {
    token: approver,
    method: 'POST',
    key: key('drawing-post'),
    body: { note: 'Independent owner drawing approval' },
  },
);
check(postedDrawing.status, 'posted', 'owner drawing posts');

const cashRows = await db.query(
  `SELECT id FROM cash_accounts WHERE is_active AND currency_code='IQD' ORDER BY id LIMIT 2`,
);
if (cashRows.rows.length === 2) {
  const transfer = await request('/admin/cash-transfers', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: key('cash-transfer'),
      from_account_id: cashRows.rows[0].id,
      to_account_id: cashRows.rows[1].id,
      amount: '100',
      reason: 'C15 existing phase-3 transfer reuse',
      document_date: today,
    },
  });
  check(
    transfer.status,
    'posted',
    'existing balanced cash-transfer flow is reused',
  );
}

const supplier = await db.query(`SELECT id FROM suppliers ORDER BY id LIMIT 1`);
ok(supplier.rows[0]?.id, 'supplier report fixture exists');
const reportPaths = [
  `/admin/reports/purchases?from=2025-01-01&to=${today}&group_by=sku&per_page=100`,
  `/admin/reports/supplier-statement?supplier_id=${supplier.rows[0].id}&as_of=${today}&per_page=100`,
  `/admin/reports/stock-movement?from=2025-01-01&to=${today}&per_page=100`,
  `/admin/reports/expenses?from=2025-01-01&to=${today}&group_by=category&per_page=100`,
];
const timings = new Map(reportPaths.map((path) => [path, []]));
for (let pass = 0; pass < 10; pass += 1) {
  for (const path of reportPaths) {
    const started = performance.now();
    const report = await request(path, { token: admin });
    const elapsed = performance.now() - started;
    timings.get(path).push(elapsed);
    ok(
      elapsed < 2000,
      `${path} answers within 2 seconds (${elapsed.toFixed(1)} ms)`,
    );
    check(report.currency, 'IQD', 'report identifies exact base currency');
    ok(
      'touches_open_period' in report,
      'report marks whether it touches an open period',
    );
    ok(
      report.totals && report.pagination,
      'report uses DB-side totals and pagination',
    );
    if (report.data.length)
      ok(report.data[0].drilldown, 'report row exposes drill-down parameters');
  }
}
const expenseReport = await request(
  `/admin/reports/expenses?from=2025-01-01&to=${today}&group_by=category&per_page=100`,
  { token: admin },
);
ok(
  Number(expenseReport.totals.prepaid_amortisation_iqd) >= 4000,
  'expense report includes posted prepaid amortisation',
);
const recognizedLedger = await db.query(
  `
  SELECT COALESCE(SUM(jl.debit_base-jl.credit_base),0)::text amount
  FROM journal_entries je JOIN journal_lines jl ON jl.entry_id=je.id
  JOIN expense_categories ec ON ec.ledger_account_id=jl.account_id
  WHERE je.accounting_date BETWEEN '2025-01-01' AND $1
`,
  [today],
);
check(
  Number(expenseReport.totals.total_iqd),
  Number(recognizedLedger.rows[0].amount),
  'expense report reconciles to posted expense-account ledger lines',
);

const queued = await request('/admin/reports/exports', {
  token: admin,
  method: 'POST',
  expected: 202,
  body: {
    report_type: 'expenses',
    format: 'csv',
    language: 'ar',
    from: '2025-01-01',
    to: today,
    group_by: 'category',
  },
});
let progress = queued;
for (
  let attempt = 0;
  attempt < 100 && !['completed', 'failed'].includes(progress.status);
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  progress = await request(`/admin/reports/exports/${queued.id}/progress`, {
    token: admin,
  });
}
check(
  progress.status,
  'completed',
  `new report export completed: ${progress.last_error ?? ''}`,
);
const csv = await request(`/admin/reports/exports/${queued.id}/download`, {
  token: admin,
});
check(
  [...csv.subarray(0, 3)],
  [0xef, 0xbb, 0xbf],
  'Arabic CSV export has a UTF-8 BOM',
);
ok(
  csv.toString('utf8').includes('إطفاء المصروف المقدم'),
  'Arabic export has localized prepaid heading',
);

const audits = await db.query(
  `SELECT after->>'report' report FROM audit_logs WHERE actor_id=(SELECT id FROM users WHERE username='admin') AND action='report.read'`,
);
const audited = new Set(audits.rows.map((row) => row.report));
for (const report of [
  'purchases',
  'supplier_statement',
  'stock_movement',
  'expenses',
]) {
  ok(audited.has(report), `${report} reads are audited`);
}

await request('/admin/settings', {
  token: admin,
  method: 'PUT',
  body: { settings: { separation_of_duties_level: 'standard' } },
});
await db.end();
const timingSummary = [...timings.entries()]
  .map(([path, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return `${path.split('?')[0]} min/median/max ${sorted[0].toFixed(1)}/${((sorted[4] + sorted[5]) / 2).toFixed(1)}/${sorted.at(-1).toFixed(1)} ms`;
  })
  .join('; ');
console.log(
  `C15 acceptance assertions: ${assertions}; 10-pass timings: ${timingSummary}`,
);
