import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error('Trip acceptance requires an isolated *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Trip acceptance requires the runner-owned loopback API');
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

async function scalar(sql, values = []) {
  return (await db.query(sql, values)).rows[0].value;
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

const admin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
});
const adminToken = admin.access_token;
const operationsId = await scalar(
  "SELECT id::text AS value FROM users WHERE username='operations'",
);
await db.query(
  `INSERT INTO user_presets (user_id,preset_id,assigned_by,reason)
   SELECT $1,preset.id,$2,'C8 acceptance trip settlement duties'
   FROM permission_presets preset WHERE preset.name='cashier'
   ON CONFLICT (user_id,preset_id) DO UPDATE
   SET assigned_by=excluded.assigned_by,reason=excluded.reason`,
  [operationsId, admin.user.id],
);
await db.query(
  'UPDATE users SET permission_version=permission_version+1 WHERE id=$1',
  [operationsId],
);
const operations = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'operations', password: 'Shubayr-Dev-Staff!2026' },
});
const operationsToken = operations.access_token;
const customerId = await scalar(
  "SELECT id::text AS value FROM users WHERE phone='+9647700000006'",
);
const today = baghdadDate();
await db.query(
  "UPDATE store_settings SET value='standard' WHERE key='separation_of_duties_level'",
);

const driver = await request('/admin/external-drivers', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    name: 'C8 Trip Driver',
    phone: `+96476${Date.now()}`.slice(0, 16),
    vehicle_number: 'C8-TRIP',
  },
});
const till = await request('/admin/cash-accounts', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    name: `C8 Till ${randomUUID().slice(0, 8)}`,
    kind: 'cash',
    currency_code: 'IQD',
  },
});
const stock = (
  await db.query(`
    SELECT batch.id AS batch_id, batch.variant_id, variant.product_id,
           balance.location_id
    FROM inventory_batches batch
    JOIN product_variants variant ON variant.id=batch.variant_id
    JOIN batch_stock balance ON balance.batch_id=batch.id
    JOIN sku_costs cost ON cost.variant_id=batch.variant_id
    WHERE balance.quantity-balance.reserved>20
      AND cost.book_quantity>20 AND cost.average_cost_iqd>0
    ORDER BY balance.quantity DESC, batch.id LIMIT 1`)
).rows[0];
assert.ok(stock, 'a stock batch with enough available units is required');
assertions += 1;

async function ledgerBalance(code) {
  return Number(
    await scalar(
      `SELECT coalesce(sum(line.debit_base-line.credit_base),0)::numeric AS value
       FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
       WHERE account.code=$1`,
      [code],
    ),
  );
}

const baseline = {
  cash: await ledgerBalance('1020'),
  goods: await ledgerBalance('1010'),
  inventory: await ledgerBalance('1000'),
  book: Number(
    await scalar(
      'SELECT coalesce(sum(book_value_iqd),0)::numeric AS value FROM sku_costs',
    ),
  ),
};
const baselineInventoryGap = Number(
  (baseline.book - baseline.inventory).toFixed(4),
);

