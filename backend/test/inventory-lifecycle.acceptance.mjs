import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Inventory lifecycle acceptance requires the disposable *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1')
  throw new Error(
    'Inventory lifecycle acceptance requires the runner-owned API',
  );

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};
const scalar = async (sql, values = []) =>
  (await db.query(sql, values)).rows[0]?.value;

async function request(
  path,
  { token, method = 'GET', body, headers = {}, expected = 200 } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
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

async function customer(phone) {
  const session = await appLogin(phone);
  const address = await request('/addresses', {
    token: session.access_token,
    method: 'POST',
    expected: 201,
    body: {
      label: 'Inventory lifecycle',
      city: 'Baghdad',
      area: 'Karrada',
      contact_phone: phone,
    },
  });
  return { token: session.access_token, address: address.id };
}

async function placeAndDeliver({
  shopper,
  productId,
  variantId,
  quantity,
  key,
}) {
  await request('/cart/items', {
    token: shopper.token,
    method: 'POST',
    body: { product_id: productId, variant_id: variantId, quantity },
  });
  const order = await request('/orders', {
    token: shopper.token,
    method: 'POST',
    expected: 201,
    headers: { 'Idempotency-Key': key },
    body: { address_id: shopper.address, payment_method: 'cod' },
  });
  for (const status of ['confirmed', 'preparing', 'ready_for_dispatch']) {
    await request(`/admin/orders/${order.id}/status`, {
      token: admin,
      method: 'PATCH',
      body: { status },
    });
  }
  const deliveryId = await scalar(
    'SELECT delivery_id::text AS value FROM orders WHERE id=$1',
    [order.id],
  );
  await request(`/deliveries/${deliveryId}/assign`, {
    token: admin,
    method: 'PATCH',
    body: { agent_id: agent.user.id },
  });
  await request(`/admin/orders/${order.id}/status`, {
    token: admin,
    method: 'PATCH',
    body: { status: 'dispatched' },
  });
  return { order, deliveryId };
}

let admin;
let agent;
try {
  admin = (
    await request('/admin/auth/login', {
      method: 'POST',
      expected: 201,
      body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
    })
  ).access_token;
  agent = await appLogin('+9647700000005');

  const variants = (
    await db.query(`
      SELECT id::text, product_id::text, sku
      FROM product_variants
      WHERE sku LIKE 'P5-COST-%' OR sku LIKE 'P5-WEIGHT-%'
      ORDER BY sku
    `)
  ).rows;
  const cost = variants.find((row) => row.sku.startsWith('P5-COST-'));
  const weight = variants.find((row) => row.sku.startsWith('P5-WEIGHT-'));
  assert.ok(cost && weight, 'phase-5 costing fixtures must exist');
  assertions += 1;

  const costShopper = await customer('+9647700992001');
  const costFlow = await placeAndDeliver({
    shopper: costShopper,
    productId: cost.product_id,
    variantId: cost.id,
    quantity: 3,
    key: `phase5-cost-delivery-${Date.now()}`,
  });
  check(
    Number(
      await scalar(
        'SELECT book_quantity AS value FROM sku_costs WHERE variant_id=$1',
        [cost.id],
      ),
    ),
    17,
    'issuing 3 leaves 17 warehouse units',
  );
  check(
    Number(
      await scalar(
        'SELECT book_value_iqd AS value FROM sku_costs WHERE variant_id=$1',
        [cost.id],
      ),
    ),
    187000,
    'issuing 3 at moving average leaves exact 187,000 book value',
  );
  check(
    Number(
      await scalar(
        'SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1',
        [cost.id],
      ),
    ),
    11000,
    'custody is excluded while the remaining warehouse average stays 11,000',
  );
  check(
    Number(
      await scalar(
        "SELECT sum(quantity*unit_cost_iqd) AS value FROM custody_holdings WHERE order_id=$1 AND status='in_custody'",
        [costFlow.order.id],
      ),
    ),
    33000,
    'handover fixes 33,000 of inventory cost in delivery custody',
  );
  check(
    (
      await db.query(
        'SELECT purchase_cost::numeric FROM inventory_batches WHERE variant_id=$1 ORDER BY purchase_cost',
        [cost.id],
      )
    ).rows.map((row) => Number(row.purchase_cost)),
    [10000, 12000],
    'moving-average issue never rewrites historical lot costs',
  );
  const warehouseAfterIssue = Number(
    await scalar(
      'SELECT sum(quantity) AS value FROM batch_stock s JOIN inventory_batches b ON b.id=s.batch_id WHERE b.variant_id=$1',
      [cost.id],
    ),
  );
  await request(`/deliveries/${costFlow.deliveryId}`, {
    token: agent.access_token,
    method: 'PATCH',
    body: { status: 'delivered' },
  });
  check(
    Number(
      await scalar(
        'SELECT sum(quantity) AS value FROM batch_stock s JOIN inventory_batches b ON b.id=s.batch_id WHERE b.variant_id=$1',
        [cost.id],
      ),
    ),
    warehouseAfterIssue,
    'delivery settles custody without deducting warehouse stock twice',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM custody_holdings WHERE order_id=$1 AND status='sold'",
        [costFlow.order.id],
      ),
    ),
    1,
    'delivery settles the custody holding to sold',
  );
  check(
    Number(
      await scalar(
        "SELECT sum(line.debit_base) AS value FROM journal_entries entry JOIN journal_lines line ON line.entry_id=entry.id JOIN ledger_accounts account ON account.id=line.account_id WHERE entry.source_type='order' AND entry.source_id=$1 AND entry.event='custody_to_sold' AND account.code='5000'",
        [costFlow.order.id],
      ),
    ),
    33000,
    'delivery posts 33,000 to COGS through the ledger',
  );

  const weightShopper = await customer('+9647700992002');
  const weightFlow = await placeAndDeliver({
    shopper: weightShopper,
    productId: weight.product_id,
    variantId: weight.id,
    quantity: 0.75,
    key: `phase5-weight-delivery-${Date.now()}`,
  });
  await request(`/deliveries/${weightFlow.deliveryId}`, {
    token: agent.access_token,
    method: 'PATCH',
    body: { status: 'delivered' },
  });
  check(
    Number(
      await scalar(
        'SELECT book_quantity AS value FROM sku_costs WHERE variant_id=$1',
        [weight.id],
      ),
    ),
    1.75,
    'weight SKU reserves and sells 0.75 kg exactly',
  );
  const orderItemId = await scalar(
    'SELECT id::text AS value FROM order_items WHERE order_id=$1 AND variant_id=$2',
    [weightFlow.order.id, weight.id],
  );
  const returned = await request('/returns', {
    token: weightShopper.token,
    method: 'POST',
    expected: 201,
    body: {
      order_id: weightFlow.order.id,
      reason: 'Partial weight return',
      items: [
        {
          order_item_id: orderItemId,
          quantity: 0.25,
          reason: 'Unused portion',
        },
      ],
    },
  });
  await request(`/returns/${returned.id}/inspect`, {
    token: admin,
    method: 'POST',
    body: {
      decision: 'approve',
      items: [
        {
          return_item_id: returned.items[0].id,
          approved_quantity: 0.25,
          condition: 'sellable',
        },
      ],
    },
  });
  await request(`/returns/${returned.id}/complete`, {
    token: admin,
    method: 'POST',
  });
  check(
    Number(
      await scalar(
        'SELECT book_quantity AS value FROM sku_costs WHERE variant_id=$1',
        [weight.id],
      ),
    ),
    2,
    'returning 0.25 kg reconciles warehouse quantity to 2.0 kg',
  );
  check(
    Number(
      await scalar(
        'SELECT book_value_iqd AS value FROM sku_costs WHERE variant_id=$1',
        [weight.id],
      ),
    ),
    8000,
    'weight return reconciles exact warehouse value',
  );
  check(
    Number(
      await scalar(
        "SELECT unit_cost_iqd AS value FROM stock_movements WHERE return_item_id=$1 AND type='return_in'",
        [returned.items[0].id],
      ),
    ),
    4000,
    'sellable return restores stock at the original issue cost',
  );

  console.log(
    `Inventory lifecycle acceptance passed (${assertions} assertions).`,
  );
} finally {
  await db.end();
}
