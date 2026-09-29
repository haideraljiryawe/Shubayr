import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(process.env.ACCEPTANCE_DATABASE_NAME ?? '')) {
  throw new Error('Financial-core acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Financial-core acceptance requires the runner-owned loopback API');
}

let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

async function request(path, { token, method = 'GET', body, expected = 200 } = {}) {
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

const login = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
});
const admin = login.access_token;
const operationsLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'operations', password: 'Shubayr-Dev-Staff!2026' },
});

const currencies = await request('/admin/currencies', { token: admin });
const iqd = currencies.find((currency) => currency.code === 'IQD');
const usd = currencies.find((currency) => currency.code === 'USD');
check(iqd.is_base, true, 'IQD is seeded as base currency');
check(iqd.display_precision, 0, 'IQD has zero display decimals');
check(usd.display_precision, 2, 'USD has two display decimals');

const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(now);
const yesterday = new Date(now.getTime() - 86_400_000).toISOString();

await request(`/admin/exchange-rates/USD/applicable?at=${encodeURIComponent(now.toISOString())}`, {
  token: admin,
  expected: 422,
});
await request('/admin/exchange-rates', {
  token: admin,
  method: 'POST',
  expected: 422,
  body: { currency_code: 'USD', rate: '0', basis: 1, effective_at: yesterday, reason: 'invalid zero rate' },
});
await request('/admin/exchange-rates', {
  token: admin,
  method: 'POST',
  expected: 422,
  body: { currency_code: 'USD', rate: '-1', basis: 1, effective_at: yesterday, reason: 'invalid negative rate' },
});
const rate = await request('/admin/exchange-rates', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { currency_code: 'USD', rate: '131000', basis: 100, effective_at: yesterday, reason: 'acceptance market rate' },
});
check(Number(rate.rate), 1310, 'per-100 rate is normalized to per-1');
const applicable = await request(
  `/admin/exchange-rates/USD/applicable?at=${encodeURIComponent(now.toISOString())}`,
  { token: admin },
);
check(applicable.not_from_today, true, 'older applicable rate carries a stale-today warning');

const cash = await request('/admin/cash-accounts', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { name: 'Acceptance Till', kind: 'cash', currency_code: 'IQD' },
});
const bank = await request('/admin/cash-accounts', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { name: 'Acceptance Bank', kind: 'bank', currency_code: 'IQD' },
});
check(cash.currency_code, 'IQD', 'cash-account money responses carry a currency code');
const disposableAccount = await request('/admin/cash-accounts', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { name: 'Disposable Till', kind: 'cash', currency_code: 'IQD' },
});
const readAccount = await request(`/admin/cash-accounts/${disposableAccount.id}`, { token: admin });
check(readAccount.balance, '0', 'single-account read derives its balance from the ledger');
await request(`/admin/cash-accounts/${disposableAccount.id}`, {
  token: admin,
  method: 'PATCH',
  body: { name: 'Disposable Till Renamed' },
});
await request(`/admin/cash-accounts/${disposableAccount.id}`, {
  token: admin,
  method: 'DELETE',
  expected: 204,
});
await request(`/admin/cash-accounts/${disposableAccount.id}`, { token: admin, expected: 404 });

const openingInput = {
  operation_id: `opening-${Date.now()}`,
  document_date: today,
  amount: '250000',
};
const opening = await request(`/admin/cash-accounts/${cash.id}/opening-balance`, {
  token: admin,
  method: 'POST',
  expected: 201,
  body: openingInput,
});
await request(`/admin/cash-accounts/${cash.id}`, {
  token: admin,
  method: 'DELETE',
  expected: 409,
});
const replay = await request(`/admin/cash-accounts/${cash.id}/opening-balance`, {
  token: admin,
  method: 'POST',
  expected: 201,
  body: openingInput,
});
check(replay.id, opening.id, 'same operation id and payload replays the saved outcome');
await request(`/admin/cash-accounts/${cash.id}/opening-balance`, {
  token: admin,
  method: 'POST',
  expected: 409,
  body: { ...openingInput, amount: '260000' },
});
const outcome = await request(`/admin/operations/${openingInput.operation_id}`, { token: admin });
check(outcome.status, 'completed', 'operation outcome is queryable');
check(outcome.response.id, opening.id, 'operation outcome preserves the response');

await request(`/admin/cash-accounts/${bank.id}/opening-balance`, {
  token: admin,
  method: 'POST',
  expected: 422,
  body: { operation_id: `fraction-${Date.now()}`, document_date: today, amount: '10.5' },
});
const tomorrow = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
await request(`/admin/cash-accounts/${bank.id}/opening-balance`, {
  token: admin,
  method: 'POST',
  expected: 422,
  body: { operation_id: `future-${Date.now()}`, document_date: tomorrow, amount: '10' },
});