async function readyOrder(label, goodsAmount, deliveryFee = 0) {
  const orderId = randomUUID();
  const itemId = randomUUID();
  const deliveryId = randomUUID();
  const reservationId = randomUUID();
  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO orders
        (id,user_id,order_number,status,version,payment_method,subtotal,delivery_fee,discount,total,currency_code,document_date,accounting_date,delivery_contact_phone,delivery_city,delivery_area,delivery_street)
       VALUES ($1,$2,$3,'ready_for_dispatch',4,'cod',$4,$5,0,$6,'IQD',$7,$7,'+9647700000006','Baghdad','Karrada','C8 route')`,
      [
        orderId,
        customerId,
        `VERIFY-C8-${label}-${orderId.slice(0, 8)}`,
        goodsAmount,
        deliveryFee,
        goodsAmount + deliveryFee,
        today,
      ],
    );
    await db.query(
      `INSERT INTO order_items
        (id,order_id,product_id,variant_id,product_name_ar,product_name_en,quantity,unit_price,line_total,currency_code)
       VALUES ($1,$2,$3,$4,'اختبار رحلة','C8 trip fixture',1,$5,$5,'IQD')`,
      [itemId, orderId, stock.product_id, stock.variant_id, goodsAmount],
    );
    await db.query(
      `INSERT INTO deliveries (id,order_id,status,delivery_fee,currency_code)
       VALUES ($1,$2,'assigned',$3,'IQD')`,
      [deliveryId, orderId, deliveryFee],
    );
    await db.query('UPDATE orders SET delivery_id=$1 WHERE id=$2', [
      deliveryId,
      orderId,
    ]);
    await db.query(
      `INSERT INTO payments
        (order_id,method,status,amount,currency_code,document_date,accounting_date)
       VALUES ($1,'cod','pending',$2,'IQD',$3,$3)`,
      [orderId, goodsAmount + deliveryFee, today],
    );
    await db.query(
      `INSERT INTO stock_reservations
        (id,order_id,order_item_id,batch_id,location_id,quantity,status)
       VALUES ($1,$2,$3,$4,$5,1,'reserved')`,
      [reservationId, orderId, itemId, stock.batch_id, stock.location_id],
    );
    await db.query(
      `UPDATE batch_stock SET reserved=reserved+1
       WHERE batch_id=$1 AND location_id=$2`,
      [stock.batch_id, stock.location_id],
    );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  return { orderId, itemId, deliveryId, total: goodsAmount + deliveryFee };
}

async function createTrip(label, fare) {
  const input = {
    operation_id: `c8-create-${label}-${randomUUID()}`,
    driver_party_id: driver.id,
    fare_bearer: fare.bearer,
    fare_amount_iqd: String(fare.amount),
    fare_settlement_method: fare.method,
    ...(fare.cashAccountId ? { fare_cash_account_id: fare.cashAccountId } : {}),
    failure_cancellation_agreement:
      'One fare follows the recorded trip outcome',
    document_date: today,
  };
  return request('/admin/external-driver-trips', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: input,
  });
}

async function addOrder(
  trip,
  order,
  share,
  acceptance = undefined,
  eventAt = new Date().toISOString(),
) {
  return request(`/admin/external-driver-trips/${trip.id}/orders`, {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `c8-handover-${randomUUID()}`,
      order_id: order.orderId,
      order_version: 4,
      fare_share_iqd: String(share),
      source: 'signed custody voucher',
      event_at: eventAt,
      ...(acceptance ? { customer_acceptance_note: acceptance } : {}),
    },
  });
}

async function startTrip(trip) {
  return request(`/admin/external-driver-trips/${trip.id}/start`, {
    token: adminToken,
    method: 'POST',
    body: {
      operation_id: `c8-start-${randomUUID()}`,
      source: 'dispatch desk',
      event_at: new Date().toISOString(),
    },
  });
}

async function deliver(
  order,
  collected,
  confirmation = 'confirmed',
  eventAt = new Date().toISOString(),
) {
  return request(`/admin/deliveries/${order.deliveryId}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: {
      status: 'delivered',
      order_version: 5,
      operation_id: `c8-delivery-${randomUUID()}`,
      collection_confirmation: confirmation,
      ...(confirmation === 'confirmed'
        ? { collected_amount: String(collected) }
        : {}),
      source: 'external driver receipt',
      event_at: eventAt,
    },
  });
}

async function receive(amount, allocations) {
  return request('/admin/cash-receipts', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `c8-receipt-${randomUUID()}`,
      document_date: today,
      party_id: driver.id,
      cash_account_id: till.id,
      amount_iqd: String(amount),
      allocations: allocations.map(([order, value]) => ({
        order_id: order.orderId,
        amount_iqd: String(value),
      })),
    },
  });
}

async function closeTrip(
  trip,
  token = operationsToken,
  operationId = `c8-close-${randomUUID()}`,
) {
  const input = {
    operation_id: operationId,
    document_date: today,
    source: 'cashier settlement review',
    event_at: new Date().toISOString(),
  };
  const result = await request(
    `/admin/external-driver-trips/${trip.id}/close`,
    {
      token,
      method: 'POST',
      body: input,
    },
  );
  return { result, input };
}

