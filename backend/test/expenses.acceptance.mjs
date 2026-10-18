import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error(
    'Expenses acceptance requires the disposable *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Expenses acceptance requires the runner-owned loopback API');
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

async function request(
  path,
  { token, method = 'GET', body, form, key, expected = 200 } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const type = response.headers.get('content-type') ?? '';
  const text = await response.text();
  const payload = text && type.includes('json') ? JSON.parse(text) : text;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}

function key(label) {
  return `expense-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const atBaghdadBoundary = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
check(
  atBaghdadBoundary.format(new Date('2026-10-16T20:59:59.999Z')),
  '2026-10-16',
  'the instant before Baghdad midnight stays on the earlier business date',
);
check(
  atBaghdadBoundary.format(new Date('2026-10-16T21:00:00.000Z')),
  '2026-10-17',
  'Baghdad midnight begins the next business date',
);

const adminLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
});
const operationsLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'operations', password: 'Shubayr-Dev-Staff!2026' },
});
const admin = adminLogin.access_token;
const operations = operationsLogin.access_token;

await client.query(`
  INSERT INTO users (id, name, username, password_hash, is_active)
  SELECT gen_random_uuid(), 'Expense Approver', 'expense-approver', password_hash, TRUE
  FROM users WHERE username = 'admin'
  ON CONFLICT (username) DO NOTHING
`);
await client.query(`
  INSERT INTO user_presets (user_id, preset_id, assigned_by, reason)
  SELECT approver.id, preset.id, admin.id, 'C12 acceptance approver'
  FROM users approver
  CROSS JOIN permission_presets preset
  CROSS JOIN users admin
  WHERE approver.username = 'expense-approver'
    AND preset.name = 'super_admin'
    AND admin.username = 'admin'
  ON CONFLICT DO NOTHING
`);
await client.query(`
  INSERT INTO users (id, name, username, password_hash, is_active)
  SELECT gen_random_uuid(), 'Expense Accountant', 'expense-accountant', password_hash, TRUE
  FROM users WHERE username = 'operations'
  ON CONFLICT (username) DO NOTHING
`);
await client.query(`
  INSERT INTO user_presets (user_id, preset_id, assigned_by, reason)
  SELECT accountant.id, preset.id, admin.id, 'C12 acceptance accountant'
  FROM users accountant
  CROSS JOIN permission_presets preset
  CROSS JOIN users admin
  WHERE accountant.username = 'expense-accountant'
    AND preset.name = 'accountant'
    AND admin.username = 'admin'
  ON CONFLICT DO NOTHING
`);
await client.query(`
  INSERT INTO users (id, name, username, password_hash, is_active)
  SELECT gen_random_uuid(), 'Expense Creator Only', 'expense-creator-only', password_hash, TRUE
  FROM users WHERE username = 'operations'
  ON CONFLICT (username) DO NOTHING
`);
await client.query(`
  INSERT INTO user_permission_grants (user_id, permission_id, granted_by, reason)
  SELECT creator.id, permission.id, admin.id, 'C14c scoped create flow'
  FROM users creator
  CROSS JOIN permissions permission
  CROSS JOIN users admin
  WHERE creator.username = 'expense-creator-only'
    AND permission.key = 'expenses.create'
    AND admin.username = 'admin'
  ON CONFLICT DO NOTHING
`);
const approverLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'expense-approver', password: 'Shubayr-Dev-Admin!2026' },
});
const accountantLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'expense-accountant', password: 'Shubayr-Dev-Staff!2026' },
});
const creatorLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: {
    username: 'expense-creator-only',
    password: 'Shubayr-Dev-Staff!2026',
  },
});
const approver = approverLogin.access_token;
const accountant = accountantLogin.access_token;
const creator = creatorLogin.access_token;

await request('/admin/expenses', { token: operations, expected: 403 });
await request('/admin/expenses', {
  token: operations,
  method: 'POST',
  key: key('denied'),
  expected: 403,
  body: {},
});
await request('/admin/expenses/not-a-uuid', {
  token: accountant,
  expected: 422,
});

const categories = await request('/admin/expense-categories', { token: admin });
check(categories.length >= 11, true, 'common expense categories are seeded');
const rent = categories.find((category) => category.code === 'rent');
const electricity = categories.find(
  (category) => category.code === 'electricity',
);
check(
  Boolean(rent?.ledger_account?.code),
  true,
  'seeded category is mapped to a GL account',
);
const expenseAccounts = await request(
  '/admin/expense-categories/ledger-accounts',
  { token: admin },
);
check(
  expenseAccounts.every(
    (account) =>
      account.id && account.code && account.name_ar && account.name_en,
  ),
  true,
  'category manager can list named expense GL accounts',
);
check(
  expenseAccounts.some((account) => account.id === rent.ledger_account.id),
  true,
  'seeded expense account is available for category mapping',
);

const till = await request('/admin/cash-accounts', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { name: 'C12 IQD Till', kind: 'cash', currency_code: 'IQD' },
});
const usdTill = await request('/admin/cash-accounts', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { name: 'C12 USD Till', kind: 'cash', currency_code: 'USD' },
});
await request('/admin/exchange-rates', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    currency_code: 'USD',
    rate: '1310',
    basis: 1,
    effective_at: new Date().toISOString(),
    reason: 'C12 acceptance rate',
  },
});
const formSupplier = await request('/admin/suppliers', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    name: 'C14c scoped expense supplier',
    default_currency: 'IQD',
    payment_terms_days: 0,
  },
});

for (const path of [
  '/admin/expenses',
  '/admin/cash-accounts',
  '/admin/exchange-rates',
  '/admin/suppliers',
  '/admin/settings',
]) {
  await request(path, { token: creator, expected: 403 });
}
const creatorOptions = await request(
  `/admin/expenses/form-options?currency_code=IQD&document_date=${today}`,
  { token: creator },
);
check(
  Object.keys(creatorOptions.cash_accounts[0]).sort(),
  ['id', 'name'],
  'create-scoped cash picker exposes names without balances',
);
check(
  creatorOptions.categories.some((category) => category.id === rent.id),
  true,
  'create-scoped options include active expense categories',
);
check(
  creatorOptions.suppliers.find((item) => item.id === formSupplier.id),
  { id: formSupplier.id, name: formSupplier.name },
  'create-scoped supplier picker exposes only id and name',
);
check(
  creatorOptions.rate_preview.rate,
  '1',
  'create-scoped options include the current IQD central-rate preview',
);
check(
  creatorOptions.backdating_window_days,
  90,
  'create-scoped options include the back-dating policy',
);
const createOnlyDraft = await request('/admin/expenses', {
  token: creator,
  method: 'POST',
  key: key('create-only-flow'),
  expected: 201,
  body: {
    category_id: rent.id,
    amount: '12345',
    currency_code: 'IQD',
    payment_mode: 'paid_now',
    cash_account_id: creatorOptions.cash_accounts.find(
      (item) => item.id === till.id,
    ).id,
    supplier_id: creatorOptions.suppliers.find(
      (item) => item.id === formSupplier.id,
    ).id,
    description: 'Created without broad picker permissions',
    document_date: today,
  },
});
check(
  createOnlyDraft.status,
  'draft',
  'expenses.create alone completes the form flow',
);

const editableDraft = await request('/admin/expenses', {
  token: admin,
  method: 'POST',
  key: key('editable-draft'),
  expected: 201,
  body: {
    category_id: rent.id,
    amount: '1000',
    currency_code: 'IQD',
    payment_mode: 'owed',
    payee: 'Original draft payee',
    description: 'Draft before edit',
    document_date: today,
  },
});
const editedDraft = await request(`/admin/expenses/${editableDraft.id}`, {
  token: admin,
  method: 'PATCH',
  body: {
    amount: '1750',
    payee: 'Edited draft payee',
    description: 'Draft after edit',
  },
});
check(editedDraft.amount_currency, 1750, 'draft amount is editable');
check(editedDraft.payee, 'Edited draft payee', 'draft payee is editable');
await request(`/admin/expenses/${editableDraft.id}`, {
  token: admin,
  method: 'DELETE',
  expected: 204,
});
const deletedDraft = await client.query(
  'SELECT id FROM expenses WHERE id = $1',
  [editableDraft.id],
);
check(deletedDraft.rowCount, 0, 'draft expense is deleted');

const receiptForm = new FormData();
receiptForm.append(
  'file',
  new Blob([new TextEncoder().encode('%PDF-1.4\nC12 receipt\n%%EOF')], {
    type: 'application/pdf',
  }),
  'receipt.pdf',
);
const receipt = await request('/admin/expense-receipts', {
  token: admin,
  method: 'POST',
  form: receiptForm,
  expected: 201,
});
check(receipt.mime_type, 'application/pdf', 'PDF receipt is stored privately');
await request(`/media/${receipt.id}`, { expected: 404 });

await request('/admin/settings', {
  token: admin,
  method: 'PUT',
  body: { settings: { separation_of_duties_level: 'strict' } },
});

const cashCreateKey = key('iqd-create');
const cashInput = {
  category_id: rent.id,
  amount: '250000',
  currency_code: 'IQD',
  payment_mode: 'paid_now',
  cash_account_id: till.id,
  payee: 'C12 Landlord',
  description: 'October rent acceptance expense',
  reference_number: 'C12-RENT-1',
  receipt_media_id: receipt.id,
  document_date: today,
};
const cashDraft = await request('/admin/expenses', {
  token: admin,
  method: 'POST',
  key: cashCreateKey,
  expected: 201,
  body: cashInput,
});
const cashReplay = await request('/admin/expenses', {
  token: admin,
  method: 'POST',
  key: cashCreateKey,
  expected: 201,
  body: cashInput,
});
check(cashReplay.id, cashDraft.id, 'create retry returns the same expense');
check(cashDraft.amount_iqd, 250000, 'IQD conversion snapshot is exact');
await request(`/admin/expenses/${cashDraft.id}/post`, {
  token: admin,
  method: 'POST',
  key: key('self-post'),
  expected: 403,
  body: {},
});
const cashPosted = await request(`/admin/expenses/${cashDraft.id}/post`, {
  token: approver,
  method: 'POST',
  key: key('iqd-post'),
  body: {},
});
check(cashPosted.status, 'posted', 'second actor posts the cash expense');
check(cashPosted.balance_currency, 0, 'paid-now expense has no balance');
check(
  cashPosted.journal_entry.lines[0].account.code,
  rent.ledger_account.code,
  'cash expense debits category account',
);
const postedEdit = await request(`/admin/expenses/${cashDraft.id}`, {
  token: admin,
  method: 'PATCH',
  expected: 409,
  body: { description: 'Forbidden posted edit' },
});
check(
  postedEdit.code,
  'EXPENSE_ALREADY_POSTED',
  'posted expense refuses API edit',
);
const postedDelete = await request(`/admin/expenses/${cashDraft.id}`, {
  token: admin,
  method: 'DELETE',
  expected: 409,
});
check(
  postedDelete.code,
  'EXPENSE_ALREADY_POSTED',
  'posted expense refuses API deletion',
);
await assert.rejects(
  client.query('UPDATE expenses SET description = $1 WHERE id = $2', [
    'forbidden edit',
    cashDraft.id,
  ]),
  /immutable/,
  'posted expense columns are database-immutable',
);
assertions += 1;
await request(`/admin/expense-receipts/${receipt.id}`, { token: accountant });

const usdDraft = await request('/admin/expenses', {
  token: admin,
  method: 'POST',
  key: key('usd-create'),
  expected: 201,
  body: {
    category_id: electricity.id,
    amount: '25.50',
    currency_code: 'USD',
    payment_mode: 'paid_now',
    cash_account_id: usdTill.id,
    payee: 'Generator Supplier',
    description: 'USD utility expense',
    document_date: today,
  },
});
check(usdDraft.exchange_rate, 1310, 'USD expense stores the central rate');
check(usdDraft.amount_iqd, 33405, 'USD expense stores its IQD amount');
await request(`/admin/expenses/${usdDraft.id}/post`, {
  token: approver,
  method: 'POST',
  key: key('usd-post'),
  body: {},
});

const owedDraft = await request('/admin/expenses', {
  token: admin,
  method: 'POST',
  key: key('owed-create'),
  expected: 201,
  body: {
    category_id: electricity.id,
    amount: '300000',
    currency_code: 'IQD',
    payment_mode: 'owed',
    payee: 'National Grid',
    description: 'Accrued electricity expense',
    document_date: today,
  },
});
await request(`/admin/expenses/${owedDraft.id}/post`, {
  token: approver,
  method: 'POST',
  key: key('owed-post'),
  body: {},
});
const partOneKey = key('payment-one');
const partOneInput = {
  cash_account_id: till.id,
  amount: '100000',
  document_date: today,
};
const partOne = await request(`/admin/expenses/${owedDraft.id}/payments`, {
  token: approver,
  method: 'POST',
  key: partOneKey,
  expected: 201,
  body: partOneInput,
});
const partOneReplay = await request(
  `/admin/expenses/${owedDraft.id}/payments`,
  {
    token: approver,
    method: 'POST',
    key: partOneKey,
    expected: 201,
    body: partOneInput,
  },
);
check(
  partOneReplay.payments.length,
  partOne.payments.length,
  'payment retry does not duplicate',
);
check(
  partOne.balance_currency,
  200000,
  'first partial payment leaves the exact balance',
);
await request(`/admin/expenses/${owedDraft.id}/payments`, {
  token: approver,
  method: 'POST',
  key: key('overpay'),
  expected: 409,
  body: { cash_account_id: till.id, amount: '200001', document_date: today },
});
const paid = await request(`/admin/expenses/${owedDraft.id}/payments`, {
  token: approver,
  method: 'POST',
  key: key('payment-two'),
  expected: 201,
  body: { cash_account_id: till.id, amount: '200000', document_date: today },
});
check(paid.balance_currency, 0, 'two payments clear the accrued expense');
check(paid.payments.length, 2, 'two immutable payment documents are retained');

const reversal = await request(`/admin/expenses/${cashDraft.id}/reverse`, {
  token: approver,
  method: 'POST',
  key: key('reverse'),
  expected: 201,
  body: { reason: 'Acceptance correction', document_date: today },
});
check(reversal.status, 'reversed', 'correction reverses the posted expense');
check(reversal.corrections.length, 1, 'correction history is visible');
check(
  reversal.corrections[0].postings.length,
  1,
  'cash expense has one reversed journal',
);

const old = new Date();
old.setUTCDate(old.getUTCDate() - 100);
const tooOld = old.toISOString().slice(0, 10);
const oldRefusal = await request('/admin/expenses', {
  token: accountant,
  method: 'POST',
  key: key('old'),
  expected: 403,
  body: {
    category_id: rent.id,
    amount: '1000',
    currency_code: 'IQD',
    payment_mode: 'owed',
    payee: 'Old Payee',
    description: 'Too old expense',
    document_date: tooOld,
  },
});
check(
  oldRefusal.code,
  'EXPENSE_BACKDATE_WINDOW',
  'older-than-window expense has a stable code',
);

const closedDateObject = new Date();
closedDateObject.setUTCDate(closedDateObject.getUTCDate() - 60);
const closedDate = closedDateObject.toISOString().slice(0, 10);
const closedMonth = `${closedDate.slice(0, 7)}-01`;
await client.query(
  `INSERT INTO accounting_periods (month, status, closed_at, closed_by)
   SELECT $1::date, 'closed', now(), id FROM users WHERE username = 'admin'
   ON CONFLICT (month) DO UPDATE SET status = 'closed', closed_at = now(), closed_by = EXCLUDED.closed_by`,
  [closedMonth],
);
const closedRefusal = await request('/admin/expenses', {
  token: admin,
  method: 'POST',
  key: key('closed'),
  expected: 409,
  body: {
    category_id: rent.id,
    amount: '1000',
    currency_code: 'IQD',
    payment_mode: 'owed',
    payee: 'Closed Payee',
    description: 'Closed expense',
    document_date: closedDate,
  },
});
check(
  closedRefusal.code,
  'EXPENSE_PERIOD_CLOSED',
  'closed period has a stable expense code',
);
await client.query('DELETE FROM accounting_periods WHERE month = $1::date', [
  closedMonth,
]);

const page = await request(
  '/admin/expenses?unpaid_only=true&sort=amount&direction=desc',
  {
    token: accountant,
  },
);
check(
  Array.isArray(page.items),
  true,
  'accountant can read the paginated expense list',
);
const totals = await request('/admin/expenses/totals', { token: accountant });
check(totals.total_iqd > 0, true, 'filtered totals expose posted IQD value');
check(totals.per_category.length > 0, true, 'totals are grouped per category');

const unbalanced = await client.query(`
  SELECT entry.id
  FROM journal_entries entry
  JOIN journal_lines line ON line.entry_id = entry.id
  WHERE entry.source_type IN ('expense','expense_payment','expense_correction')
  GROUP BY entry.id
  HAVING sum(line.debit_base) <> sum(line.credit_base)
`);
check(unbalanced.rowCount, 0, 'every expense journal stays balanced');
const audit = await client.query(
  `SELECT count(*)::int AS count FROM audit_logs WHERE entity_type IN ('expense','expense_category','media_object') AND action LIKE 'expense%'`,
);
check(audit.rows[0].count >= 10, true, 'expense writes are audited');
const draftAudit = await client.query(
  `SELECT array_agg(DISTINCT action ORDER BY action) AS actions
   FROM audit_logs
   WHERE entity_type = 'expense' AND entity_id = $1`,
  [editableDraft.id],
);
check(
  draftAudit.rows[0].actions,
  ['expense.create', 'expense.delete', 'expense.update'],
  'draft create, edit and delete are each audited',
);
const presets = await client.query(`
  SELECT preset.name, array_agg(permission.key ORDER BY permission.key) AS permissions
  FROM permission_presets preset
  JOIN preset_permissions grant_row ON grant_row.preset_id = preset.id
  JOIN permissions permission ON permission.id = grant_row.permission_id
  WHERE preset.name IN ('accountant','operations','stock_controller')
    AND permission.key LIKE 'expense%'
  GROUP BY preset.name
  ORDER BY preset.name
`);
check(
  presets.rows,
  [{ name: 'accountant', permissions: ['expenses.create', 'expenses.read'] }],
  'only accountant create/read is seeded outside owner/admin',
);

await request('/admin/settings', {
  token: admin,
  method: 'PUT',
  body: { settings: { separation_of_duties_level: 'standard' } },
});
await client.end();
console.log(`Expenses acceptance: ${assertions} assertions passed`);
