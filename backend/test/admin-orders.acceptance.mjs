import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Admin order acceptance requires the isolated *_verify database runner',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1' || !new URL(api).port) {
  throw new Error('Acceptance requires the runner-owned loopback API URL');
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

async function login(phone) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone },
    expected: 201,
  });
  return request('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: challenge.dev_otp },
    expected: 201,
  });
}

async function scalar(sql, values = []) {
  const result = await db.query(sql, values);
  return result.rows[0]?.value;
}

try {
  const [adminSession, warehouseSession, agentSession, customerSession] =
    await Promise.all([
      login('+9647700000001'),
      login('+9647700000004'),
      login('+9647700000005'),
      login('+9647700000006'),
    ]);
  const admin = adminSession.access_token;
  const warehouse = warehouseSession.access_token;
  const agent = agentSession.access_token;
  const customerId = customerSession.user.id;

  const all = await request('/admin/orders?per_page=100', { token: admin });
  check(
    all.total,
    Number(await scalar('SELECT count(*)::int AS value FROM orders')),
    'unfiltered total is exact',
  );
  for (const status of [
    'pending',
    'confirmed',
    'processing',
    'out_for_delivery',
    'delivered',
    'cancelled',
  ]) {
    check(
      all.data.some((order) => order.status === status),
      true,
      `seed includes ${status}`,
    );
  }

  const preparing = await request(
    '/admin/orders?status=processing&per_page=100',
    { token: admin },
  );
  check(
    preparing.total,
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM orders WHERE status='processing'",
      ),
    ),
    'status total is filtered',
  );
  check(
    preparing.data.every((order) => order.status === 'processing'),
    true,
    'status filter applies before pagination',
  );

  const searched = await request('/admin/orders?q=order-8', { token: admin });
  check(searched.total, 1, 'order-number search total');
  check(
    searched.data[0].order_number,
    'DEV-ORDER-8',
    'order-number search is case-insensitive',
  );

  const customerOrders = await request(
    `/admin/orders?customer_id=${customerId}&per_page=100`,
    { token: admin },
  );
  check(
    customerOrders.total,
    all.total,
    'customer filter returns only the seeded customer orders',
  );
  check(
    customerOrders.data.every((order) => order.customer.id === customerId),
    true,
    'customer filter is applied',
  );

  const datedOrder = all.data.find(
    (order) => order.order_number === 'DEV-ORDER-4',
  );
  const date = datedOrder.placed_at.slice(0, 10);
  const dated = await request(
    `/admin/orders?from=${date}&to=${date}&per_page=100`,
    { token: admin },
  );
  const directDateTotal = Number(
    await scalar(
      "SELECT count(*)::int AS value FROM orders WHERE placed_at >= $1::date AND placed_at < $1::date + interval '1 day'",
      [date],
    ),
  );
  check(dated.total, directDateTotal, 'inclusive UTC date range total');
  await request('/admin/orders?from=2026-09-22&to=2026-09-21', {
    token: admin,
    expected: 422,
  });

  await db.query(
    "UPDATE orders SET placed_at='2026-01-01T00:00:00Z' WHERE order_number IN ('DEV-ORDER-6','DEV-ORDER-7')",
  );
  const pageOne = await request('/admin/orders?page=1&per_page=4', {
    token: admin,
  });
  const pageTwo = await request('/admin/orders?page=2&per_page=4', {
    token: admin,
  });
  const expectedIds = (
    await db.query(
      'SELECT id FROM orders ORDER BY placed_at DESC, id DESC LIMIT 8',
    )
  ).rows.map((row) => row.id);
  check(
    [...pageOne.data, ...pageTwo.data].map((order) => order.id),
    expectedIds,
    'pagination uses placed_at plus unique id ordering',
  );
  check(pageOne.total, pageTwo.total, 'pagination total is stable');

  const pending = all.data.find(
    (order) => order.order_number === 'DEV-ORDER-1',
  );
  const detail = await request(`/admin/orders/${pending.id}`, { token: admin });
  check(detail.customer.id, customerId, 'detail includes customer');
  check(
    detail.shipping_snapshot.city,
    detail.delivery_city,
    'detail includes immutable shipping snapshot',
  );
  check(
    detail.items.length > 0,
    true,
    'detail includes immutable line snapshots',
  );
  check(
    detail.payments[0].status,
    'pending',
    'detail includes pending COD payment',
  );
  check(
    detail.delivery.agent.id,
    agentSession.user.id,
    'detail includes delivery agent',
  );

  await request('/admin/orders', { token: warehouse, expected: 403 });
  await request(`/admin/orders/${pending.id}`, {
    token: warehouse,
    expected: 403,
  });
  await request(`/admin/orders/${pending.id}/status`, {
    token: warehouse,
    method: 'PATCH',
    body: { status: 'confirmed' },
    expected: 403,
  });
  await request(`/admin/orders/${pending.id}/cancel`, {
    token: warehouse,
    method: 'POST',
    body: { reason: 'not permitted' },
    expected: 403,
  });

  const confirmedSeed = all.data.find(
    (order) => order.order_number === 'DEV-ORDER-2',
  );
  await request(`/admin/orders/${confirmedSeed.id}/status`, {
    token: admin,
    method: 'PATCH',
    body: { status: 'ready_for_dispatch' },
    expected: 409,
  });
  await request(`/admin/orders/${pending.id}/cancel`, {
    token: admin,
    method: 'POST',
    body: { reason: '   ' },
    expected: 422,
  });

  for (const status of ['confirmed', 'processing', 'ready_for_dispatch']) {
    const updated = await request(`/admin/orders/${pending.id}/status`, {
      token: admin,
      method: 'PATCH',
      body: { status },
    });
    check(updated.status, status, `legal staff transition to ${status}`);
  }
  const deliveryCount = Number(
    await scalar(
      'SELECT count(*)::int AS value FROM deliveries WHERE order_id=$1',
      [pending.id],
    ),
  );
  await request(`/deliveries/${pending.delivery.id}/assign`, {
    token: admin,
    method: 'PATCH',
    body: { agent_id: agentSession.user.id },
  });
  const dispatched = await request(`/admin/orders/${pending.id}/status`, {
    token: admin,
    method: 'PATCH',
    body: { status: 'out_for_delivery', note: 'Courier handoff' },
  });
  check(dispatched.status, 'out_for_delivery', 'staff dispatches ready order');
  check(
    dispatched.delivery.id,
    pending.delivery.id,
    'dispatch reuses current delivery',
  );
  check(
    dispatched.delivery.status,
    'out_for_delivery',
    'dispatch starts existing delivery',
  );
  check(
    Number(
      await scalar(
        'SELECT count(*)::int AS value FROM deliveries WHERE order_id=$1',
        [pending.id],
      ),
    ),
    deliveryCount,
    'dispatch creates no duplicate delivery',
  );
  check(
    await scalar(
      'SELECT status AS value FROM simple_stock_holds WHERE order_id=$1',
      [pending.id],
    ),
    'deducted',
    'dispatch converts hold to deducted',
  );

  await request(`/deliveries/${pending.delivery.id}`, {
    token: agent,
    method: 'PATCH',
    body: { status: 'delivered' },
  });
  check(
    await scalar(
      "SELECT status AS value FROM payments WHERE order_id=$1 AND method='cod'",
      [pending.id],
    ),
    'paid',
    'delivered reconciles COD to paid',
  );
  check(
    Boolean(
      await scalar(
        "SELECT paid_at AS value FROM payments WHERE order_id=$1 AND method='cod'",
        [pending.id],
      ),
    ),
    true,
    'delivered stamps COD paid_at',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM audit_logs WHERE action='payment.reconcile_cod' AND entity_id=(SELECT id FROM payments WHERE order_id=$1 LIMIT 1)",
        [pending.id],
      ),
    ),
    1,
    'COD reconciliation is audited once',
  );

  const cancellable = all.data.find(
    (order) => order.order_number === 'DEV-ORDER-8',
  );
  const productId = cancellable.items[0].product_id;
  const variantId = cancellable.items[0].variant_id;
  const available = (payload) =>
    payload.variants.find((variant) => variant.variant_id === variantId)
      .available_qty;
  const stockBefore = await request(`/products/${productId}/availability`);
  const cancelled = await request(`/admin/orders/${cancellable.id}/cancel`, {
    token: admin,
    method: 'POST',
    body: { reason: 'Customer requested staff cancellation' },
  });
  check(cancelled.status, 'cancelled', 'staff cancels processing order');
  const stockAfter = await request(`/products/${productId}/availability`);
  check(
    available(stockAfter),
    available(stockBefore) + cancellable.items[0].quantity,
    'cancellation restores available stock',
  );
  check(
    await scalar(
      'SELECT status AS value FROM simple_stock_holds WHERE order_id=$1',
      [cancellable.id],
    ),
    'released',
    'cancellation marks hold released',
  );
  check(
    await scalar('SELECT status AS value FROM payments WHERE order_id=$1', [
      cancellable.id,
    ]),
    'pending',
    'cancelled COD never becomes paid',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM audit_logs WHERE action='order.cancel' AND entity_id=$1",
        [cancellable.id],
      ),
    ),
    1,
    'staff cancellation is audited',
  );

  for (const number of [3, 4]) {
    const terminal = all.data.find(
      (order) => order.order_number === `DEV-ORDER-${number}`,
    );
    await request(`/admin/orders/${terminal.id}/cancel`, {
      token: admin,
      method: 'POST',
      body: { reason: 'Too late' },
      expected: 409,
    });
  }
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM audit_logs WHERE entity_id=$1 AND action IN ('order.transition','order.dispatch')",
        [pending.id],
      ),
    ) >= 4,
    true,
    'every staff lifecycle transition is audited',
  );

  console.log(`Admin order acceptance passed (${assertions} assertions).`);
} finally {
  await db.end();
}