const customerTrip = await createTrip('customer-direct', {
  bearer: 'customer_direct',
  amount: 3000,
  method: 'customer_direct',
});
const customerOrders = [
  await readyOrder('customer-a', 120000),
  await readyOrder('customer-b', 100000),
  await readyOrder('customer-c', 80000),
];
for (const order of customerOrders) {
  await addOrder(
    customerTrip,
    order,
    1000,
    'Customer accepted IQD 1,000 direct fare before dispatch',
  );
}
const startedCustomerTrip = await startTrip(customerTrip);
check(
  startedCustomerTrip.status,
  'in_progress',
  'three-order customer-direct trip starts',
);
for (const order of customerOrders) await deliver(order, order.total);
await receive(250000, [
  [customerOrders[0], 120000],
  [customerOrders[1], 100000],
  [customerOrders[2], 30000],
]);
const ownClose = await request(
  `/admin/external-driver-trips/${customerTrip.id}/close`,
  {
    token: adminToken,
    method: 'POST',
    expected: 403,
    body: {
      operation_id: `c8-self-close-${randomUUID()}`,
      document_date: today,
      source: 'self approval attempt',
      event_at: new Date().toISOString(),
    },
  },
);
check(
  ownClose.code,
  'SEPARATION_OF_DUTIES_VIOLATION',
  'trip creator cannot approve their own close',
);
const customerClosed = await closeTrip(customerTrip);
check(
  [
    customerClosed.result.fare.accrual_journal_entry_id,
    customerClosed.result.settlement.expected_cash_iqd,
    customerClosed.result.settlement.received_cash_iqd,
    customerClosed.result.settlement.outstanding_cash_iqd,
    customerClosed.result.settlement.result,
  ],
  [null, 300000, 250000, 50000, 'settlement_open'],
  'customer-direct fare is outside store postings and cash difference remains visible',
);
check(
  Number(
    await scalar(
      "SELECT count(*)::int AS value FROM journal_entries WHERE source_type='external_driver_trip' AND source_id=$1",
      [customerTrip.id],
    ),
  ),
  0,
  'customer-direct fare produces no store expense, revenue, payable, or netting entry',
);
const replayedClose = await request(
  `/admin/external-driver-trips/${customerTrip.id}/close`,
  {
    token: operationsToken,
    method: 'POST',
    body: customerClosed.input,
  },
);
check(
  replayedClose.id,
  customerTrip.id,
  'trip close operation replay returns one document',
);

const badTrip = await createTrip('double-charge', {
  bearer: 'customer_direct',
  amount: 1000,
  method: 'customer_direct',
});
const badOrder = await readyOrder('double-charge', 40000, 5000);
const doubleCharge = await request(
  `/admin/external-driver-trips/${badTrip.id}/orders`,
  {
    token: adminToken,
    method: 'POST',
    expected: 409,
    body: {
      operation_id: `c8-double-${randomUUID()}`,
      order_id: badOrder.orderId,
      order_version: 4,
      fare_share_iqd: '1000',
      source: 'dispatch desk',
      event_at: new Date().toISOString(),
      customer_acceptance_note: 'Customer direct fare',
    },
  },
);
check(
  doubleCharge.code,
  'DOUBLE_DELIVERY_CHARGE',
  'server refuses a direct fare plus store delivery fee',
);

const paidTrip = await createTrip('store-cash', {
  bearer: 'store',
  amount: 3000,
  method: 'cash_account',
  cashAccountId: till.id,
});
const paidOrder = await readyOrder('store-cash', 100000, 5000);
const baghdadMonthBoundary = '2026-10-01T00:30:00+03:00';
await addOrder(paidTrip, paidOrder, 3000, undefined, baghdadMonthBoundary);
await startTrip(paidTrip);
await deliver(paidOrder, 105000, 'confirmed', baghdadMonthBoundary);
await receive(105000, [[paidOrder, 105000]]);
const paidClosed = (await closeTrip(paidTrip)).result;
check(
  Boolean(
    paidClosed.fare.accrual_journal_entry_id &&
    paidClosed.fare.payment_journal_entry_id,
  ),
  true,
  'store-paid cash fare accrues once and is paid from the selected account',
);
const paidPosting = (
  await db.query(
    `SELECT entry.event,account.code,
            CASE WHEN line.debit_base>0 THEN 'debit' ELSE 'credit' END AS side,
            greatest(line.debit_base,line.credit_base)::numeric AS amount
     FROM journal_entries entry JOIN journal_lines line ON line.entry_id=entry.id
     JOIN ledger_accounts account ON account.id=line.account_id
     WHERE entry.source_type='external_driver_trip' AND entry.source_id=$1
     ORDER BY entry.event,account.code`,
    [paidTrip.id],
  )
).rows.map((row) => [row.event, row.code, row.side, Number(row.amount)]);
check(
  paidPosting,
  [
    ['fare_accrual', '2020', 'credit', 3000],
    ['fare_accrual', '5040', 'debit', 3000],
    ['fare_payment', '2020', 'debit', 3000],
    ['fare_payment', till.ledger_account.code, 'credit', 3000],
  ],
  'store fare uses the phase-3 wage accrual and payment maps exactly once',
);
check(
  (
    await db.query(
      `SELECT entry.document_date::text AS issue_date,
              collection.accounting_date::text AS collection_date
       FROM journal_entries entry
       JOIN delivery_collections collection ON collection.order_id=$1
       WHERE entry.source_type='order' AND entry.source_id=$1
         AND entry.event='issue_to_custody'`,
      [paidOrder.orderId],
    )
  ).rows[0],
  { issue_date: '2026-10-01', collection_date: '2026-10-01' },
  '00:30 Baghdad on the first stays in the new business month for custody and collection',
);

