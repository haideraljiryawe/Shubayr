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
    'Run acceptance through npm run test:acceptance (isolated *_verify database required)',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1' || !new URL(api).port) {
  throw new Error('Acceptance requires the runner-owned loopback API URL');
}

let assertions = 0;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

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

async function agentLogin() {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone: '+9647700000005' },
  });
  return request('/auth/verify-otp', {
    method: 'POST',
    body: { phone: '+9647700000005', code: challenge.dev_otp },
  });
}

const [admin, agent] = await Promise.all([
  request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
  }),
  agentLogin(),
]);
const adminToken = admin.access_token;
const agentToken = agent.access_token;
const customerId = (
  await db.query("SELECT id FROM users WHERE phone='+9647700000006'")
).rows[0].id;
const stock = (
  await db.query(`
    SELECT batch.id AS batch_id, variant.id AS variant_id, variant.product_id
    FROM inventory_batches batch
    JOIN product_variants variant ON variant.id=batch.variant_id
    ORDER BY batch.id
    LIMIT 1`)
).rows[0];

const external = await request('/admin/external-drivers', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    name: 'Phase 8B collection driver',
    phone: '+9647700088005',
    vehicle_number: 'BAG-8B',
  },
});

async function account1020Balance() {
  return Number(
    (
      await db.query(`
        SELECT coalesce(sum(line.debit_base-line.credit_base),0) AS value
        FROM journal_lines line
        JOIN ledger_accounts account ON account.id=line.account_id
        WHERE account.code='1020'`)
    ).rows[0].value,
  );
}

const cashBefore = await account1020Balance();

async function fixture(label, partyId) {
  const orderId = randomUUID();
  const orderItemId = randomUUID();
  const deliveryId = randomUUID();
  const holdingId = randomUUID();
  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO orders
        (id,user_id,order_number,status,version,payment_method,subtotal,delivery_fee,discount,total,currency_code,document_date,accounting_date,delivery_contact_phone,delivery_city)
       VALUES ($1,$2,$3,'dispatched',2,'cod',100000,5000,0,105000,'IQD','2026-10-03','2026-10-03','+9647700000006','Baghdad')`,
      [orderId, customerId, `VERIFY-C5-${label}-${orderId.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO order_items
        (id,order_id,product_id,variant_id,product_name_ar,product_name_en,quantity,unit_price,line_total)
       VALUES ($1,$2,$3,$4,'C5 fixture','C5 fixture',1,100000,100000)`,
      [orderItemId, orderId, stock.product_id, stock.variant_id],
    );
    await db.query(
      `INSERT INTO deliveries
        (id,order_id,agent_id,status,delivery_fee,currency_code,dispatched_at)
       VALUES ($1,$2,$3,'out_for_delivery',5000,'IQD',now())`,
      [deliveryId, orderId, partyId],
    );
    await db.query('UPDATE orders SET delivery_id=$1 WHERE id=$2', [
      deliveryId,
      orderId,
    ]);
    await db.query(
      `INSERT INTO payments
        (order_id,method,status,amount,currency_code,document_date,accounting_date)
       VALUES ($1,'cod','pending',105000,'IQD','2026-10-03','2026-10-03')`,
      [orderId],
    );
    await db.query(
      `INSERT INTO custody_holdings
        (id,order_id,order_item_id,delivery_id,custody_party_id,batch_id,quantity,remaining_quantity,unit_cost_iqd,status,issued_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,1,60000,'in_custody',now())`,
      [holdingId, orderId, orderItemId, deliveryId, partyId, stock.batch_id],
    );
    const handoverEntryId = randomUUID();
    await db.query(
      `INSERT INTO journal_entries
        (id,document_number,source_type,source_id,event,document_date,accounting_date,description,created_by)
       VALUES ($1,$2,'order',$3,'issue_to_custody','2026-10-03','2026-10-03','C5 fixture handover',$4)`,
      [
        handoverEntryId,
        `C5-HANDOVER-${orderId.slice(0, 8)}`,
        orderId,
        admin.user.id,
      ],
    );
    await db.query(
      `INSERT INTO journal_lines
        (entry_id,account_id,debit_base,credit_base,currency_code,original_amount,exchange_rate)
       SELECT $1,account.id,
              CASE WHEN account.code='1010' THEN 60000 ELSE 0 END,
              CASE WHEN account.code='1000' THEN 60000 ELSE 0 END,
              'IQD',60000,1
       FROM ledger_accounts account
       WHERE account.code IN ('1000','1010')`,
      [handoverEntryId],
    );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  return { orderId, deliveryId };
}

const expected = {
  delivered_full: [
    ['1010', 'credit', 60000],
    ['1020', 'debit', 105000],
    ['4000', 'credit', 100000],
    ['4010', 'credit', 5000],
    ['5000', 'debit', 60000],
  ],
  delivered_short: [
    ['1010', 'credit', 60000],
    ['1020', 'debit', 95000],
    ['1040', 'debit', 10000],
    ['4000', 'credit', 100000],
    ['4010', 'credit', 5000],
    ['5000', 'debit', 60000],
  ],
  delivered_unconfirmed: [
    ['1010', 'credit', 60000],
    ['1030', 'debit', 105000],
    ['4000', 'credit', 100000],
    ['4010', 'credit', 5000],
    ['5000', 'debit', 60000],
  ],
  later_full_confirmation: [
    ['1020', 'debit', 105000],
    ['1030', 'credit', 105000],
  ],
  later_short_confirmation: [
    ['1020', 'debit', 95000],
    ['1030', 'credit', 105000],
    ['1040', 'debit', 10000],
  ],
};

async function posting(deliveryId, event) {
  const rows = (
    await db.query(
      `SELECT account.code,
              CASE WHEN line.debit_base>0 THEN 'debit' ELSE 'credit' END AS side,
              greatest(line.debit_base,line.credit_base)::numeric AS amount
       FROM delivery_collections collection
       JOIN journal_entries entry ON entry.source_type='delivery_collection'
        AND entry.source_id=collection.id AND entry.event=$2
       JOIN journal_lines line ON line.entry_id=entry.id
       JOIN ledger_accounts account ON account.id=line.account_id
       WHERE collection.delivery_id=$1
       ORDER BY account.code`,
      [deliveryId, event],
    )
  ).rows.map((row) => [row.code, row.side, Number(row.amount)]);
  check(
    rows,
    expected[event],
    `${event} exactly matches the phase-3 posting map`,
  );
}

const full = await fixture('full', agent.user.id);
const fullResult = await request(`/deliveries/${full.deliveryId}`, {
  token: agentToken,
  method: 'PATCH',
  body: {
    status: 'delivered',
    order_version: 2,
    operation_id: 'c5-agent-full-delivery',
    collection_confirmation: 'confirmed',
    collected_amount: '105000',
  },
});
check(
  fullResult.collection.status,
  'confirmed_full',
  'agent records a full collection',
);
await posting(full.deliveryId, 'delivered_full');

const short = await fixture('short-boundary', external.id);
const shortResult = await request(
  `/admin/deliveries/${short.deliveryId}/status`,
  {
    token: adminToken,
    method: 'PATCH',
    body: {
      status: 'delivered',
      order_version: 2,
      operation_id: 'c5-staff-short-delivery',
      collection_confirmation: 'confirmed',
      collected_amount: '95000',
      event_at: '2026-10-31T21:30:00.000Z',
      source: 'driver telephone report',
    },
  },
);
check(
  shortResult.collection.status,
  'confirmed_short',
  'staff records a short collection',
);
check(
  shortResult.collection.accounting_date.slice(0, 10),
  '2026-11-01',
  '00:30 Baghdad on the first posts to the new month',
);
await posting(short.deliveryId, 'delivered_short');

async function deliverUnconfirmed(label) {
  const item = await fixture(label, external.id);
  const result = await request(`/admin/deliveries/${item.deliveryId}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: {
      status: 'delivered',
      order_version: 2,
      operation_id: `c5-${label}-delivery`,
      collection_confirmation: 'unconfirmed',
      source: 'paper driver sheet',
    },
  });
  check(result.collection.status, 'unconfirmed', `${label} starts unconfirmed`);
  await posting(item.deliveryId, 'delivered_unconfirmed');
  return item;
}

