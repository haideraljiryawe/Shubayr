import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Run acceptance through npm run test:acceptance (isolated *_verify database required)',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1' || !new URL(api).port) {
  throw new Error('Acceptance requires the runner-owned loopback API URL');
}

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

async function appLogin(phone) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone },
  });
  return request('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: challenge.dev_otp },
  });
}

const [admin, agentA, agentB] = await Promise.all([
  request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
  }),
  appLogin('+9647700000005'),
  appLogin('+9647700000007'),
]);
const adminToken = admin.access_token;

const parties = await request('/admin/delivery-parties?per_page=100', {
  token: adminToken,
});
const internalA = parties.data.find(
  (party) => party.user_id === agentA.user.id,
);
const internalB = parties.data.find(
  (party) => party.user_id === agentB.user.id,
);
check(internalA.kind, 'internal_agent', 'agent A has one internal party');
check(internalB.kind, 'internal_agent', 'agent B has one internal party');
check(internalA.id, agentA.user.id, 'internal party preserves user identity');

const external = await request('/admin/external-drivers', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    name: 'Phase 8A Taxi',
    phone: '+9647700088001',
    vehicle_number: 'BAG-8A',
    description: 'White sedan',
    notes: 'Acceptance driver',
  },
});
check(external.kind, 'external_driver', 'external party kind');
check(external.user_id, null, 'external driver has no account');
check(external.duplicate_phone_warning, false, 'first phone has no warning');

const duplicate = await request('/admin/external-drivers', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: { name: 'Duplicate Phone Warning', phone: external.phone },
});
check(
  duplicate.duplicate_phone_warning,
  true,
  'repeated phone warns without merging custody accounts',
);
const unusedRemoval = await request(
  `/admin/external-drivers/${duplicate.id}`,
  { token: adminToken, method: 'DELETE' },
);
check(unusedRemoval.disposition, 'deleted', 'unused driver can be deleted');

const updated = await request(`/admin/external-drivers/${external.id}`, {
  token: adminToken,
  method: 'PATCH',
  body: { notes: 'Updated acceptance note' },
});
check(updated.notes, 'Updated acceptance note', 'external driver updates');

const orderPage = await request(
  '/admin/orders?q=DEV-ORDER-2&per_page=100',
  { token: adminToken },
);
let order = orderPage.data.find(
  (row) => row.order_number === 'DEV-ORDER-2',
);
assert.ok(order, 'seeded confirmed order is available');
assertions += 1;
for (const status of ['preparing', 'ready_for_dispatch']) {
  order = await request(`/admin/orders/${order.id}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: { status, version: order.version },
  });
}
const assigned = await request(`/deliveries/${order.delivery.id}/assign`, {
  token: adminToken,
  method: 'PATCH',
  body: { party_id: external.id },
});
check(assigned.party_id, external.id, 'external party can be assigned');
check(assigned.agent_id, null, 'external assignment has no account id');
check(assigned.party.kind, 'external_driver', 'assignment exposes party kind');

order = await request(`/admin/orders/${order.id}/status`, {
  token: adminToken,
  method: 'PATCH',
  body: { status: 'dispatched', version: order.version },
});
check(order.delivery.party.id, external.id, 'handover retains external party');

const custody = await request(
  `/admin/delivery-parties/${external.id}/custody`,
  { token: adminToken },
);
check(custody.goods.lines.length > 0, true, 'external goods custody is listed');
check(custody.goods.quantity > 0, true, 'external goods total is positive');
check(
  typeof custody.goods.value_iqd,
  'number',
  'cost.view reveals custody value',
);
check(custody.cash.amount, 0, 'cash custody remains zero in phase 8a');
check(
  custody.goods.lines.every((line) => line.age_days >= 0),
  true,
  'custody lines include Baghdad business-day ages',
);

const statement = await request(
  `/admin/delivery-parties/${external.id}/statement?order_id=${order.id}`,
  { token: adminToken },
);
check(statement.total > 0, true, 'party statement contains custody issue');
check(
  statement.data.at(-1).running_quantity,
  custody.goods.quantity,
  'statement running quantity equals current custody',
);
const held = await request(
  `/admin/delivery-parties/${external.id}/orders`,
  { token: adminToken },
);
check(held.data.map((row) => row.id), [order.id], 'held orders are scoped');

const ownA = await request('/deliveries/custody', {
  token: agentA.access_token,
});
const ownB = await request('/deliveries/custody', {
  token: agentB.access_token,
});
check(ownA.party.user_id, agentA.user.id, 'agent A sees own custody only');
check(ownB.party.user_id, agentB.user.id, 'agent B sees own custody only');
check(
  'value_iqd' in ownA.goods,
  false,
  'agent custody does not leak cost',
);
await request(`/admin/delivery-parties/${internalB.id}/custody`, {
  token: agentA.access_token,
  expected: 403,
});

const allParties = await request('/admin/delivery-parties?per_page=100', {
  token: adminToken,
});
check(allParties.data.every((party) => party.custody_summary), true, 'delivery-party list includes custody totals for every party');
const overview = await request('/admin/delivery-parties/custody-overview?sort_by=cash_held&sort_direction=desc&per_page=100', { token: adminToken });
check(overview.total, allParties.total, 'custody overview covers all parties');
check(
  overview.data.every((party, index, rows) => index === 0 || rows[index - 1].custody_summary.cash_held >= party.custody_summary.cash_held),
  true,
  'custody overview applies server-side sorting',
);
let custodyValue = 0;
for (const party of allParties.data) {
  const summary = await request(
    `/admin/delivery-parties/${party.id}/custody`,
    { token: adminToken },
  );
  custodyValue += summary.goods.value_iqd;
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const ledger = await db.query(
  `SELECT coalesce(sum(line.debit_base - line.credit_base), 0)::numeric AS balance
   FROM journal_lines line
   JOIN ledger_accounts account ON account.id = line.account_id
   WHERE account.code = '1010'`,
);
check(
  Number(custodyValue.toFixed(6)),
  Number(Number(ledger.rows[0].balance).toFixed(6)),
  'party custody totals equal the goods-in-custody ledger balance',
);
check(
  Number(allParties.data.reduce((sum, party) => sum + party.custody_summary.goods_value_iqd, 0).toFixed(6)),
  Number(Number(ledger.rows[0].balance).toFixed(6)),
  'list goods-value totals equal the custody ledger balance',
);
const cashLedger = await db.query(
  `SELECT coalesce(sum(line.debit_base - line.credit_base), 0)::numeric AS balance
   FROM journal_lines line
   JOIN ledger_accounts account ON account.id = line.account_id
   WHERE account.code = '1020'`,
);
check(
  Number(allParties.data.reduce((sum, party) => sum + party.custody_summary.cash_held, 0).toFixed(6)),
  Number(Number(cashLedger.rows[0].balance).toFixed(6)),
  'list cash totals equal the cash-in-custody ledger balance',
);
await db.end();

const usedRemoval = await request(`/admin/external-drivers/${external.id}`, {
  token: adminToken,
  method: 'DELETE',
});
check(
  usedRemoval.disposition,
  'deactivated',
  'used external driver is deactivated instead of deleted',
);
const inactive = await request(`/admin/delivery-parties/${external.id}`, {
  token: adminToken,
});
check(inactive.is_active, false, 'used driver history remains readable');

console.log(`Delivery-party acceptance passed (${assertions} assertions).`);
