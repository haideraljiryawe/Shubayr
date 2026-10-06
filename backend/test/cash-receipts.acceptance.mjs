import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Cash-receipt acceptance requires an isolated *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Cash-receipt acceptance requires the runner-owned API');
}

let assertions = 0;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function baghdadDate(value = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Baghdad',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
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

const adminLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
});
const adminToken = adminLogin.access_token;
const adminId = adminLogin.user.id;

const operationsId = (
  await db.query("SELECT id FROM users WHERE username='operations'")
).rows[0].id;
await db.query(
  `INSERT INTO user_presets (user_id,preset_id,assigned_by,reason)
   SELECT $1,preset.id,$2,'C6 acceptance cashier duties'
   FROM permission_presets preset WHERE preset.name='cashier'
   ON CONFLICT (user_id,preset_id) DO UPDATE SET assigned_by=excluded.assigned_by, reason=excluded.reason`,
  [operationsId, adminId],
);
await db.query(
  'UPDATE users SET permission_version=permission_version+1 WHERE id=$1',
  [operationsId],
);
const cashierLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'operations', password: 'Shubayr-Dev-Staff!2026' },
});
const cashierToken = cashierLogin.access_token;

const till = await request('/admin/cash-accounts', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    name: `C6 Till ${randomUUID().slice(0, 8)}`,
    kind: 'cash',
    currency_code: 'IQD',
  },
});
const party = await request('/admin/external-drivers', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    name: 'C6 Receipt Driver',
    phone: `+96477${Date.now()}`.slice(0, 16),
  },
});
const otherParty = await request('/admin/external-drivers', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: { name: 'C6 Other Driver', phone: `+96478${Date.now()}`.slice(0, 16) },
});
const customerId = (
  await db.query("SELECT id FROM users WHERE phone='+9647700000006'")
).rows[0].id;
const today = baghdadDate();

