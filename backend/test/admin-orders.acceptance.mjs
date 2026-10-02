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
    expected: 200,
  });
  return request('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: challenge.dev_otp },
    expected: 200,
  });
}

function adminLogin(username, password) {
  return request('/admin/auth/login', {
    method: 'POST',
    body: { username, password },
    expected: 201,
  });
}

async function scalar(sql, values = []) {
  const result = await db.query(sql, values);
  return result.rows[0]?.value;
}

try {
  const [
    adminSession,
    operationsSession,
    warehouseSession,
    agentSession,
    customerSession,
  ] = await Promise.all([
    adminLogin('admin', 'Shubayr-Dev-Admin!2026'),
    adminLogin('operations', 'Shubayr-Dev-Staff!2026'),
    adminLogin('stock', 'Shubayr-Dev-Staff!2026'),
    login('+9647700000005'),
    login('+9647700000006'),
  ]);
  const admin = adminSession.access_token;
  const operations = operationsSession.access_token;
  const warehouse = warehouseSession.access_token;
  const agent = agentSession.access_token;
  const customerId = customerSession.user.id;

  const agentPage = await request('/admin/delivery-agents?per_page=1', {
    token: operations,
  });
  check(agentPage.data.length, 1, 'delivery-agent picker paginates');
  check(
    agentPage.total >= 2,
    true,
    'delivery-agent picker lists active agents',
  );
  check(
    Object.keys(agentPage.data[0]).sort(),
    ['id', 'name', 'phone'],
    'delivery-agent picker exposes only assignment fields',
  );
  const searchedAgents = await request(
    `/admin/delivery-agents?q=${encodeURIComponent('Delivery B')}`,
    { token: operations },
  );
  check(searchedAgents.total, 1, 'delivery-agent picker searches server-side');
  check(
    searchedAgents.data[0].phone,
    '+9647700000007',
    'delivery-agent search returns the matching active work phone',
  );
  await request('/admin/staff', { token: operations, expected: 403 });

  const all = await request('/admin/orders?per_page=100', { token: admin });
  check(
    all.total,
    Number(await scalar('SELECT count(*)::int AS value FROM orders')),
    'unfiltered total is exact',
  );
  for (const status of [
    'pending',
    'confirmed',
    'preparing',
    'dispatched',
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
    '/admin/orders?status=preparing&per_page=100',
    { token: admin },
  );
  check(
    preparing.total,
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM orders WHERE status='preparing'",
      ),
    ),
    'status total is filtered',
  );
  check(
    preparing.data.every((order) => order.status === 'preparing'),
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
    body: { status: 'ready_for_dispatch', version: confirmedSeed.version },
    expected: 409,
  });
  await request(`/admin/orders/${pending.id}/cancel`, {
    token: admin,
    method: 'POST',
    body: { reason: '   ', version: pending.version },
    expected: 422,
  });

  let currentOrder = pending;
  for (const status of ['confirmed', 'preparing', 'ready_for_dispatch']) {
    const updated = await request(`/admin/orders/${pending.id}/status`, {
      token: admin,
      method: 'PATCH',
      body: { status, version: currentOrder.version },
    });
    check(updated.status, status, `legal staff transition to ${status}`);
    currentOrder = updated;
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
    body: {
      status: 'dispatched',
      version: currentOrder.version,
      note: 'Courier handoff',
    },
  });
  check(dispatched.status, 'dispatched', 'staff dispatches ready order');
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
      'SELECT status AS value FROM stock_reservations WHERE order_id=$1 LIMIT 1',
      [pending.id],
    ),
    'consumed',
    'dispatch consumes the lot reservation',
  );

  await request(`/deliveries/${pending.delivery.id}`, {
    token: agent,
    method: 'PATCH',
    body: { status: 'delivered', order_version: dispatched.version },
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

  const rejectable = all.data.find(
    (order) => order.order_number === 'DEV-ORDER-9',
  );
  await db.query('BEGIN');
  try {
    await db.query("UPDATE orders SET status='pending' WHERE id=$1", [
      rejectable.id,
    ]);
    await db.query(
      `UPDATE batch_stock AS stock
       SET reserved = stock.reserved + reservation.quantity
       FROM stock_reservations AS reservation
       WHERE reservation.order_id = $1
         AND stock.batch_id = reservation.batch_id
         AND stock.location_id = reservation.location_id`,
      [rejectable.id],
    );
    await db.query(
      "UPDATE stock_reservations SET status='reserved', released_at=NULL WHERE order_id=$1",
      [rejectable.id],
    );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  await request(`/admin/orders/${rejectable.id}/reject`, {
    token: operations,
    method: 'POST',
    body: { reason: '   ', version: rejectable.version },
    expected: 422,
  });
  await request(`/admin/orders/${rejectable.id}/reject`, {
    token: warehouse,
    method: 'POST',
    body: { reason: 'not permitted' },
    expected: 403,
  });
  const rejectedProductId = rejectable.items[0].product_id;
  const rejectedVariantId = rejectable.items[0].variant_id;
  const rejectedStockBefore = await request(
    `/products/${rejectedProductId}/availability`,
  );
  const rejected = await request(`/admin/orders/${rejectable.id}/reject`, {
    token: operations,
    method: 'POST',
    body: { reason: 'Item cannot be fulfilled', version: rejectable.version },
  });
  check(rejected.status, 'rejected', 'operations rejects a pending order');
  check(
    await scalar(
      'SELECT status AS value FROM stock_reservations WHERE order_id=$1 LIMIT 1',
      [rejectable.id],
    ),
    'released',
    'rejection releases the lot reservation',
  );
  const rejectedStockAfter = await request(
    `/products/${rejectedProductId}/availability`,
  );
  const rejectedAvailability = (payload) =>
    payload.variants.find((variant) => variant.variant_id === rejectedVariantId)
      .available_qty;
  check(
    rejectedAvailability(rejectedStockAfter),
    rejectedAvailability(rejectedStockBefore) + rejectable.items[0].quantity,
    'rejection restores available stock',
  );
  check(
    await scalar(
      'SELECT note AS value FROM order_status_events WHERE order_id=$1 AND status=$2 ORDER BY at DESC LIMIT 1',
      [rejectable.id, 'rejected'],
    ),
    'Item cannot be fulfilled',
    'rejection reason is retained in the timeline',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM audit_logs WHERE action='order.reject' AND entity_id=$1",
        [rejectable.id],
      ),
    ),
    1,
    'rejection is audited',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM notification_events WHERE type='order_rejected' AND entity_id=$1 AND target_role='customer'",
        [rejectable.id],
      ),
    ),
    1,
    'rejection notifies the customer',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM notification_events WHERE type='order_rejected' AND entity_id=$1 AND target_role='order_monitor'",
        [rejectable.id],
      ),
    ) >= 1,
    true,
    'rejection emits the monitor event',
  );
  await request(`/admin/orders/${rejectable.id}/reject`, {
    token: operations,
    method: 'POST',
    body: { reason: 'second rejection', version: rejected.version },
    expected: 409,
  });
  await request(`/admin/orders/${rejectable.id}/cancel`, {
    token: admin,
    method: 'POST',
    body: {
      reason: 'rejection is not cancellation',
      version: rejected.version,
    },
    expected: 409,
  });

  const stockBefore = await request(`/products/${productId}/availability`);
  const cancelled = await request(`/admin/orders/${cancellable.id}/cancel`, {
    token: admin,
    method: 'POST',
    body: {
      reason: 'Customer requested staff cancellation',
      version: cancellable.version,
    },
  });
  check(cancelled.status, 'cancelled', 'staff cancels preparing order');
  const stockAfter = await request(`/products/${productId}/availability`);
  check(
    available(stockAfter),
    available(stockBefore) + cancellable.items[0].quantity,
    'cancellation restores available stock',
  );
  check(
    await scalar(
      'SELECT status AS value FROM stock_reservations WHERE order_id=$1 LIMIT 1',
      [cancellable.id],
    ),
    'released',
    'cancellation marks the lot reservation released',
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
      body: { reason: 'Too late', version: terminal.version },
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