const netTrip = await createTrip('store-net', {
  bearer: 'store',
  amount: 3000,
  method: 'driver_keeps',
});
const netOrder = await readyOrder('store-net', 100000);
await addOrder(netTrip, netOrder, 3000);
await startTrip(netTrip);
await deliver(netOrder, 100000);
await receive(97000, [[netOrder, 97000]]);
const netClosed = (await closeTrip(netTrip)).result;
check(
  [
    netClosed.settlement.received_cash_iqd,
    netClosed.settlement.netted_fare_iqd,
    netClosed.settlement.outstanding_cash_iqd,
  ],
  [97000, 3000, 0],
  'driver-kept store fare is netted once against unsettled trip collection cash',
);
const netCollection = await request(
  `/admin/delivery-parties/${driver.id}/collections?order_id=${netOrder.orderId}`,
  { token: adminToken },
);
check(
  [
    netCollection.data[0].settlement_status,
    netCollection.data[0].fare_netted_amount_iqd,
  ],
  ['settled', 3000],
  'per-party collection read shows fare netting and settlement',
);

const exceptionTrip = await createTrip('exceptions', {
  bearer: 'store',
  amount: 0,
  method: 'payable',
});
const failedOrder = await readyOrder('failed', 60000);
const returnedOrder = await readyOrder('door-return', 50000);
await addOrder(exceptionTrip, failedOrder, 0);
await addOrder(exceptionTrip, returnedOrder, 0);
await startTrip(exceptionTrip);
await request(`/admin/deliveries/${failedOrder.deliveryId}/status`, {
  token: adminToken,
  method: 'PATCH',
  body: { status: 'failed', order_version: 5, reason: 'Customer unavailable' },
});
const unresolvedClose = await request(
  `/admin/external-driver-trips/${exceptionTrip.id}/close`,
  {
    token: operationsToken,
    method: 'POST',
    expected: 409,
    body: {
      operation_id: `c8-unresolved-${randomUUID()}`,
      document_date: today,
      source: 'settlement review',
      event_at: new Date().toISOString(),
    },
  },
);
check(
  unresolvedClose.code,
  'TRIP_ORDERS_UNRESOLVED',
  'trip close is refused while an order is unresolved',
);
const retrieval = await request(
  `/admin/orders/${failedOrder.orderId}/retrievals`,
  {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `c8-retrieval-${randomUUID()}`,
      outcome: 'retry',
      reason: 'Failed external-driver order returned to store',
    },
  },
);
await request(`/admin/retrievals/${retrieval.id}/receive`, {
  token: adminToken,
  method: 'POST',
  body: {
    operation_id: `c8-retrieval-receive-${randomUUID()}`,
    lines: retrieval.lines.map((line) => ({
      line_id: line.id,
      location_id: stock.location_id,
      quantity: String(line.expected_quantity),
    })),
  },
});
await deliver(returnedOrder, 0);
const returnedHolding = await scalar(
  'SELECT id::text AS value FROM custody_holdings WHERE order_id=$1',
  [returnedOrder.orderId],
);
await request('/admin/custody-exceptions/return-against-uncollected', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `c8-door-return-${randomUUID()}`,
    document_date: today,
    order_id: returnedOrder.orderId,
    reason: 'Customer refused the parcel at the door',
    lines: [
      {
        custody_holding_id: returnedHolding,
        location_id: stock.location_id,
        quantity: '1',
      },
    ],
  },
});
const exceptionClosed = (await closeTrip(exceptionTrip)).result;
check(
  exceptionClosed.orders.map((row) => row.status).sort(),
  ['ready_for_dispatch', 'returned'],
  'failed retrieval and return-at-door outcomes remain visible inside the closed trip',
);

