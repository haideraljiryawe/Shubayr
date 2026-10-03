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
    'Inventory acceptance requires the disposable *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1')
  throw new Error('Inventory acceptance requires the runner-owned API');

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
async function customer(phone) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone },
  });
  const session = await request('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: challenge.dev_otp },
  });
  const address = await request('/addresses', {
    token: session.access_token,
    method: 'POST',
    expected: 201,
    body: {
      label: 'Inventory acceptance',
      city: 'Baghdad',
      area: 'Karrada',
      contact_phone: phone,
    },
  });
  return { token: session.access_token, address: address.id };
}

try {
  const session = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
  });
  const admin = session.access_token;
  const warehouses = await request('/admin/inventory/warehouses', {
    token: admin,
  });
  const main = warehouses.find((row) => row.code === 'MAIN');
  assert.ok(main?.locations[0], 'seed must expose the main inventory location');
  assertions += 1;
  const sourceLocation = main.locations[0].id;
  const temporaryWarehouse = await request('/admin/inventory/warehouses', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { code: `TMP-${Date.now()}`, name: 'Temporary warehouse' },
  });
  const renamedWarehouse = await request(
    `/admin/inventory/warehouses/${temporaryWarehouse.id}`,
    {
      token: admin,
      method: 'PATCH',
      body: { code: `RENAMED-${Date.now()}`, name: 'Renamed warehouse' },
    },
  );
  check(
    renamedWarehouse.name,
    'Renamed warehouse',
    'warehouse code and name are editable before use',
  );
  const temporaryLocation = await request(
    `/admin/inventory/warehouses/${temporaryWarehouse.id}/locations`,
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: { code: `TMP-LOC-${Date.now()}`, is_sellable: false },
    },
  );
  const renamedLocation = await request(
    `/admin/inventory/locations/${temporaryLocation.id}`,
    {
      token: admin,
      method: 'PATCH',
      body: {
        code: `RENAMED-LOC-${Date.now()}`,
        description: 'Renamed unused location',
      },
    },
  );
  check(
    renamedLocation.description,
    'Renamed unused location',
    'location code and description are editable before use',
  );
  await request(`/admin/inventory/locations/${temporaryLocation.id}`, {
    token: admin,
    method: 'DELETE',
    expected: 204,
  });
  await request(`/admin/inventory/warehouses/${temporaryWarehouse.id}`, {
    token: admin,
    method: 'DELETE',
    expected: 204,
  });
  await request(`/admin/inventory/warehouses/${main.id}`, {
    token: admin,
    method: 'DELETE',
    expected: 409,
  });
  const quarantine = await request(
    `/admin/inventory/warehouses/${main.id}/locations`,
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        code: `QA-${Date.now()}`,
        description: 'Non-sellable acceptance location',
        is_sellable: false,
      },
    },
  );
  const overflow = await request(
    `/admin/inventory/warehouses/${main.id}/locations`,
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        code: `OVERFLOW-${Date.now()}`,
        description: 'Second sellable acceptance location',
        is_sellable: true,
      },
    },
  );

  const categoryId = await scalar(
    'SELECT id::text AS value FROM categories WHERE parent_id IS NOT NULL ORDER BY id LIMIT 1',
  );
  const productId = randomUUID();
  const fifoVariant = randomUUID();
  const exactVariant = randomUUID();
  const expiryVariant = randomUUID();
  const costVariant = randomUUID();
  const weightVariant = randomUUID();
  const countVariant = randomUUID();
  await db.query(
    `INSERT INTO products (id,category_id,name_en,name_ar,price,currency_code,status,published_at,price_approved_at,tracks_expiry)
     VALUES ($1,$2,'Phase 5 acceptance','اختبار المخزون',1000,'IQD','active',now(),now(),false)`,
    [productId, categoryId],
  );
  await db.query(
    `INSERT INTO product_variants (id,product_id,sku,price_delta,currency_code,base_unit,whole_units_only,selling_price,pricing_mode,price_approved_at)
     VALUES ($1,$7,$8,0,'IQD','piece',true,1000,'fixed',now()),
            ($2,$7,$9,0,'IQD','piece',true,1000,'fixed',now()),
            ($3,$7,$10,0,'IQD','piece',true,1000,'fixed',now()),
            ($4,$7,$11,0,'IQD','piece',true,1000,'fixed',now()),
            ($5,$7,$12,0,'IQD','kg',false,1000,'fixed',now()),
            ($6,$7,$13,0,'IQD','piece',true,1000,'fixed',now())`,
    [
      fifoVariant,
      exactVariant,
      expiryVariant,
      costVariant,
      weightVariant,
      countVariant,
      productId,
      `P5-FIFO-${Date.now()}`,
      `P5-EXACT-${Date.now()}`,
      `P5-EXP-${Date.now()}`,
      `P5-COST-${Date.now()}`,
      `P5-WEIGHT-${Date.now()}`,
      `P5-COUNT-${Date.now()}`,
    ],
  );
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const future = (days) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const openingInput = {
    operation_id: `phase5-opening-${Date.now()}`,
    document_date: today,
    lines: [
      {
        variant_id: fifoVariant,
        location_id: sourceLocation,
        lot_number: 'FIFO-1',
        quantity: '2',
        unit_cost_iqd: '10',
      },
      {
        variant_id: fifoVariant,
        location_id: sourceLocation,
        lot_number: 'FIFO-2',
        quantity: '2',
        unit_cost_iqd: '20',
      },
      {
        variant_id: exactVariant,
        location_id: sourceLocation,
        lot_number: 'EXACT-1',
        quantity: '5',
        unit_cost_iqd: '30',
      },
      {
        variant_id: expiryVariant,
        location_id: sourceLocation,
        lot_number: 'EXP-TIE-OLD',
        expiry_date: future(30),
        quantity: '1',
        unit_cost_iqd: '40',
      },
      {
        variant_id: expiryVariant,
        location_id: overflow.id,
        lot_number: 'EXP-TIE-NEW',
        expiry_date: future(30),
        quantity: '1',
        unit_cost_iqd: '50',
      },
      {
        variant_id: expiryVariant,
        location_id: overflow.id,
        lot_number: 'EXP-LATE',
        expiry_date: future(60),
        quantity: '1',
        unit_cost_iqd: '60',
      },
      {
        variant_id: expiryVariant,
        location_id: sourceLocation,
        lot_number: 'EXP-EXPIRED',
        expiry_date: future(-1),
        quantity: '100',
        unit_cost_iqd: '1',
      },
      {
        variant_id: expiryVariant,
        location_id: quarantine.id,
        lot_number: 'EXP-NONSELLABLE',
        expiry_date: future(20),
        quantity: '100',
        unit_cost_iqd: '1',
      },
      {
        variant_id: costVariant,
        location_id: sourceLocation,
        lot_number: 'COST-10000',
        quantity: '10',
        unit_cost_iqd: '10000',
      },
      {
        variant_id: costVariant,
        location_id: sourceLocation,
        lot_number: 'COST-12000',
        quantity: '10',
        unit_cost_iqd: '12000',
      },
      {
        variant_id: weightVariant,
        location_id: sourceLocation,
        lot_number: 'WEIGHT-4000',
        quantity: '2.5',
        unit_cost_iqd: '4000',
      },
      {
        variant_id: countVariant,
        location_id: sourceLocation,
        lot_number: 'COUNT-100',
        quantity: '5',
        unit_cost_iqd: '100',
      },
    ],
  };
  const opening = await request('/admin/inventory/openings', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: openingInput,
  });
  const openingReplay = await request('/admin/inventory/openings', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: openingInput,
  });
  check(openingReplay.id, opening.id, 'opening operation id is idempotent');
  check(
    Number(
      await scalar(
        'SELECT count(*)::int AS value FROM inventory_openings WHERE operation_id=$1',
        [openingInput.operation_id],
      ),
    ),
    1,
    'idempotent opening creates one document',
  );
  await request('/admin/inventory/openings', {
    token: admin,
    method: 'POST',
    expected: 422,
    body: {
      operation_id: `phase5-fraction-${Date.now()}`,
      document_date: today,
      lines: [
        {
          variant_id: costVariant,
          location_id: sourceLocation,
          quantity: '0.5',
          unit_cost_iqd: '1',
        },
      ],
    },
  });
  check(opening.status, 'posted', 'opening stock posts immediately');
  check(
    Number(
      await scalar(
        'SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1',
        [fifoVariant],
      ),
    ),
    15,
    'two receipts produce exact moving weighted average',
  );
  check(
    Number(
      await scalar(
        'SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1',
        [costVariant],
      ),
    ),
    11000,
    '10 at 10,000 plus 10 at 12,000 produces average 11,000',
  );
  check(
    Number(
      await scalar(
        'SELECT book_value_iqd AS value FROM sku_costs WHERE variant_id=$1',
        [costVariant],
      ),
    ),
    220000,
    'costing example begins with exact 220,000 book value',
  );
  check(
    Number(
      await scalar(
        'SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1',
        [weightVariant],
      ),
    ),
    4000,
    'a second variant maintains its own moving average',
  );
  check(
    Number(
      await scalar(
        'SELECT count(*)::int AS value FROM journal_lines WHERE entry_id=$1',
        [opening.journal_entry_id],
      ),
    ),
    2,
    'opening uses the shared ledger service',
  );
  check(
    Number(
      await scalar(
        'SELECT sum(debit_base-credit_base) AS value FROM journal_lines WHERE entry_id=$1',
        [opening.journal_entry_id],
      ),
    ),
    0,
    'opening journal remains balanced',
  );

  const [left, right] = await Promise.all([
    customer('+9647700991001'),
    customer('+9647700991002'),
  ]);
  for (const shopper of [left, right]) {
    await request('/cart/items', {
      token: shopper.token,
      method: 'POST',
      body: { product_id: productId, variant_id: exactVariant, quantity: 3 },
    });
  }
  const attempts = await Promise.all(
    [left, right].map(async (shopper, index) => {
      const response = await fetch(`${api}/orders`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${shopper.token}`,
          'content-type': 'application/json',
          'Idempotency-Key': `phase5-race-${Date.now()}-${index}`,
        },
        body: JSON.stringify({
          address_id: shopper.address,
          payment_method: 'cod',
        }),
      });
      const text = await response.text();
      return {
        status: response.status,
        payload: text ? JSON.parse(text) : undefined,
        shopper,
      };
    }),
  );
  check(
    attempts.map((item) => item.status).sort(),
    [201, 409],
    '5 available with simultaneous orders of 3 allows exactly one checkout',
  );
  const winner = attempts.find((item) => item.status === 201);
  const loser = attempts.find((item) => item.status === 409);
  check(
    loser.payload.code,
    'INSUFFICIENT_STOCK',
    'oversell failure is structured',
  );
  check(
    loser.payload.errors[0].available,
    '2',
    'oversell failure reports exact availability',
  );
  check(
    Number(
      await scalar(
        'SELECT reserved AS value FROM batch_stock s JOIN inventory_batches b ON b.id=s.batch_id WHERE b.variant_id=$1',
        [exactVariant],
      ),
    ),
    3,
    'winning checkout reserves exactly 3 and leaves 2 available',
  );
  await request(`/orders/${winner.payload.id}/cancel`, {
    token: winner.shopper.token,
    method: 'POST',
    body: { version: winner.payload.version },
  });
  check(
    Number(
      await scalar(
        'SELECT reserved AS value FROM batch_stock s JOIN inventory_batches b ON b.id=s.batch_id WHERE b.variant_id=$1',
        [exactVariant],
      ),
    ),
    0,
    'cancellation releases availability once',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM stock_movements m JOIN inventory_batches b ON b.id=m.batch_id WHERE b.variant_id=$1 AND m.type='release'",
        [exactVariant],
      ),
    ),
    1,
    'release is recorded in the append-only ledger',
  );
  await request(`/orders/${winner.payload.id}/cancel`, {
    token: winner.shopper.token,
    method: 'POST',
    body: { version: winner.payload.version },
    expected: 409,
  });
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM stock_movements m JOIN stock_reservations r ON r.id=m.source_id WHERE r.order_id=$1 AND m.type='release'",
        [winner.payload.id],
      ),
    ),
    1,
    'repeated cancellation cannot release the same reservation twice',
  );

  const rejectShopper = await customer('+9647700991005');
  await request('/cart/items', {
    token: rejectShopper.token,
    method: 'POST',
    body: { product_id: productId, variant_id: exactVariant, quantity: 1 },
  });
  const rejectOrder = await request('/orders', {
    token: rejectShopper.token,
    method: 'POST',
    expected: 201,
    headers: { 'Idempotency-Key': `phase5-reject-${Date.now()}` },
    body: { address_id: rejectShopper.address, payment_method: 'cod' },
  });
  const rejected = await request(`/admin/orders/${rejectOrder.id}/reject`, {
    token: admin,
    method: 'POST',
    body: { reason: 'Phase 5 release proof', version: rejectOrder.version },
  });
  check(
    rejected.status,
    'rejected',
    'admin rejection uses real rejected state',
  );
  await request(`/admin/orders/${rejectOrder.id}/reject`, {
    token: admin,
    method: 'POST',
    expected: 409,
    body: { reason: 'Must not release twice', version: rejected.version },
  });
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM stock_movements m JOIN stock_reservations r ON r.id=m.source_id WHERE r.order_id=$1 AND m.type='release'",
        [rejectOrder.id],
      ),
    ),
    1,
    'rejection releases its reservation exactly once',
  );

  const expiryShopper = await customer('+9647700991003');
  await request('/cart/items', {
    token: expiryShopper.token,
    method: 'POST',
    body: { product_id: productId, variant_id: expiryVariant, quantity: 2 },
  });
  const expiryOrder = await request('/orders', {
    token: expiryShopper.token,
    method: 'POST',
    expected: 201,
    headers: { 'Idempotency-Key': `phase5-fefo-${Date.now()}` },
    body: { address_id: expiryShopper.address, payment_method: 'cod' },
  });
  const expiryLots = (
    await db.query(
      'SELECT b.lot_number FROM stock_reservations r JOIN inventory_batches b ON b.id=r.batch_id WHERE r.order_id=$1 ORDER BY b.entry_date, b.id',
      [expiryOrder.id],
    )
  ).rows.map((row) => row.lot_number);
  check(
    expiryLots,
    ['EXP-TIE-OLD', 'EXP-TIE-NEW'],
    'FEFO breaks an expiry tie by oldest received lot and splits locations',
  );
  check(
    expiryLots.includes('EXP-EXPIRED') ||
      expiryLots.includes('EXP-NONSELLABLE'),
    false,
    'expired and non-sellable lots are excluded from allocation',
  );
  const expiryAvailability = await request(
    `/products/${productId}/availability`,
  );
  check(
    expiryAvailability.variants.find((row) => row.variant_id === expiryVariant)
      .available_qty,
    1,
    'availability includes only sellable non-expired stock less reservations',
  );

  const fifoShopper = await customer('+9647700991004');
  await request('/cart/items', {
    token: fifoShopper.token,
    method: 'POST',
    body: { product_id: productId, variant_id: fifoVariant, quantity: 1 },
  });
  const fifoOrder = await request('/orders', {
    token: fifoShopper.token,
    method: 'POST',
    expected: 201,
    headers: { 'Idempotency-Key': `phase5-fifo-${Date.now()}` },
    body: { address_id: fifoShopper.address, payment_method: 'cod' },
  });
  check(
    await scalar(
      'SELECT b.lot_number AS value FROM stock_reservations r JOIN inventory_batches b ON b.id=r.batch_id WHERE r.order_id=$1',
      [fifoOrder.id],
    ),
    'FIFO-1',
    'non-expiry allocation is FIFO',
  );

  const fifo2 = await scalar(
    "SELECT id::text AS value FROM inventory_batches WHERE variant_id=$1 AND lot_number='FIFO-2'",
    [fifoVariant],
  );
  const reservedExpiryBatch = await scalar(
    "SELECT b.id::text AS value FROM stock_reservations r JOIN inventory_batches b ON b.id=r.batch_id WHERE r.order_id=$1 AND b.lot_number='EXP-TIE-OLD'",
    [expiryOrder.id],
  );
  await request('/admin/inventory/transfers', {
    token: admin,
    method: 'POST',
    expected: 409,
    body: {
      operation_id: `phase5-reserved-transfer-${Date.now()}`,
      document_date: today,
      reason: 'Reserved stock must remain in place',
      lines: [
        {
          batch_id: reservedExpiryBatch,
          from_location_id: sourceLocation,
          to_location_id: overflow.id,
          quantity: '1',
        },
      ],
    },
  });
  const averageBefore = Number(
    await scalar(
      'SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1',
      [fifoVariant],
    ),
  );
  const transfer = await request('/admin/inventory/transfers', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `phase5-transfer-${Date.now()}`,
      document_date: today,
      reason: 'Move to inspection',
      lines: [
        {
          batch_id: fifo2,
          from_location_id: sourceLocation,
          to_location_id: quarantine.id,
          quantity: '1',
        },
      ],
    },
  });
  check(
    Number(
      await scalar(
        'SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1',
        [fifoVariant],
      ),
    ),
    averageBefore,
    'location transfer does not change SKU value',
  );

  const count = await request('/admin/inventory/counts', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { location_id: quarantine.id, reason: 'Stale snapshot test' },
  });
  await request('/admin/inventory/transfers', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `phase5-transfer-back-${Date.now()}`,
      document_date: today,
      reason: 'Movement after snapshot',
      lines: [
        {
          batch_id: fifo2,
          from_location_id: quarantine.id,
          to_location_id: sourceLocation,
          quantity: '1',
        },
      ],
    },
  });
  await request(`/admin/inventory/counts/${count.id}/approve`, {
    token: admin,
    method: 'POST',
    expected: 403,
    body: {
      operation_id: `phase5-self-count-${Date.now()}`,
      document_date: today,
      lines: count.lines.map((line) => ({
        batch_id: line.batch_id,
        location_id: line.location_id,
        counted_quantity: String(line.counted_quantity),
      })),
    },
  });
  await db.query(
    "UPDATE stock_counts SET created_by=(SELECT id FROM users WHERE username='stock') WHERE id=$1",
    [count.id],
  );
  await request(`/admin/inventory/counts/${count.id}/approve`, {
    token: admin,
    method: 'POST',
    expected: 409,
    body: {
      operation_id: `phase5-stale-count-${Date.now()}`,
      document_date: today,
      lines: count.lines.map((line) => ({
        batch_id: line.batch_id,
        location_id: line.location_id,
        counted_quantity: String(line.counted_quantity),
      })),
    },
  });

  const countShopper = await customer('+9647700991006');
  await request('/cart/items', {
    token: countShopper.token,
    method: 'POST',
    body: { product_id: productId, variant_id: countVariant, quantity: 3 },
  });
  const countOrder = await request('/orders', {
    token: countShopper.token,
    method: 'POST',
    expected: 201,
    headers: { 'Idempotency-Key': `phase5-count-order-${Date.now()}` },
    body: { address_id: countShopper.address, payment_method: 'cod' },
  });
  const shortageDraft = await request('/admin/inventory/counts', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { variant_id: countVariant, reason: 'Count shortage test' },
  });
  await db.query(
    "UPDATE stock_counts SET created_by=(SELECT id FROM users WHERE username='stock') WHERE id=$1",
    [shortageDraft.id],
  );
  const shortage = await request(
    `/admin/inventory/counts/${shortageDraft.id}/approve`,
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        operation_id: `phase5-shortage-${Date.now()}`,
        document_date: today,
        lines: shortageDraft.lines.map((line) => ({
          batch_id: line.batch_id,
          location_id: line.location_id,
          counted_quantity: '2',
        })),
      },
    },
  );
  check(shortage.lines[0].difference, -3, 'count records exact shortage');
  check(
    Number(
      await scalar(
        "SELECT sum(debit_base) AS value FROM journal_lines l JOIN ledger_accounts a ON a.id=l.account_id WHERE l.entry_id=$1 AND a.code='5010'",
        [shortage.journal_entry_id],
      ),
    ),
    300,
    'count shortage debits inventory loss at moving average',
  );
  check(
    await scalar(
      'SELECT inventory_attention_required AS value FROM orders WHERE id=$1',
      [countOrder.id],
    ),
    true,
    'shortage releases excess reservations and flags the affected order',
  );
  check(
    Number(
      await scalar(
        "SELECT quantity AS value FROM stock_reservations WHERE order_id=$1 AND status='reserved'",
        [countOrder.id],
      ),
    ),
    2,
    'shortage retains only reservations backed by counted stock',
  );
  const surplusDraft = await request('/admin/inventory/counts', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { variant_id: countVariant, reason: 'Count surplus test' },
  });
  await db.query(
    "UPDATE stock_counts SET created_by=(SELECT id FROM users WHERE username='stock') WHERE id=$1",
    [surplusDraft.id],
  );
  const surplus = await request(
    `/admin/inventory/counts/${surplusDraft.id}/approve`,
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        operation_id: `phase5-surplus-${Date.now()}`,
        document_date: today,
        lines: surplusDraft.lines.map((line) => ({
          batch_id: line.batch_id,
          location_id: line.location_id,
          counted_quantity: '4',
        })),
      },
    },
  );
  check(surplus.lines[0].difference, 2, 'count records exact surplus');
  check(
    Number(
      await scalar(
        "SELECT sum(credit_base) AS value FROM journal_lines l JOIN ledger_accounts a ON a.id=l.account_id WHERE l.entry_id=$1 AND a.code='5011'",
        [surplus.journal_entry_id],
      ),
    ),
    200,
    'count surplus credits inventory gain at moving average',
  );

  await request('/admin/inventory/transfers', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `phase5-quarantine-${Date.now()}`,
      document_date: today,
      reason: 'Quarantine damaged item',
      lines: [
        {
          batch_id: fifo2,
          from_location_id: sourceLocation,
          to_location_id: quarantine.id,
          quantity: '1',
        },
      ],
    },
  });
  const writeDown = await request('/admin/inventory/write-downs', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `phase5-write-down-${Date.now()}`,
      document_date: today,
      reason: 'Damaged during acceptance',
      lines: [{ batch_id: fifo2, location_id: quarantine.id, quantity: '1' }],
    },
  });
  check(
    Number(
      await scalar(
        'SELECT sum(debit_base-credit_base) AS value FROM journal_lines WHERE entry_id=$1',
        [writeDown.journal_entry_id],
      ),
    ),
    0,
    'write-down posts a balanced loss journal',
  );

  const openingList = await request('/admin/inventory/openings?per_page=100', {
    token: admin,
  });
  check(
    openingList.data.some((row) => row.id === opening.id),
    true,
    'opening documents are listable',
  );
  check(
    (
      await request(`/admin/inventory/documents/opening/${opening.id}`, {
        token: admin,
      })
    ).id,
    opening.id,
    'opening document is directly readable',
  );
  check(
    (
      await request('/admin/inventory/transfers?per_page=100', { token: admin })
    ).data.some((row) => row.id === transfer.id),
    true,
    'transfer documents are listable',
  );
  check(
    (
      await request('/admin/inventory/counts?per_page=100', { token: admin })
    ).data.some((row) => row.id === shortage.id),
    true,
    'count documents are listable',
  );
  check(
    (
      await request('/admin/inventory/write-downs?per_page=100', {
        token: admin,
      })
    ).data.some((row) => row.id === writeDown.id),
    true,
    'write-down documents are listable',
  );

  await db.query(`
    DELETE FROM preset_permissions AS grant_row
    USING permission_presets AS preset, permissions AS permission
    WHERE grant_row.preset_id = preset.id
      AND grant_row.permission_id = permission.id
      AND preset.name = 'stock_controller'
      AND permission.key = 'cost.view'
  `);
  await db.query(
    "UPDATE users SET permission_version=permission_version+1 WHERE username='stock'",
  );
  const stockSession = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'stock', password: 'Shubayr-Dev-Staff!2026' },
  });
  await db.query(`
    INSERT INTO preset_permissions (preset_id, permission_id)
    SELECT preset.id, permission.id
    FROM permission_presets AS preset
    CROSS JOIN permissions AS permission
    WHERE preset.name = 'stock_controller' AND permission.key = 'cost.view'
    ON CONFLICT DO NOTHING
  `);
  const costLotId = await scalar(
    "SELECT id::text AS value FROM inventory_batches WHERE variant_id=$1 AND lot_number='COST-10000'",
    [costVariant],
  );
  const hiddenLot = await request(`/admin/inventory/lots/${costLotId}`, {
    token: stockSession.access_token,
  });
  check(
    'purchase_cost' in hiddenLot || 'landed_cost_share' in hiddenLot,
    false,
    'lot cost fields require cost.view',
  );
  const hiddenMovements = await request(
    `/admin/inventory/movements?variant_id=${costVariant}`,
    { token: stockSession.access_token },
  );
  check(
    hiddenMovements.data.some((row) => 'unit_cost_iqd' in row),
    false,
    'movement cost fields require cost.view',
  );
  const hiddenOpening = await request(
    `/admin/inventory/documents/opening/${opening.id}`,
    { token: stockSession.access_token },
  );
  check(
    hiddenOpening.lines.some(
      (line) => 'unit_cost_iqd' in line || 'landed_cost_share' in line,
    ),
    false,
    'document line costs require cost.view',
  );
  await db.query(
    "UPDATE users SET permission_version=permission_version+1 WHERE username='stock'",
  );

  const markerBefore = await scalar(
    'SELECT search_sync_required AS value FROM products WHERE id=$1',
    [productId],
  );
  check(
    markerBefore,
    true,
    'catalog changes retain a durable needs-reindex marker',
  );
  const reindex = await request('/admin/products/reindex', {
    token: admin,
    method: 'POST',
    expected: 201,
  });
  check(
    reindex.synchronized,
    true,
    'admin reindex catches up when search is healthy',
  );
  check(
    await scalar(
      'SELECT search_sync_required AS value FROM products WHERE id=$1',
      [productId],
    ),
    false,
    'successful indexing clears the durable marker',
  );
  const search = await request('/products?q=Phase%205');
  check(
    search.data.some((row) => row.id === productId),
    true,
    'search recovery makes the changed product queryable',
  );
  check(
    Number(
      await scalar(`
        SELECT (
          SELECT coalesce(sum(line.debit_base-line.credit_base),0)
          FROM journal_lines AS line
          JOIN ledger_accounts AS account ON account.id=line.account_id
          WHERE account.code='1000'
        ) - (
          SELECT coalesce(sum(book_value_iqd),0) FROM sku_costs
        ) AS value
      `),
    ),
    0,
    'inventory ledger account equals the value of stock remaining in warehouses',
  );
  check(
    Number(
      await scalar(`
        SELECT (
          SELECT coalesce(sum(line.debit_base-line.credit_base),0)
          FROM journal_lines AS line
          JOIN ledger_accounts AS account ON account.id=line.account_id
          WHERE account.code='1010'
        ) - (
          SELECT coalesce(sum(quantity*unit_cost_iqd),0)
          FROM custody_holdings WHERE status='in_custody'
        ) AS value
      `),
    ),
    0,
    'goods-in-custody ledger account equals unsettled custody holdings',
  );

  await assert.rejects(
    db.query(
      "UPDATE stock_movements SET reference='tampered' WHERE source_id=$1",
      [opening.id],
    ),
    /STOCK_MOVEMENT_IMMUTABLE/,
  );
  assertions += 1;
  await assert.rejects(
    db.query("UPDATE inventory_openings SET status='draft' WHERE id=$1", [
      opening.id,
    ]),
    /INVENTORY_DOCUMENT_IMMUTABLE/,
  );
  assertions += 1;
  check(transfer.status, 'posted', 'transfer is a numbered posted document');

  // Later suites intentionally assert the exact seeded admin-order fixture.
  // Release and remove this suite's orders while retaining its inventory ledger.
  await db.query('BEGIN');
  try {
    await db.query(`
      UPDATE batch_stock AS stock
      SET reserved = stock.reserved - released.quantity
      FROM (
        SELECT reservation.batch_id,
               reservation.location_id,
               SUM(reservation.quantity) AS quantity
        FROM stock_reservations AS reservation
        JOIN orders AS test_order ON test_order.id = reservation.order_id
        JOIN users AS test_user ON test_user.id = test_order.user_id
        WHERE reservation.status = 'reserved'
          AND test_user.phone LIKE '+9647700991%'
        GROUP BY reservation.batch_id, reservation.location_id
      ) AS released
      WHERE stock.batch_id = released.batch_id
        AND stock.location_id = released.location_id
    `);
    await db.query(`
      DELETE FROM orders
      WHERE user_id IN (
        SELECT id FROM users WHERE phone LIKE '+9647700991%'
      )
    `);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  console.log(
    `Inventory/costing acceptance passed (${assertions} assertions).`,
  );
} finally {
  await db.end();
}
