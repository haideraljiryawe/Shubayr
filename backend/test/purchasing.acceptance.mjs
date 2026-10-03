import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(process.env.ACCEPTANCE_DATABASE_NAME ?? '')) {
  throw new Error('Purchasing acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Purchasing acceptance requires the runner-owned loopback API');
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};
const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0]?.value;
const amount = (value) => Number(value);

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

const day = (offset = 0) => {
  const value = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
};
const today = day();
const suffix = Date.now().toString(36);

function invoiceBody({ supplierId, locationId, variantId, operationId = randomUUID(), ...overrides }) {
  return {
    operation_id: operationId,
    document_date: today,
    supplier_id: supplierId,
    supplier_invoice_number: `ACC-${randomUUID()}`,
    currency_code: 'IQD',
    default_location_id: locationId,
    allocation_method: 'value',
    lines: [{ variant_id: variantId, quantity: '10', pack_size: '1', unit_cost: '10000' }],
    ...overrides,
  };
}

try {
  const adminLogin = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
  });
  const stockLogin = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'stock', password: 'Shubayr-Dev-Staff!2026' },
  });
  const admin = adminLogin.access_token;
  const stock = stockLogin.access_token;
  const stockMe = await request('/me', { token: stock });
  check(stockMe.permissions.includes('cost.view'), true, 'stock controller preset grants cost.view');
  check(stockMe.permissions.includes('supplier_payments.record'), false, 'stock controller preset does not grant supplier payments');
  check(
    amount(await scalar(`
      SELECT count(*)::int AS value
      FROM permission_presets preset
      JOIN preset_permissions grant_row ON grant_row.preset_id=preset.id
      JOIN permissions permission ON permission.id=grant_row.permission_id
      WHERE preset.name IN ('cashier', 'accountant')
        AND permission.key='supplier_payments.record'
    `)),
    2,
    'cashier and accountant presets grant supplier payments',
  );
  const adminId = await scalar("SELECT id::text AS value FROM users WHERE username='admin'");

  const locationId = await scalar(`
    SELECT location.id::text AS value
    FROM warehouse_locations location
    JOIN warehouses warehouse ON warehouse.id=location.warehouse_id
    WHERE location.is_active AND warehouse.is_active
    ORDER BY location.created_at
    LIMIT 1
  `);
  assert.ok(locationId, 'an active phase-5 warehouse location must exist');
  assertions += 1;

  const purchasingProduct = await scalar(`
    INSERT INTO products (
      category_id, name_en, name_ar, description, price, currency_code, status
    )
    SELECT id, $1, $1, 'Phase 6 acceptance fixture', 20000, 'IQD', 'draft'
    FROM categories
    ORDER BY categories.id
    LIMIT 1
    RETURNING id::text AS value
  `, [`Phase 6 purchasing fixture ${suffix}`]);

  async function fixtureVariant(name, whole = true) {
    return scalar(`
      INSERT INTO product_variants (product_id, sku, base_unit, whole_units_only, selling_price, published_price)
      VALUES ($1, $2, $3, $4, 20000, 20000)
      RETURNING id::text AS value
    `, [purchasingProduct, `P6-${name}-${suffix}`, whole ? 'piece' : 'kg', whole]);
  }
  const movingVariant = await fixtureVariant('MOVING');
  const packVariant = await fixtureVariant('PACK');
  const landedA = await fixtureVariant('LAND-A');
  const landedB = await fixtureVariant('LAND-B');
  const usdVariant = await fixtureVariant('USD');
  const correctionVariant = await fixtureVariant('CORRECT');
  const returnVariant = await fixtureVariant('RETURN');

  const supplier = await request('/admin/suppliers', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: {
      name: `Phase 6 Supplier ${suffix}`,
      phone: '+9647701234567',
      email: `phase6-${suffix}@example.test`,
      address: 'Baghdad',
      notes: 'Acceptance supplier',
      default_currency: 'IQD',
      payment_terms_days: 30,
    },
  });
  check(supplier.default_currency, 'IQD', 'supplier stores its default currency');
  check(supplier.payment_terms_days, 30, 'supplier stores payment terms');
  const edited = await request(`/admin/suppliers/${supplier.id}`, {
    token: stock,
    method: 'PATCH',
    body: { notes: 'Updated acceptance supplier', payment_terms_days: 45 },
  });
  check(edited.payment_terms_days, 45, 'supplier update is returned immediately');

  const disposable = await request('/admin/suppliers', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: { name: `Disposable ${suffix}`, default_currency: 'IQD', payment_terms_days: 0 },
  });
  const deactivated = await request(`/admin/suppliers/${disposable.id}`, {
    token: stock,
    method: 'DELETE',
  });
  check(deactivated.is_active, false, 'supplier deletion is a recoverable deactivation');

  const openingOperation = randomUUID();
  const openingBody = {
    operation_id: openingOperation,
    document_date: today,
    currency_code: 'IQD',
    amount: '50000',
    exchange_rate: '1',
    due_date: today,
  };
  const opening = await request(`/admin/suppliers/${supplier.id}/opening-balance`, {
    token: stock,
    method: 'POST',
    expected: 201,
    body: openingBody,
  });
  const openingReplay = await request(`/admin/suppliers/${supplier.id}/opening-balance`, {
    token: stock,
    method: 'POST',
    expected: 201,
    body: openingBody,
  });
  check(openingReplay.id, opening.id, 'supplier opening replay returns the original document');

  const first = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: supplier.id,
      locationId,
      variantId: movingVariant,
      lines: [{ variant_id: movingVariant, quantity: '10', pack_size: '1', unit_cost: '10000', lot_number: 'MOV-1' }],
    }),
  });
  const second = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: supplier.id,
      locationId,
      variantId: movingVariant,
      lines: [{ variant_id: movingVariant, quantity: '10', pack_size: '1', unit_cost: '12000', lot_number: 'MOV-2' }],
    }),
  });
  check(
    amount(await scalar('SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1', [movingVariant])),
    11000,
    '10 at 10,000 plus 10 at 12,000 produces an 11,000 moving average',
  );
  check(
    (await db.query('SELECT purchase_cost::numeric FROM inventory_batches WHERE variant_id=$1 ORDER BY purchase_cost', [movingVariant])).rows.map((row) => amount(row.purchase_cost)),
    [10000, 12000],
    'each receipt keeps its own historical lot cost',
  );
  check(
    amount(await scalar("SELECT sum(credit_currency-debit_currency) AS value FROM supplier_account_entries WHERE supplier_id=$1 AND source_type='purchase_invoice'", [supplier.id])),
    220000,
    'the two local purchases add exactly 220,000 to supplier AP',
  );

  await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: supplier.id,
      locationId,
      variantId: packVariant,
      lines: [{ variant_id: packVariant, quantity: '2', pack_size: '12', unit_cost: '60000', lot_number: 'PACK-24' }],
    }),
  });
  check(
    amount(await scalar('SELECT book_quantity AS value FROM sku_costs WHERE variant_id=$1', [packVariant])),
    24,
    'two packs of twelve receive 24 base units',
  );
  check(
    amount(await scalar('SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1', [packVariant])),
    5000,
    'pack cost is converted to a 5,000 per-base-unit cost',
  );

  const landed = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: supplier.id,
      locationId,
      variantId: landedA,
      allocation_method: 'value',
      lines: [
        { variant_id: landedA, quantity: '3', pack_size: '1', unit_cost: '10000', lot_number: 'LAND-A' },
        { variant_id: landedB, quantity: '7', pack_size: '1', unit_cost: '10000', lot_number: 'LAND-B' },
      ],
      landed_costs: [{ kind: 'freight', currency_code: 'IQD', amount: '20000' }],
    }),
  });
  const landedRows = (await db.query('SELECT landed_cost_share_iqd::numeric FROM purchase_invoice_items WHERE invoice_id=$1 ORDER BY quantity', [landed.id])).rows;
  check(landedRows.map((row) => amount(row.landed_cost_share_iqd)), [6000, 14000], 'landed cost allocates by line value');
  check(landedRows.reduce((sum, row) => sum + amount(row.landed_cost_share_iqd), 0), 20000, 'landed allocation has no rounding remainder');
  check(
    (await db.query('SELECT purchase_cost::numeric FROM inventory_batches WHERE source_id=$1 ORDER BY qty_received', [landed.id])).rows.map((row) => amount(row.purchase_cost)),
    [12000, 12000],
    'each lot basis includes its exact landed-cost share',
  );

  const concurrentOperation = randomUUID();
  const concurrentBody = invoiceBody({
    supplierId: supplier.id,
    locationId,
    variantId: landedA,
    operationId: concurrentOperation,
    supplier_invoice_number: `CONCURRENT-${suffix}`,
    lines: [{ variant_id: landedA, quantity: '1', pack_size: '1', unit_cost: '1000' }],
  });
  const [concurrentA, concurrentB] = await Promise.all([
    request('/admin/purchase-invoices', { token: stock, method: 'POST', expected: 201, body: concurrentBody }),
    request('/admin/purchase-invoices', { token: stock, method: 'POST', expected: 201, body: concurrentBody }),
  ]);
  check(concurrentA.id, concurrentB.id, 'concurrent retries create one purchase document');
  check(
    amount(await scalar('SELECT count(*)::int AS value FROM purchase_invoices WHERE operation_id=$1', [concurrentOperation])),
    1,
    'one operation id has one durable invoice row',
  );
  await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 409,
    body: { ...concurrentBody, notes: 'different payload' },
  });

  await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 422,
    body: invoiceBody({ supplierId: supplier.id, locationId, variantId: movingVariant, document_date: day(1) }),
  });
  await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 422,
    body: invoiceBody({
      supplierId: supplier.id,
      locationId,
      variantId: movingVariant,
      lines: [{ variant_id: movingVariant, quantity: '0.5', pack_size: '1', unit_cost: '1000' }],
    }),
  });
  await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 403,
    body: invoiceBody({ supplierId: supplier.id, locationId, variantId: movingVariant, document_date: day(-91) }),
  });
  const missingSupplier = invoiceBody({ supplierId: supplier.id, locationId, variantId: movingVariant });
  delete missingSupplier.supplier_id;
  await request('/admin/purchase-invoices', {
    token: stock, method: 'POST', expected: 422, body: missingSupplier,
  });
  const missingUnitCost = invoiceBody({ supplierId: supplier.id, locationId, variantId: movingVariant });
  delete missingUnitCost.lines[0].unit_cost;
  await request('/admin/purchase-invoices', {
    token: stock, method: 'POST', expected: 422, body: missingUnitCost,
  });

  const usdSupplier = await request('/admin/suppliers', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: { name: `USD Supplier ${suffix}`, default_currency: 'USD', payment_terms_days: 30 },
  });
  const usdInvoice = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: usdSupplier.id,
      locationId,
      variantId: usdVariant,
      currency_code: 'USD',
      exchange_rate: '1500',
      lines: [{ variant_id: usdVariant, quantity: '100', pack_size: '1', unit_cost: '2', lot_number: 'USD-LOT' }],
    }),
  });
  check(
    amount(await scalar('SELECT total_iqd AS value FROM purchase_invoices WHERE id=$1', [usdInvoice.id])),
    300000,
    'USD purchase freezes its 1,500 invoice rate',
  );
  const usdCash = await request('/admin/cash-accounts', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { name: `Phase 6 USD Cash ${suffix}`, kind: 'cash', currency_code: 'USD' },
  });
  const iqdCash = await request('/admin/cash-accounts', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { name: `Phase 6 IQD Cash ${suffix}`, kind: 'cash', currency_code: 'IQD' },
  });
  await request('/admin/exchange-rates', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      currency_code: 'USD',
      rate: '1520',
      basis: 1,
      effective_at: new Date().toISOString(),
      reason: 'Cross-currency supplier-payment acceptance rate',
    },
  });

  const crossUsdInvoice = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: usdSupplier.id,
      locationId,
      variantId: usdVariant,
      currency_code: 'USD',
      exchange_rate: '1500',
      lines: [{ variant_id: usdVariant, quantity: '100', pack_size: '1', unit_cost: '2', lot_number: 'USD-CROSS-IQD' }],
    }),
  });
  const crossUsdPayment = await request('/admin/supplier-payments', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: randomUUID(), document_date: today, supplier_id: usdSupplier.id,
      cash_account_id: iqdCash.id, currency_code: 'IQD', amount: '304000',
      allocations: [{ invoice_id: crossUsdInvoice.id, amount: '304000' }],
    },
  });
  check(
    amount(crossUsdPayment.allocations[0].amount_payment_currency),
    304000,
    'cross-currency allocation records its IQD cash amount',
  );
  check(
    amount(crossUsdPayment.allocations[0].amount_invoice_currency),
    200,
    '304,000 IQD at 1,520 settles 200 USD',
  );
  check(
    amount(await scalar("SELECT COALESCE(sum(line.debit_base-line.credit_base),0) AS value FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id JOIN journal_entries entry ON entry.id=line.entry_id WHERE entry.source_id=$1 AND account.code='5030'", [crossUsdPayment.id])),
    4000,
    'USD invoice booked at 1,500 and paid at 1,520 posts a 4,000 FX loss',
  );
  const crossUsdJournal = (await db.query(`
    SELECT sum(debit_base)::numeric AS debit, sum(credit_base)::numeric AS credit
    FROM journal_lines line
    JOIN journal_entries entry ON entry.id=line.entry_id
    WHERE entry.source_id=$1
  `, [crossUsdPayment.id])).rows[0];
  check(amount(crossUsdJournal.debit), amount(crossUsdJournal.credit), 'cross-currency supplier-payment journal balances');
  const settledCrossUsd = await request(`/admin/purchase-invoices/${crossUsdInvoice.id}`, { token: stock });
  check(settledCrossUsd.settlement_status, 'paid', 'IQD cash settles the USD invoice');
  check(amount(settledCrossUsd.remaining_currency), 0, 'settled cross-currency USD invoice has no remainder');

  const inverseInvoice = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: usdSupplier.id,
      locationId,
      variantId: usdVariant,
      lines: [{ variant_id: usdVariant, quantity: '1', pack_size: '1', unit_cost: '152000', lot_number: 'IQD-CROSS-USD' }],
    }),
  });
  const inversePayment = await request('/admin/supplier-payments', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: randomUUID(), document_date: today, supplier_id: usdSupplier.id,
      cash_account_id: usdCash.id, currency_code: 'USD', amount: '100',
      allocations: [{ invoice_id: inverseInvoice.id, amount: '100' }],
    },
  });
  check(
    amount(inversePayment.allocations[0].amount_invoice_currency),
    152000,
    '100 USD at 1,520 settles a 152,000 IQD invoice',
  );
  check(
    amount(inversePayment.allocations[0].fx_difference_iqd),
    0,
    'paying an IQD invoice from USD cash has no invoice-carrying FX difference',
  );
  const settledInverse = await request(`/admin/purchase-invoices/${inverseInvoice.id}`, { token: stock });
  check(settledInverse.settlement_status, 'paid', 'USD cash settles the IQD invoice');

  const partialCrossInvoice = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: usdSupplier.id,
      locationId,
      variantId: usdVariant,
      currency_code: 'USD',
      exchange_rate: '1500',
      lines: [{ variant_id: usdVariant, quantity: '100', pack_size: '1', unit_cost: '2', lot_number: 'USD-PARTIAL-IQD' }],
    }),
  });
  await request('/admin/supplier-payments', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: randomUUID(), document_date: today, supplier_id: usdSupplier.id,
      cash_account_id: iqdCash.id, currency_code: 'IQD', amount: '76000',
      allocations: [{ invoice_id: partialCrossInvoice.id, amount: '76000' }],
    },
  });
  const partialCross = await request(`/admin/purchase-invoices/${partialCrossInvoice.id}`, { token: stock });
  check(partialCross.settlement_status, 'partial', 'partial IQD payment leaves the USD invoice open');
  check(amount(partialCross.remaining_currency), 150, '76,000 IQD applies 50 USD at 1,520');

  const missingRateInvoice = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: usdSupplier.id,
      locationId,
      variantId: usdVariant,
      currency_code: 'USD',
      exchange_rate: '1500',
      lines: [{ variant_id: usdVariant, quantity: '50', pack_size: '1', unit_cost: '2', lot_number: 'USD-MISSING-RATE' }],
    }),
  });
  await db.query(`
    INSERT INTO user_permission_grants (user_id, permission_id, granted_by, reason)
    SELECT target.id, permission.id, actor.id, 'Rate-override permission acceptance'
    FROM users target CROSS JOIN users actor CROSS JOIN permissions permission
    WHERE target.username='operations' AND actor.username='admin'
      AND permission.key='supplier_payments.record'
    ON CONFLICT DO NOTHING
  `);
  await db.query("UPDATE users SET permission_version=permission_version+1 WHERE username='operations'");
  try {
    const paymentOnly = (await request('/admin/auth/login', {
      method: 'POST',
      expected: 201,
      body: { username: 'operations', password: 'Shubayr-Dev-Staff!2026' },
    })).access_token;
    await request('/admin/supplier-payments', {
      token: paymentOnly,
      method: 'POST',
      expected: 403,
      body: {
        operation_id: randomUUID(), document_date: today, supplier_id: usdSupplier.id,
        cash_account_id: iqdCash.id, currency_code: 'IQD', amount: '151000', exchange_rate: '1510',
        allocations: [{ invoice_id: missingRateInvoice.id, amount: '151000' }],
      },
    });
  } finally {
    await db.query(`
      DELETE FROM user_permission_grants grant_row
      USING users, permissions
      WHERE grant_row.user_id=users.id AND grant_row.permission_id=permissions.id
        AND users.username='operations' AND permissions.key='supplier_payments.record'
    `);
    await db.query("UPDATE users SET permission_version=permission_version+1 WHERE username='operations'");
  }
  const missingRateOperation = randomUUID();
  await db.query("UPDATE exchange_rates SET effective_at=effective_at + interval '100 years' WHERE currency_code='USD'");
  try {
    const missingRate = await request('/admin/supplier-payments', {
      token: admin,
      method: 'POST',
      expected: 422,
      body: {
        operation_id: missingRateOperation, document_date: today, supplier_id: usdSupplier.id,
        cash_account_id: iqdCash.id, currency_code: 'IQD', amount: '152000',
        allocations: [{ invoice_id: missingRateInvoice.id, amount: '152000' }],
      },
    });
    check(missingRate.code, 'EXCHANGE_RATE_NOT_FOUND', 'missing payment-date rate returns its declared code');
    check(
      amount(await scalar('SELECT count(*)::int AS value FROM supplier_payments WHERE operation_id=$1', [missingRateOperation])),
      0,
      'missing-rate payment writes no supplier payment',
    );
    check(
      amount(await scalar('SELECT count(*)::int AS value FROM operation_records WHERE operation_id=$1', [missingRateOperation])),
      0,
      'missing-rate payment rolls back its operation record',
    );
    const overridePayment = await request('/admin/supplier-payments', {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        operation_id: randomUUID(), document_date: today, supplier_id: usdSupplier.id,
        cash_account_id: iqdCash.id, currency_code: 'IQD', amount: '152000', exchange_rate: '1520',
        allocations: [{ invoice_id: missingRateInvoice.id, amount: '152000' }],
      },
    });
    check(
      amount(overridePayment.allocations[0].amount_invoice_currency),
      100,
      'permissioned explicit rate works when no applicable stored rate exists',
    );
  } finally {
    await db.query("UPDATE exchange_rates SET effective_at=effective_at - interval '100 years' WHERE currency_code='USD'");
  }

  const paymentA = await request('/admin/supplier-payments', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: randomUUID(), document_date: today, supplier_id: usdSupplier.id,
      cash_account_id: usdCash.id, currency_code: 'USD', amount: '120', exchange_rate: '1520',
      allocations: [{ invoice_id: usdInvoice.id, amount: '120' }],
    },
  });
  const paymentB = await request('/admin/supplier-payments', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: randomUUID(), document_date: today, supplier_id: usdSupplier.id,
      cash_account_id: usdCash.id, currency_code: 'USD', amount: '80', exchange_rate: '1480',
      allocations: [{ invoice_id: usdInvoice.id, amount: '80' }],
    },
  });
  check(
    amount(await scalar("SELECT COALESCE(sum(line.debit_base-line.credit_base),0) AS value FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id JOIN journal_entries entry ON entry.id=line.entry_id WHERE entry.source_id=$1 AND account.code='5030'", [paymentA.id])),
    2400,
    'paying 120 USD at 1,520 records a 2,400 FX loss',
  );
  check(
    amount(await scalar("SELECT COALESCE(sum(line.credit_base-line.debit_base),0) AS value FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id JOIN journal_entries entry ON entry.id=line.entry_id WHERE entry.source_id=$1 AND account.code='4020'", [paymentB.id])),
    1600,
    'paying 80 USD at 1,480 records a 1,600 FX gain',
  );
  const settledUsd = await request(`/admin/purchase-invoices/${usdInvoice.id}`, { token: stock });
  check(settledUsd.settlement_status, 'paid', 'two partial payments settle the USD invoice');
  check(amount(settledUsd.remaining_currency), 0, 'settled USD invoice has no remaining balance');

  const correctionInvoice = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: supplier.id,
      locationId,
      variantId: correctionVariant,
      lines: [{ variant_id: correctionVariant, quantity: '10', pack_size: '1', unit_cost: '10000', lot_number: 'CORRECT-LOT' }],
    }),
  });
  const correctionItem = correctionInvoice.items[0];
  const relation = (await db.query(`
    SELECT item.id::text AS order_item_id, item.order_id::text, orders.delivery_id::text
    FROM order_items item
    JOIN orders ON orders.id=item.order_id
    WHERE orders.delivery_id IS NOT NULL
    ORDER BY orders.id
    LIMIT 1
  `)).rows[0];
  assert.ok(relation, 'delivery acceptance creates a relation usable for custody cost testing');
  assertions += 1;
  await db.query('UPDATE batch_stock SET quantity=6 WHERE batch_id=$1 AND location_id=$2', [correctionItem.lot_id, locationId]);
  await db.query(`UPDATE sku_costs SET book_quantity=book_quantity-4, book_value_iqd=book_value_iqd-40000, average_cost_iqd=(book_value_iqd-40000)/(book_quantity-4) WHERE variant_id=$1`, [correctionVariant]);
  await db.query(`
    WITH fixture_entry AS (
      INSERT INTO journal_entries (
        document_number, source_type, source_id, event, document_date,
        accounting_date, description, created_by
      )
      VALUES ($1, 'acceptance_fixture', gen_random_uuid(), 'dispatch', $2, $2,
        'Acceptance fixture: move two units to custody and sell two units', $3)
      RETURNING id
    )
    INSERT INTO journal_lines (
      entry_id, account_id, debit_base, credit_base, currency_code,
      original_amount, exchange_rate
    )
    SELECT fixture_entry.id, account.id, posting.debit, posting.credit,
      'IQD', posting.amount, 1
    FROM fixture_entry
    CROSS JOIN (VALUES
      ('1010', 20000::numeric, 0::numeric, 20000::numeric),
      ('5000', 20000::numeric, 0::numeric, 20000::numeric),
      ('1000', 0::numeric, 40000::numeric, 40000::numeric)
    ) AS posting(code, debit, credit, amount)
    JOIN ledger_accounts account ON account.code=posting.code
  `, [`ACC-FIX-${suffix}`, today, adminId]);
  await db.query(`
    INSERT INTO custody_holdings (order_id, order_item_id, delivery_id, custody_party_id, batch_id, quantity, remaining_quantity, unit_cost_iqd)
    VALUES ($1,$2,$3,$4,$5,2,2,10000)
  `, [relation.order_id, relation.order_item_id, relation.delivery_id, adminId, correctionItem.lot_id]);
  const correction = await request('/admin/purchase-cost-corrections', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: randomUUID(), document_date: today, invoice_id: correctionInvoice.id,
      kind: 'late_landed_cost', allocation_method: 'manual', reason: 'Late freight invoice',
      lines: [{ purchase_item_id: correctionItem.id, unit_difference_iqd: '1000' }],
    },
  });
  check(amount(correction.inventory_iqd), 6000, 'cost correction assigns six units to warehouse inventory');
  check(amount(correction.custody_iqd), 2000, 'cost correction assigns two units to custody');
  check(amount(correction.cogs_iqd), 2000, 'cost correction assigns two sold units to COGS');
  check(amount(correction.amount_iqd), 10000, 'three-way correction exactly equals the lot-wide difference');
  check(
    amount(await scalar('SELECT purchase_cost AS value FROM inventory_batches WHERE id=$1', [correctionItem.lot_id])),
    11000,
    'cost correction updates the immutable lot basis prospectively through a correction document',
  );
  check(
    amount(await scalar('SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1', [correctionVariant])),
    11000,
    'cost correction updates the moving average for units still in the warehouse',
  );

  const returnInvoice = await request('/admin/purchase-invoices', {
    token: stock,
    method: 'POST',
    expected: 201,
    body: invoiceBody({
      supplierId: supplier.id,
      locationId,
      variantId: returnVariant,
      lines: [{ variant_id: returnVariant, quantity: '5', pack_size: '1', unit_cost: '7000', lot_number: 'RETURN-LOT' }],
    }),
  });
  const returnItem = returnInvoice.items[0];
  await db.query('UPDATE batch_stock SET reserved=2 WHERE batch_id=$1 AND location_id=$2', [returnItem.lot_id, locationId]);
  const returnBody = {
    operation_id: randomUUID(), document_date: today, supplier_id: supplier.id,
    invoice_id: returnInvoice.id, reason: 'Damaged received goods',
    lines: [{ purchase_item_id: returnItem.id, batch_id: returnItem.lot_id, location_id: locationId, quantity: '4' }],
  };
  await request('/admin/supplier-returns', { token: admin, method: 'POST', expected: 409, body: returnBody });
  await db.query('UPDATE batch_stock SET reserved=0 WHERE batch_id=$1 AND location_id=$2', [returnItem.lot_id, locationId]);
  const returned = await request('/admin/supplier-returns', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { ...returnBody, operation_id: randomUUID(), lines: [{ ...returnBody.lines[0], quantity: '1' }] },
  });
  check(amount(returned.total_iqd), 7000, 'supplier return uses the specific lot cost');
  check(
    amount(await scalar('SELECT quantity AS value FROM batch_stock WHERE batch_id=$1 AND location_id=$2', [returnItem.lot_id, locationId])),
    4,
    'supplier return removes one unreserved unit from its exact lot and location',
  );
  check(
    amount(await scalar("SELECT debit_iqd AS value FROM supplier_account_entries WHERE return_id=$1", [returned.id])),
    7000,
    'supplier return reduces payable by the lot-cost amount',
  );

  const creditPayment = await request('/admin/supplier-payments', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: randomUUID(), document_date: today, supplier_id: supplier.id,
      cash_account_id: iqdCash.id, currency_code: 'IQD', amount: '6000',
      allocations: [{ invoice_id: concurrentA.id, amount: '1000' }],
    },
  });
  check(amount(creditPayment.unallocated_currency), 5000, 'unallocated payment remainder becomes supplier credit');
  check(amount(creditPayment.credits[0].remaining_currency), 5000, 'new supplier credit starts fully available');
  await request(`/admin/supplier-credits/${creditPayment.credits[0].id}/allocations`, {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { operation_id: randomUUID(), invoice_id: first.id, amount: '5000' },
  });
  check(
    amount(await scalar('SELECT remaining_currency AS value FROM supplier_credits WHERE id=$1', [creditPayment.credits[0].id])),
    0,
    'supplier credit can be allocated later to an open invoice',
  );

  await request('/admin/drafts/purchase_invoice', { token: stock, method: 'PUT', body: { payload: { owner: 'stock' } } });
  await request('/admin/drafts/purchase_invoice', { token: admin, method: 'PUT', body: { payload: { owner: 'admin' } } });
  const stockDraft = await request('/admin/drafts/purchase_invoice', { token: stock });
  const adminDraft = await request('/admin/drafts/purchase_invoice', { token: admin });
  check(stockDraft.payload.owner, 'stock', 'purchase draft belongs only to the stock user');
  check(adminDraft.payload.owner, 'admin', 'purchase draft belongs only to the admin user');

  await db.query(`
    INSERT INTO user_permission_grants (user_id, permission_id, granted_by, reason)
    SELECT target.id, permission.id, actor.id, 'Phase 6 cost redaction acceptance'
    FROM users target CROSS JOIN users actor CROSS JOIN permissions permission
    WHERE target.username='operations' AND actor.username='admin' AND permission.key='suppliers.view'
    ON CONFLICT DO NOTHING
  `);
  await db.query("UPDATE users SET permission_version=permission_version+1 WHERE username='operations'");
  const operations = (await request('/admin/auth/login', {
    method: 'POST', expected: 201,
    body: { username: 'operations', password: 'Shubayr-Dev-Staff!2026' },
  })).access_token;
  const redacted = await request(`/admin/purchase-invoices/${first.id}`, { token: operations });
  check('total_iqd' in redacted, false, 'invoice cost totals require cost.view');
  check('landed_unit_cost_iqd' in redacted.items[0], false, 'line landed cost requires cost.view');
  const fullCost = await request(`/admin/purchase-invoices/${second.id}`, { token: stock });
  check('total_iqd' in fullCost, true, 'stock controller receives cost fields');

  const invoiceList = await request(`/admin/purchase-invoices?supplier_id=${supplier.id}`, { token: stock });
  assert.ok(invoiceList.total >= 1, 'purchase invoice list supports supplier filters');
  assertions += 1;
  const statement = await request(`/admin/suppliers/${supplier.id}/statement`, { token: stock });
  assert.ok(statement.length >= 1, 'supplier statement contains posted subledger lines');
  assertions += 1;
  const balances = await request('/admin/suppliers/balances', { token: stock });
  const supplierBalance = balances.find((row) => row.supplier.id === supplier.id && row.currency_code === 'IQD');
  assert.ok(supplierBalance, 'supplier balances include the acceptance supplier');
  assertions += 1;
  check(
    amount(statement.filter((row) => row.currency_code === 'IQD').at(-1).running_balance_iqd),
    amount(supplierBalance.balance_iqd),
    'statement running balance equals the supplier balance',
  );
  const aging = await request(`/admin/suppliers/aging?as_of=${day(100)}`, { token: stock });
  assert.ok(aging.some((row) => row.supplier.id === supplier.id), 'aging includes an unpaid supplier document');
  assertions += 1;
  for (const [offset, bucket] of [[45, 'current'], [46, '1_30'], [76, '31_60'], [106, '61_90'], [136, '90_plus']]) {
    const bucketRows = await request(`/admin/suppliers/aging?as_of=${day(offset)}`, { token: stock });
    check(
      bucketRows.find((row) => row.invoice_id === second.id).bucket,
      bucket,
      `aging assigns the ${bucket} due-date bucket`,
    );
  }
  const payments = await request(`/admin/supplier-payments?supplier_id=${usdSupplier.id}`, { token: stock });
  check(payments.length, 6, 'supplier payment list exposes same- and cross-currency payments');
  await request(`/admin/supplier-credits?supplier_id=${supplier.id}`, { token: stock });

  const inventoryLedger = amount(await scalar(`
    SELECT COALESCE(sum(line.debit_base-line.credit_base),0) AS value
    FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
    WHERE account.code='1000'
  `));
  const inventoryBook = amount(await scalar('SELECT COALESCE(sum(book_value_iqd),0) AS value FROM sku_costs'));
  check(inventoryLedger, inventoryBook, 'inventory control ledger reconciles to SKU book values');
  const apLedger = amount(await scalar(`
    SELECT COALESCE(sum(line.credit_base-line.debit_base),0) AS value
    FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
    WHERE account.code='2000'
  `));
  const supplierLedger = amount(await scalar('SELECT COALESCE(sum(credit_iqd-debit_iqd),0) AS value FROM supplier_account_entries'));
  check(apLedger, supplierLedger, 'AP control ledger reconciles to supplier subledger');

  console.log(`Purchasing acceptance passed (${assertions} assertions).`);
} finally {
  await db.end();
}