const unconfirmedTrip = await createTrip('unconfirmed-sort', {
  bearer: 'store',
  amount: 0,
  method: 'payable',
});
const low = await readyOrder('unconfirmed-low', 70000);
const high = await readyOrder('unconfirmed-high', 90000);
await addOrder(unconfirmedTrip, low, 0);
await addOrder(unconfirmedTrip, high, 0);
await startTrip(unconfirmedTrip);
await deliver(low, 0, 'unconfirmed');
await deliver(high, 0, 'unconfirmed');
const amountAsc = await request(
  `/admin/deliveries/unconfirmed?party_id=${driver.id}&sort_by=amount&sort_direction=asc&per_page=100`,
  { token: adminToken },
);
const amounts = amountAsc.data
  .filter((row) => [low.orderId, high.orderId].includes(row.order_id))
  .map((row) => row.due_amount);
check(
  amounts,
  [70000, 90000],
  'unconfirmed collections sort by amount ascending',
);
const dateDesc = await request(
  `/admin/delivery-parties/${driver.id}/collections?sort_by=date&sort_direction=desc&per_page=100`,
  { token: adminToken },
);
check(
  dateDesc.data[0].delivered_at >= dateDesc.data.at(-1).delivered_at,
  true,
  'party collections default-compatible newest-first date sort is stable',
);
const search = await request(
  '/admin/delivery-parties?q=Trip%20Driver&per_page=1',
  {
    token: adminToken,
  },
);
check(
  search.data[0].id,
  driver.id,
  'delivery-party picker search finds a driver beyond page limits',
);
const tripList = await request(
  `/admin/external-driver-trips?driver_party_id=${driver.id}&status=closed&date_from=${today}&date_to=${today}&per_page=100`,
  { token: adminToken },
);
check(
  tripList.data.some((trip) => trip.id === customerTrip.id),
  true,
  'trip list applies driver, status and date filters',
);
const statement = await request(
  `/admin/delivery-parties/${driver.id}/statement?per_page=100`,
  {
    token: adminToken,
  },
);
check(
  statement.trips.some((trip) => trip.id === netTrip.id),
  true,
  'external-driver statement includes trips',
);
check(
  statement.cash_activity.data.some((row) => row.event === 'trip_fare_netted'),
  true,
  'driver statement shows fare netting against collections',
);

const custody = await request(`/admin/delivery-parties/${driver.id}/custody`, {
  token: adminToken,
});
const finalCashDelta = Number(
  ((await ledgerBalance('1020')) - baseline.cash).toFixed(4),
);
check(
  Number(custody.cash.amount.toFixed(4)),
  finalCashDelta,
  'party cash custody equals account 1020 movement',
);
check(
  custody.goods.quantity,
  0,
  'all resolved trip goods leave driver custody exactly once',
);
check(
  Number(((await ledgerBalance('1010')) - baseline.goods).toFixed(4)),
  0,
  'goods-in-custody ledger returns to its opening balance',
);
const finalBook = Number(
  await scalar(
    'SELECT coalesce(sum(book_value_iqd),0)::numeric AS value FROM sku_costs',
  ),
);
const finalInventory = await ledgerBalance('1000');
check(
  Math.abs(finalBook - finalInventory - baselineInventoryGap) < 0.01,
  true,
  'inventory book value reconciles to the ledger within sub-fils costing precision',
);
check(
  Number(
    await scalar(
      "SELECT count(*)::int AS value FROM audit_logs WHERE entity_type='external_driver_trip' AND actor_id IN ($1,$2)",
      [admin.user.id, operations.user.id],
    ),
  ) > 0,
  true,
  'trip events are audited with the recording staff member',
);

await db.end();
console.log(
  `External-driver trip acceptance passed (${assertions} assertions).`,
);