const oldDate = new Date(now.getTime() - 100 * 86_400_000).toISOString().slice(0, 10);
const backdated = await request('/admin/cash-accounts', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { name: 'Backdate Acceptance', kind: 'cash', currency_code: 'IQD' },
});
const presets = await request('/admin/presets', { token: admin });
const operationsPreset = presets.find((preset) => preset.name === 'operations');
assert.ok(operationsPreset, 'operations preset is available for permission test');
assertions += 1;
await request(`/admin/staff/${operationsLogin.user.id}/access`, {
  token: admin,
  method: 'PUT',
  body: {
    preset_ids: [operationsPreset.id],
    permission_keys: ['cash_accounts.manage'],
    reason: 'Financial acceptance date-rule test',
  },
});
await request(`/admin/cash-accounts/${backdated.id}/opening-balance`, {
  token: operationsLogin.access_token,
  method: 'POST',
  expected: 403,
  body: {
    operation_id: `old-without-permission-${Date.now()}`,
    document_date: oldDate,
    backdate_reason: 'Permission must still be required',
    amount: '1000',
  },
});
await request(`/admin/cash-accounts/${backdated.id}/opening-balance`, {
  token: admin,
  method: 'POST',
  expected: 422,
  body: {
    operation_id: `old-without-reason-${Date.now()}`,
    document_date: oldDate,
    amount: '1000',
  },
});
const approvedBackdate = await request(`/admin/cash-accounts/${backdated.id}/opening-balance`, {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `old-approved-${Date.now()}`,
    document_date: oldDate,
    backdate_reason: 'Approved acceptance backdate',
    amount: '1000',
  },
});
check(approvedBackdate.document_date.slice(0, 10), oldDate, 'original document date is retained');
check(approvedBackdate.accounting_date.slice(0, 10), oldDate, 'accounting date is stored separately');
check(approvedBackdate.backdate_reason, 'Approved acceptance backdate', 'approved backdate reason is stored');

const transfers = await Promise.all(
  Array.from({ length: 8 }, (_, index) =>
    request('/admin/cash-transfers', {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        operation_id: `parallel-${Date.now()}-${index}`,
        document_date: today,
        from_account_id: cash.id,
        to_account_id: bank.id,
        amount: '1000',
        reason: `parallel transfer ${index}`,
      },
    }),
  ),
);
check(new Set(transfers.map((item) => item.document_number)).size, 8, 'concurrent transfer numbers are unique');
check(
  transfers.map((item) => item.document_number).every((number) => /^TR-\d{4}-\d{6}$/.test(number)),
  true,
  'transfer numbers use prefix, year, and sequence',
);

const trial = await request('/admin/ledger/trial-balance', { token: admin });
check(trial.balanced, true, 'trial balance remains balanced');
check(trial.debit_total, trial.credit_total, 'base debits exactly equal credits');
await request('/admin/currencies/USD', {
  token: admin,
  method: 'PATCH',
  expected: 409,
  body: { is_base: true },
});

const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
await assert.rejects(
  database.query('UPDATE journal_entries SET description = $1 WHERE id = $2', ['tamper', opening.journal_entry_id]),
  /immutable/i,
);
assertions += 1;
await assert.rejects(
  database.query('DELETE FROM journal_lines WHERE entry_id = $1', [opening.journal_entry_id]),
  /immutable/i,
);
assertions += 1;
await database.end();

const reversal = await request(`/admin/ledger/entries/${opening.journal_entry_id}/reversal`, {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { reason: 'Acceptance correction by reversal' },
});
check(reversal.reverses_id, opening.journal_entry_id, 'correction links an immutable reversal');

const beforeDraft = await request('/admin/ledger/entries?page=1&per_page=1', { token: admin });
await request('/admin/drafts/expense', {
  token: admin,
  method: 'PUT',
  body: { payload: { amount: 12345, memo: 'unposted' } },
});
const afterDraft = await request('/admin/ledger/entries?page=1&per_page=1', { token: admin });
check(afterDraft.total, beforeDraft.total, 'draft save has no ledger effect');
await request('/admin/drafts/expense', { token: admin, method: 'DELETE', expected: 204 });

const settings = await request('/admin/settings', {
  token: admin,
  method: 'PUT',
  body: {
    settings: { delivery_fee: '6000', timezone: 'Asia/Baghdad' },
    protection_thresholds: { price: 55 },
  },
});
check(settings.settings.delivery_fee, '6000', 'financial setting is updated');
const settingsAudit = await request('/admin/audit-logs?action=settings.update&entity_type=settings&page=1', { token: admin });
check(settingsAudit.total > 0, true, 'settings update is audited');

const month = today.slice(0, 7);
await request(`/admin/accounting-periods/${month}/close`, {
  token: operationsLogin.access_token,
  method: 'POST',
  expected: 403,
  body: {},
});
const checklist = await request(`/admin/accounting-periods/${month}/checklist`, { token: admin });
check(checklist.can_close, true, 'close checklist passes for balanced posted data');
const close = await request(`/admin/accounting-periods/${month}/close`, {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { reason: 'Acceptance close' },
});
check(close.sequence, 1, 'first close snapshot has sequence one');
await request('/admin/cash-transfers', {
  token: admin,
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `closed-${Date.now()}`,
    document_date: today,
    from_account_id: cash.id,
    to_account_id: bank.id,
    amount: '1000',
    reason: 'must be blocked in closed period',
  },
});
await request(`/admin/accounting-periods/${month}/reopen`, {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { reason: 'Acceptance reopen verification' },
});

console.log(`Financial-core acceptance passed (${assertions} assertions).`);