const laterFull = await deliverUnconfirmed('later-full');
const laterShort = await deliverUnconfirmed('later-short');
const pending = await request('/admin/deliveries/unconfirmed?per_page=100', {
  token: adminToken,
});
check(
  pending.data.map((item) => item.delivery_id).sort(),
  [laterFull.deliveryId, laterShort.deliveryId].sort(),
  'staff list contains every delivered-but-unconfirmed order',
);

const confirmedFull = await request(
  `/admin/deliveries/${laterFull.deliveryId}/collection-confirmation`,
  {
    token: adminToken,
    method: 'POST',
    body: {
      operation_id: 'c5-later-full-confirmation',
      collected_amount: '105000',
    },
  },
);
check(
  confirmedFull.status,
  'confirmed_full',
  'later full confirmation closes pending collection',
);
await posting(laterFull.deliveryId, 'later_full_confirmation');

const confirmedShort = await request(
  `/admin/deliveries/${laterShort.deliveryId}/collection-confirmation`,
  {
    token: adminToken,
    method: 'POST',
    body: {
      operation_id: 'c5-later-short-confirmation',
      collected_amount: '95000',
    },
  },
);
check(
  confirmedShort.status,
  'confirmed_short',
  'later short confirmation closes with an exception',
);
await posting(laterShort.deliveryId, 'later_short_confirmation');

const noLongerPending = await request(
  '/admin/deliveries/unconfirmed?per_page=100',
  {
    token: adminToken,
  },
);
check(
  noLongerPending.total,
  0,
  'confirmations remove deliveries from the unconfirmed list',
);

const agentCustody = await request('/deliveries/custody', {
  token: agentToken,
});
const externalCustody = await request(
  `/admin/delivery-parties/${external.id}/custody`,
  {
    token: adminToken,
  },
);
check(
  agentCustody.cash.amount,
  105000,
  'agent self-service shows confirmed COD custody',
);
check(
  externalCustody.cash.amount,
  295000,
  'external-party custody includes short and later-confirmed cash',
);
check(
  (await account1020Balance()) - cashBefore,
  agentCustody.cash.amount + externalCustody.cash.amount,
  'party cash custody totals equal the account 1020 ledger movement',
);

const paymentStatuses = (
  await db.query(
    `SELECT collection.status, payment.status AS payment_status
     FROM delivery_collections collection
     JOIN payments payment ON payment.order_id=collection.order_id
     WHERE collection.delivery_id=ANY($1::uuid[])
     ORDER BY collection.status, collection.delivery_id`,
    [
      [
        full.deliveryId,
        short.deliveryId,
        laterFull.deliveryId,
        laterShort.deliveryId,
      ],
    ],
  )
).rows;
check(
  paymentStatuses.map((row) => [row.status, row.payment_status]),
  [
    ['confirmed_full', 'paid'],
    ['confirmed_full', 'paid'],
    ['confirmed_short', 'pending'],
    ['confirmed_short', 'pending'],
  ],
  'only full confirmed COD is reconciled as paid',
);

await db.end();
console.log(`delivery collection acceptance: ${assertions} assertions`);