async function collectionFixture(label, partyId, amount, confirmedAt) {
  const orderId = randomUUID();
  const deliveryId = randomUUID();
  const collectionId = randomUUID();
  const entryId = randomUUID();
  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO orders
        (id,user_id,order_number,status,version,payment_method,subtotal,delivery_fee,discount,total,currency_code,document_date,accounting_date,delivery_contact_phone,delivery_city)
       VALUES ($1,$2,$3,'delivered',3,'cod',$4,0,0,$4,'IQD',$5,$5,'+9647700000006','Baghdad')`,
      [
        orderId,
        customerId,
        `VERIFY-C6-${label}-${orderId.slice(0, 8)}`,
        amount,
        today,
      ],
    );
    await db.query(
      `INSERT INTO deliveries
        (id,order_id,agent_id,status,delivery_fee,currency_code,dispatched_at,delivered_at)
       VALUES ($1,$2,$3,'delivered',0,'IQD',$4,$4)`,
      [deliveryId, orderId, partyId, confirmedAt],
    );
    await db.query('UPDATE orders SET delivery_id=$1 WHERE id=$2', [
      deliveryId,
      orderId,
    ]);
    await db.query(
      `INSERT INTO journal_entries
        (id,document_number,source_type,source_id,event,document_date,accounting_date,description,created_by)
       VALUES ($1,$2,'c6_fixture_collection',$3,'cash_collected',$4,$4,'C6 confirmed collection',$5)`,
      [
        entryId,
        `C6-COL-${collectionId.slice(0, 8)}`,
        collectionId,
        today,
        adminId,
      ],
    );
    await db.query(
      `INSERT INTO journal_lines
        (entry_id,account_id,debit_base,credit_base,currency_code,original_amount,exchange_rate)
       SELECT $1,account.id,
              CASE WHEN account.code='1020' THEN $2 ELSE 0 END,
              CASE WHEN account.code='4000' THEN $2 ELSE 0 END,
              'IQD',$2,1
       FROM ledger_accounts account WHERE account.code IN ('1020','4000')`,
      [entryId, amount],
    );
    await db.query(
      `INSERT INTO delivery_collections
        (id,delivery_id,order_id,party_id,status,due_amount,collected_amount,shortfall_amount,currency_code,delivered_operation_id,delivered_by,delivered_at,accounting_date,delivery_journal_entry_id,confirmed_operation_id,confirmed_by,confirmed_at)
       VALUES ($1,$2,$3,$4,'confirmed_full',$5,$5,0,'IQD',$6,$7,$8,$9,$10,$11,$7,$8)`,
      [
        collectionId,
        deliveryId,
        orderId,
        partyId,
        amount,
        `c6-fixture-${label}`,
        adminId,
        confirmedAt,
        today,
        entryId,
        `c6-confirm-${label}`,
      ],
    );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  return { orderId, deliveryId, collectionId, amount };
}

const baseTime = Date.now() - 86_400_000;
const orders = [
  await collectionFixture('a', party.id, 100000, new Date(baseTime)),
  await collectionFixture('b', party.id, 50000, new Date(baseTime + 1000)),
  await collectionFixture('c', party.id, 80000, new Date(baseTime + 2000)),
];
const foreignOrder = await collectionFixture(
  'foreign',
  otherParty.id,
  10000,
  new Date(baseTime + 3000),
);

await db.query(
  "UPDATE store_settings SET value='standard' WHERE key='separation_of_duties_level'",
);
const receiptInput = {
  operation_id: `c6-receipt-${randomUUID()}`,
  document_date: today,
  party_id: party.id,
  cash_account_id: till.id,
  amount_iqd: '190000',
  reference: 'driver route 8C',
  allocations: [
    { order_id: orders[0].orderId, amount_iqd: '90000' },
    { order_id: orders[1].orderId, amount_iqd: '30000' },
    { order_id: orders[2].orderId, amount_iqd: '20000' },
  ],
};
const receipt = await request('/admin/cash-receipts', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: receiptInput,
});
check(
  [
    receipt.amount_iqd,
    receipt.allocated_amount_iqd,
    receipt.unallocated_amount_iqd,
  ],
  [190000, 140000, 50000],
  'one voucher allocates across three orders and retains a remainder',
);
check(
  receipt.allocation_batches[0].allocations.length,
  3,
  'initial allocation is one immutable three-order batch',
);

const replay = await request('/admin/cash-receipts', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: receiptInput,
});
check(replay.id, receipt.id, 'same receipt operation replays one document');
check(
  Number(
    (
      await db.query(
        'SELECT count(*) FROM cash_receipt_vouchers WHERE operation_id=$1',
        [receiptInput.operation_id],
      )
    ).rows[0].count,
  ),
  1,
  'receipt replay persists only one voucher',
);

const posting = (
  await db.query(
    `SELECT account.code, CASE WHEN line.debit_base>0 THEN 'debit' ELSE 'credit' END AS side,
            greatest(line.debit_base,line.credit_base)::numeric AS amount
     FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
     WHERE line.entry_id=$1 ORDER BY account.code`,
    [receipt.journal_entry_id],
  )
).rows.map((row) => [row.code, row.side, Number(row.amount)]);
check(
  posting,
  [
    ['1020', 'credit', 190000],
    [till.ledger_account.code, 'debit', 190000],
  ].sort((left, right) => left[0].localeCompare(right[0])),
  'receipt uses the phase-3 cash_received posting map with the selected cash account',
);

const custodyAfterReceipt = await request(
  `/admin/delivery-parties/${party.id}/custody`,
  { token: adminToken },
);
check(
  custodyAfterReceipt.cash.amount,
  40000,
  'handed-in cash immediately leaves party custody',
);
const unallocated = await request(
  `/admin/cash-receipts/unallocated?party_id=${party.id}&date_from=${today}&date_to=${today}`,
  { token: adminToken },
);
check(
  unallocated.data.map((row) => row.id),
  [receipt.id],
  'unallocated receipt list exposes the remainder',
);

const suggestions = await request(
  `/admin/cash-receipts/allocation-suggestions?party_id=${party.id}&amount_iqd=50000`,
  { token: adminToken },
);
check(
  suggestions.data
    .slice(0, 3)
    .map((row) => [row.order.id, row.suggested_amount_iqd]),
  [
    [orders[0].orderId, 10000],
    [orders[1].orderId, 20000],
    [orders[2].orderId, 20000],
  ],
  'allocation suggestions consume the oldest unsettled collections first',
);

await request(`/admin/cash-receipts/${receipt.id}/allocations`, {
  token: adminToken,
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `c6-wrong-party-${randomUUID()}`,
    document_date: today,
    allocations: [{ order_id: foreignOrder.orderId, amount_iqd: '1' }],
  },
});
await request(`/admin/cash-receipts/${receipt.id}/allocations`, {
  token: adminToken,
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `c6-order-over-${randomUUID()}`,
    document_date: today,
    allocations: [{ order_id: orders[2].orderId, amount_iqd: '60001' }],
  },
});
await request(`/admin/cash-receipts/${receipt.id}/allocations`, {
  token: adminToken,
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `c6-receipt-over-${randomUUID()}`,
    document_date: today,
    allocations: [
      { order_id: orders[0].orderId, amount_iqd: '10000' },
      { order_id: orders[1].orderId, amount_iqd: '20000' },
      { order_id: orders[2].orderId, amount_iqd: '20001' },
    ],
  },
});
await request('/admin/cash-receipts', {
  token: adminToken,
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `c6-custody-over-${randomUUID()}`,
    document_date: today,
    party_id: party.id,
    cash_account_id: till.id,
    amount_iqd: '40001',
  },
});

const laterInput = {
  operation_id: `c6-later-${randomUUID()}`,
  document_date: today,
  allocations: suggestions.data.slice(0, 3).map((row) => ({
    order_id: row.order.id,
    amount_iqd: String(row.suggested_amount_iqd),
  })),
};
const fullyAllocated = await request(
  `/admin/cash-receipts/${receipt.id}/allocations`,
  {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: laterInput,
  },
);
check(
  fullyAllocated.unallocated_amount_iqd,
  0,
  'standard mode allows the receiver to allocate the remainder later',
);
const allocationReplay = await request(
  `/admin/cash-receipts/${receipt.id}/allocations`,
  {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: laterInput,
  },
);
check(
  allocationReplay.allocation_batches.length,
  2,
  'allocation replay creates no second batch',
);

const collections = await request(
  `/admin/delivery-parties/${party.id}/collections?per_page=20`,
  { token: adminToken },
);
check(
  collections.data.map((row) => [
    row.order_id,
    row.settlement_status,
    row.unsettled_amount_iqd,
  ]),
  [
    [orders[0].orderId, 'settled', 0],
    [orders[1].orderId, 'settled', 0],
    [orders[2].orderId, 'partially_settled', 40000],
  ],
  'per-party collection list shows receipt settlement and partial balance',
);
check(
  collections.data
    .flatMap((row) => row.receipt_allocations)
    .every((row) => row.voucher_id === receipt.id),
  true,
  'collection settlement links back to its receipt',
);

const detail = await request(`/admin/cash-receipts/${receipt.id}`, {
  token: adminToken,
});
check(
  detail.allocation_batches.length,
  2,
  'receipt detail retains both allocation documents',
);
const filteredList = await request(
  `/admin/cash-receipts?party_id=${party.id}&cash_account_id=${till.id}&date_from=${today}&date_to=${today}&status=active`,
  { token: adminToken },
);
check(
  filteredList.data.map((row) => row.id),
  [receipt.id],
  'voucher filters compose by party, account, date and status',
);

const statement = await request(
  `/admin/delivery-parties/${party.id}/statement?per_page=100`,
  { token: adminToken },
);
const receiptStatement = statement.cash_activity.data.find(
  (row) => row.event === 'cash_received' && row.voucher_id === receipt.id,
);
check(
  receiptStatement.allocation_orders.length,
  6,
  'party statement shows receipt allocations to settled orders',
);
check(
  statement.cash_activity.data.at(-1).running_cash_iqd,
  40000,
  'party statement running cash matches custody after hand-in',
);

await db.query(
  "UPDATE store_settings SET value='strict' WHERE key='separation_of_duties_level'",
);
const strictReceipt = await request('/admin/cash-receipts', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `c6-strict-receipt-${randomUUID()}`,
    document_date: today,
    party_id: party.id,
    cash_account_id: till.id,
    amount_iqd: '10000',
  },
});
await request(`/admin/cash-receipts/${strictReceipt.id}/allocations`, {
  token: adminToken,
  method: 'POST',
  expected: 403,
  body: {
    operation_id: `c6-strict-self-${randomUUID()}`,
    document_date: today,
    allocations: [{ order_id: orders[2].orderId, amount_iqd: '10000' }],
  },
});
await request(`/admin/cash-receipts/${strictReceipt.id}/allocations`, {
  token: cashierToken,
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `c6-strict-other-${randomUUID()}`,
    document_date: today,
    allocations: [{ order_id: orders[2].orderId, amount_iqd: '10000' }],
  },
});
await db.query(
  "UPDATE store_settings SET value='standard' WHERE key='separation_of_duties_level'",
);

await request(`/admin/cash-receipts/${receipt.id}/reversal`, {
  token: adminToken,
  method: 'POST',
  expected: 403,
  body: {
    operation_id: `c6-self-reverse-${randomUUID()}`,
    reason: 'self reversal must fail',
  },
});
const strictReversalInput = {
  operation_id: `c6-strict-reverse-${randomUUID()}`,
  reason: 'reverse strict-mode test receipt',
};
await request(`/admin/cash-receipts/${strictReceipt.id}/reversal`, {
  token: cashierToken,
  method: 'POST',
  expected: 201,
  body: strictReversalInput,
});
const reversalInput = {
  operation_id: `c6-reverse-${randomUUID()}`,
  reason: 'cashier corrected duplicate paper voucher',
};
const reversed = await request(`/admin/cash-receipts/${receipt.id}/reversal`, {
  token: cashierToken,
  method: 'POST',
  expected: 201,
  body: reversalInput,
});
check(
  [
    reversed.status,
    reversed.allocated_amount_iqd,
    reversed.original_allocated_amount_iqd,
  ],
  ['reversed', 0, 190000],
  'reversal preserves allocation history while making it ineffective',
);
const reversalReplay = await request(
  `/admin/cash-receipts/${receipt.id}/reversal`,
  {
    token: cashierToken,
    method: 'POST',
    expected: 201,
    body: reversalInput,
  },
);
check(
  reversalReplay.reversal.id,
  reversed.reversal.id,
  'reversal operation is idempotent',
);

const restoredCollections = await request(
  `/admin/delivery-parties/${party.id}/collections?per_page=20`,
  { token: adminToken },
);
check(
  restoredCollections.data.map((row) => [
    row.settlement_status,
    row.allocated_amount_iqd,
    row.unsettled_amount_iqd,
  ]),
  [
    ['unsettled', 0, 100000],
    ['unsettled', 0, 50000],
    ['unsettled', 0, 80000],
  ],
  'reversal un-settles every allocated order',
);
const restoredCustody = await request(
  `/admin/delivery-parties/${party.id}/custody`,
  { token: adminToken },
);
check(
  restoredCustody.cash.amount,
  230000,
  'reversal restores all received cash to party custody',
);

const account1020 = await db.query(
  `SELECT coalesce(sum(line.debit_base-line.credit_base),0)::numeric AS balance
   FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
   WHERE account.code='1020'`,
);
const custodyTotal = await request(
  '/admin/delivery-parties/custody-overview?per_page=100',
  { token: adminToken },
);
check(
  custodyTotal.data.reduce(
    (sum, row) => sum + row.custody_summary.cash_held,
    0,
  ),
  Number(account1020.rows[0].balance),
  'party cash custody equals the account 1020 ledger balance after receipts and reversals',
);

const receiptAccount = await request(`/admin/cash-accounts/${till.id}`, {
  token: adminToken,
});
check(
  Number(receiptAccount.balance),
  0,
  'receipt reversals restore the destination cash account balance',
);

const previous = new Date(`${today}T00:00:00.000Z`);
previous.setUTCMonth(previous.getUTCMonth() - 1, 1);
const closedMonth = previous.toISOString().slice(0, 7);
const closedDate = `${closedMonth}-15`;
await db.query(
  `INSERT INTO accounting_periods (month,status,closed_at,closed_by)
   VALUES ($1,'closed',now(),$2)
   ON CONFLICT (month) DO UPDATE SET status='closed',closed_at=now(),closed_by=excluded.closed_by`,
  [`${closedMonth}-01`, adminId],
);
await request('/admin/cash-receipts', {
  token: adminToken,
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `c6-closed-${randomUUID()}`,
    document_date: closedDate,
    party_id: party.id,
    cash_account_id: till.id,
    amount_iqd: '1',
  },
});
await db.query('DELETE FROM accounting_periods WHERE month=$1', [
  `${closedMonth}-01`,
]);

const finalStatement = await request(
  `/admin/delivery-parties/${party.id}/statement?per_page=100`,
  { token: adminToken },
);
check(
  finalStatement.cash_activity.data.filter(
    (row) => row.event === 'cash_receipt_reversed',
  ).length,
  2,
  'party statement keeps each receipt and reversal visible',
);
check(
  finalStatement.cash_activity.data.at(-1).running_cash_iqd,
  230000,
  'statement running balance is restored after reversals',
);

console.log(`cash receipt acceptance assertions: ${assertions}`);
await db.end();
