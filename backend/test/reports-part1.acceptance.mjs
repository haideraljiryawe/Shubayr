import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error(
    'Reports acceptance requires the disposable *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Reports acceptance requires the runner-owned loopback API');
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
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
  const type = response.headers.get('content-type') ?? '';
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString('utf8');
  const payload = text && type.includes('json') ? JSON.parse(text) : bytes;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}

function amount(value) {
  return Number(value);
}

const boundary = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
check(
  boundary.format(new Date('2026-08-31T20:59:59.999Z')),
  '2026-08-31',
  'before Baghdad midnight stays in August',
);
check(
  boundary.format(new Date('2026-08-31T21:00:00.000Z')),
  '2026-09-01',
  'Baghdad midnight begins September',
);

const adminLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
});
const operationsLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'operations', password: 'Shubayr-Dev-Staff!2026' },
});
const adminToken = adminLogin.access_token;
const operationsToken = operationsLogin.access_token;

await request('/admin/reports/sales?from=2026-08-01&to=2026-08-31', {
  token: operationsToken,
  expected: 403,
});
await request('/admin/reports/profitability?from=2026-08-01&to=2026-08-31', {
  token: operationsToken,
  expected: 403,
});
await request('/admin/reports/trial-balance?as_of=2026-08-31', {
  token: operationsToken,
  expected: 403,
});

const refs = await client.query(`
  SELECT
    (SELECT id FROM users WHERE username = 'admin') AS admin_id,
    (SELECT id FROM users WHERE phone IS NOT NULL ORDER BY created_at LIMIT 1) AS customer_id,
    (SELECT id FROM delivery_parties WHERE is_active ORDER BY created_at LIMIT 1) AS party_id,
    (SELECT id FROM warehouse_locations WHERE is_active ORDER BY id LIMIT 1) AS location_id
`);
const {
  admin_id: adminId,
  customer_id: customerId,
  party_id: partyId,
  location_id: locationId,
} = refs.rows[0];
assert.ok(
  adminId && customerId && partyId && locationId,
  'seed references are present',
);

const categoryId = randomUUID();
const brandId = randomUUID();
const productId = randomUUID();
const variantId = randomUUID();
const batchId = randomUUID();
const expenseId = randomUUID();
const expenseJournalId = randomUUID();
const duplicateExpenseCategoryId = randomUUID();
const months = [
  { date: '2026-07-15', lines: 6667, suffix: '07' },
  { date: '2026-08-15', lines: 6667, suffix: '08' },
  { date: '2026-09-15', lines: 6667, suffix: '09' },
];
const seededOrders = [];

await client.query('BEGIN');
try {
  await client.query(
    `INSERT INTO ledger_accounts
       (code, name_ar, name_en, type, normal_side, enabled, is_system)
     VALUES ('C14-INACTIVE', 'حساب غير نشط', 'Inactive report account',
       'asset', 'debit', FALSE, FALSE)`,
  );
  await client.query(
    `INSERT INTO categories (id, name_en, name_ar, slug, is_visible)
     VALUES ($1, 'C14 Reports', 'تقارير C14', $2, TRUE)`,
    [categoryId, `c14-reports-${categoryId}`],
  );
  await client.query(
    `INSERT INTO brands (id, name_en, name_ar, slug, is_visible)
     VALUES ($1, 'C14 Brand', 'علامة C14', $2, TRUE)`,
    [brandId, `c14-brand-${brandId}`],
  );
  await client.query(
    `INSERT INTO products (id, category_id, brand_id, name_en, name_ar, price, currency_code, status)
     VALUES ($1, $2, $3, 'C14 Report Product', 'منتج تقرير C14', 100, 'IQD', 'active')`,
    [productId, categoryId, brandId],
  );
  await client.query(
    `INSERT INTO product_variants (id, product_id, sku, price_delta, currency_code, base_unit, whole_units_only, selling_price)
     VALUES ($1, $2, $3, 0, 'IQD', 'piece', TRUE, 100)`,
    [variantId, productId, `C14-${variantId}`],
  );
  await client.query(
    `INSERT INTO inventory_batches
       (id, product_id, variant_id, purchase_cost, currency_code, qty_received, source_type, entry_date)
     VALUES ($1, $2, $3, 40, 'IQD', 25000, 'c14_acceptance', '2026-07-01T00:00:00Z')`,
    [batchId, productId, variantId],
  );
  await client.query(
    `INSERT INTO expense_categories
       (id, code, name_ar, name_en, ledger_account_id, is_system)
     SELECT $1, $2, 'إيجار إضافي', 'Additional rent', id, FALSE
     FROM ledger_accounts WHERE code = '5100'`,
    [
      duplicateExpenseCategoryId,
      `c14-shared-rent-${duplicateExpenseCategoryId.slice(0, 8)}`,
    ],
  );
  await client.query(
    `INSERT INTO journal_entries
       (id, document_number, source_type, source_id, event, document_date,
        accounting_date, description, created_by)
     VALUES ($1, $2, 'expense', $3, 'posted', '2026-08-10', '2026-08-10',
       'C14 rent expense', $4)`,
    [
      expenseJournalId,
      `C14-EXP-JE-${expenseJournalId.slice(0, 8)}`,
      expenseId,
      adminId,
    ],
  );
  await client.query(
    `INSERT INTO journal_lines
       (entry_id, account_id, debit_base, credit_base, currency_code,
        original_amount, exchange_rate, memo)
     SELECT $1, id,
       CASE WHEN code = '5100' THEN 1000 ELSE 0 END,
       CASE WHEN code = '2040' THEN 1000 ELSE 0 END,
       'IQD', 1000, 1, 'C14 rent expense'
     FROM ledger_accounts WHERE code IN ('5100','2040')`,
    [expenseJournalId],
  );
  await client.query(
    `INSERT INTO expenses
       (id, document_number, status, category_id, amount_currency, currency_code,
        exchange_rate, amount_iqd, paid_currency, balance_currency, payment_mode,
        payee, description, document_date, accounting_date, created_by, posted_by,
        posted_at, journal_entry_id)
     SELECT $1, $2, 'posted', id, 1000, 'IQD', 1, 1000, 0, 1000, 'owed',
       'C14 landlord', 'C14 rent expense', '2026-08-10', '2026-08-10', $3, $3,
       now(), $4
     FROM expense_categories WHERE code = 'rent'`,
    [expenseId, `C14-EXP-${expenseId.slice(0, 8)}`, adminId, expenseJournalId],
  );

  for (const month of months) {
    const orderId = randomUUID();
    const deliveryId = randomUUID();
    const journalId = randomUUID();
    const collectionId = randomUUID();
    const gross = month.lines * 100;
    const tier = month.lines * 7;
    const coupon = month.lines * 3;
    const net = month.lines * 90;
    const cost = month.lines * 40;
    const total = net + 500;
    seededOrders.push({
      ...month,
      orderId,
      deliveryId,
      journalId,
      collectionId,
      gross,
      tier,
      coupon,
      net,
      cost,
      total,
    });

    await client.query(
      `INSERT INTO orders
        (id, user_id, order_number, status, payment_method, subtotal, original_delivery_fee,
         delivery_fee, adjusted_delivery_fee, delivery_fee_adjustment_reason, delivery_fee_adjusted_by,
         delivery_fee_adjusted_at,
         discount, discount_source, coupon_discount, tier_discount, total, currency_code,
         document_date, accounting_date, delivery_contact_phone, delivery_city, customer_contacted,
         customer_contact_note, placed_at)
       VALUES ($1, $2, $3, 'delivered', 'cod', $4, 400, 500, 500,
         'C14 acceptance adjustment', $5, ($10::date + time '10:00') AT TIME ZONE 'Asia/Baghdad',
         $6, 'stacked', $7, $8, $9, 'IQD',
         $10::date, $10::date, '+9647700000099', 'Baghdad', TRUE,
         'C14 acceptance contact', ($10::date + time '12:00') AT TIME ZONE 'Asia/Baghdad')`,
      [
        orderId,
        customerId,
        `C14-${month.suffix}-${orderId.slice(0, 8)}`,
        gross,
        adminId,
        tier + coupon,
        coupon,
        tier,
        total,
        month.date,
      ],
    );
    await client.query(
      `INSERT INTO deliveries (id, order_id, agent_id, status, delivery_fee, currency_code, dispatched_at, delivered_at)
       VALUES ($1, $2, $3, 'delivered', 500, 'IQD', $4::date, $4::date + interval '1 hour')`,
      [deliveryId, orderId, partyId, month.date],
    );
    await client.query(`UPDATE orders SET delivery_id = $1 WHERE id = $2`, [
      deliveryId,
      orderId,
    ]);
    await client.query(
      `INSERT INTO journal_entries
        (id, document_number, source_type, source_id, event, document_date, accounting_date, description, created_by)
       VALUES ($1, $2, 'delivery_collection', $3, 'delivered_full', $4::date, $4::date, 'C14 report dataset', $5)`,
      [
        journalId,
        `C14-JE-${month.suffix}-${journalId.slice(0, 8)}`,
        collectionId,
        month.date,
        adminId,
      ],
    );
    await client.query(
      `INSERT INTO journal_lines
        (entry_id, account_id, debit_base, credit_base, currency_code, original_amount, exchange_rate, memo)
       SELECT $1, id,
         CASE code WHEN '5000' THEN $2::numeric WHEN '1020' THEN $3::numeric ELSE 0 END,
         CASE code WHEN '1010' THEN $2::numeric WHEN '4000' THEN $4::numeric WHEN '4010' THEN 500 ELSE 0 END,
         'IQD', CASE code WHEN '5000' THEN $2::numeric WHEN '1010' THEN $2::numeric WHEN '4000' THEN $4::numeric WHEN '4010' THEN 500 ELSE $3::numeric END,
         1, 'C14 report dataset'
       FROM ledger_accounts WHERE code IN ('5000','1020','1010','4000','4010')`,
      [journalId, cost, total, net],
    );
    await client.query(
      `INSERT INTO delivery_collections
        (id, delivery_id, order_id, party_id, status, due_amount, collected_amount, shortfall_amount,
         currency_code, delivered_operation_id, delivered_by, delivered_at, accounting_date,
         delivery_journal_entry_id, confirmed_operation_id, confirmed_by, confirmed_at)
       VALUES ($1, $2, $3, $4, 'confirmed_full', $5, $5, 0, 'IQD', $6, $7,
         $8::date + interval '1 hour', $8::date, $9, $10, $7, $8::date + interval '2 hours')`,
      [
        collectionId,
        deliveryId,
        orderId,
        partyId,
        total,
        `c14-deliver-${orderId}`,
        adminId,
        month.date,
        journalId,
        `c14-confirm-${orderId}`,
      ],
    );
    await client.query(
      `INSERT INTO order_items
        (order_id, product_id, variant_id, product_name_ar, product_name_en, quantity,
         unit_price, line_total, discount_share, coupon_discount_share, tier_discount_share,
         loyalty_discount_share, other_adjustment_share, net_line_total, net_paid_total,
         currency_code, base_unit, whole_units_only, price_version)
       SELECT $1, $2, $3, 'منتج تقرير C14', 'C14 Report Product', 1,
         100, 100, 10, 3, 7, 0, 0, 90, 90, 'IQD', 'piece', TRUE, 'c14'
       FROM generate_series(1, $4::int)`,
      [orderId, productId, variantId, month.lines],
    );
    await client.query(
      `INSERT INTO custody_holdings
        (order_id, order_item_id, delivery_id, custody_party_id, batch_id, quantity,
         remaining_quantity, unit_cost_iqd, status, issued_at, settled_at)
       SELECT $1, oi.id, $2, $3, $4, 1, 0, 40, 'sold', $5::date, $5::date + interval '1 hour'
       FROM order_items oi WHERE oi.order_id = $1`,
      [orderId, deliveryId, partyId, batchId, month.date],
    );
  }

  for (const status of ['cancelled', 'rejected']) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO orders
        (id, user_id, order_number, status, subtotal, delivery_fee, original_delivery_fee,
         discount, total, document_date, accounting_date, delivery_contact_phone, delivery_city)
       VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, '2026-08-20', '2026-08-20', '+9647700000099', 'Baghdad')`,
      [id, customerId, `C14-${status}-${id.slice(0, 8)}`, status],
    );
  }

  const august = seededOrders[1];
  const returnedItem = await client.query(
    `SELECT id FROM order_items WHERE order_id = $1 ORDER BY id LIMIT 1`,
    [august.orderId],
  );
  const returnId = randomUUID();
  const returnJournalId = randomUUID();
  const restockJournalId = randomUUID();
  await client.query(
    `INSERT INTO returns
      (id, document_number, order_id, user_id, created_by, source, type, status, reason,
       expected_refund, refund_amount, uncollected_offset, document_date, accounting_date,
       reviewed_by, reviewed_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, 'staff', 'return', 'completed', 'C14 report return',
       90, 90, 90, '2026-08-25', '2026-08-25', $5, now(), now())`,
    [
      returnId,
      `C14-RET-${returnId.slice(0, 8)}`,
      august.orderId,
      customerId,
      adminId,
    ],
  );
  await client.query(
    `INSERT INTO return_items
      (return_id, order_item_id, quantity, approved_quantity, customer_reason, reason_code,
       unit_price, discount_share, net_amount, approved_refund, issue_cost_value,
       currency_code, base_unit, whole_units_only, condition, restock, batch_id, inspection_location_id)
     VALUES ($1, $2, 1, 1, 'C14 acceptance', 'change_of_mind', 100, 10, 90, 90, 40,
       'IQD', 'piece', TRUE, 'sellable', TRUE, $3, $4)`,
    [returnId, returnedItem.rows[0].id, batchId, locationId],
  );
  for (const posting of [
    {
      id: returnJournalId,
      role: 'return_against_uncollected',
      event: 'return_against_uncollected',
    },
    {
      id: restockJournalId,
      role: 'restock_issue_cost',
      event: 'restock_issue_cost',
    },
  ]) {
    await client.query(
      `INSERT INTO journal_entries
        (id, document_number, source_type, source_id, event, document_date, accounting_date, description, created_by)
       VALUES ($1, $2, 'return', $3, $4, '2026-08-25', '2026-08-25', 'C14 return posting', $5)`,
      [
        posting.id,
        `C14-${posting.role}-${posting.id.slice(0, 8)}`,
        returnId,
        posting.event,
        adminId,
      ],
    );
    await client.query(
      `INSERT INTO return_postings (return_id, role, journal_entry_id) VALUES ($1, $2, $3)`,
      [returnId, posting.role, posting.id],
    );
  }
  await client.query(
    `INSERT INTO journal_lines (entry_id, account_id, debit_base, credit_base, currency_code, original_amount, exchange_rate)
     SELECT $1, id, CASE WHEN code = '4100' THEN 90 ELSE 0 END, CASE WHEN code = '1020' THEN 90 ELSE 0 END,
       'IQD', 90, 1 FROM ledger_accounts WHERE code IN ('4100','1020')`,
    [returnJournalId],
  );
  await client.query(
    `INSERT INTO journal_lines (entry_id, account_id, debit_base, credit_base, currency_code, original_amount, exchange_rate)
     SELECT $1, id, CASE WHEN code = '1010' THEN 40 ELSE 0 END, CASE WHEN code = '5000' THEN 40 ELSE 0 END,
       'IQD', 40, 1 FROM ledger_accounts WHERE code IN ('1010','5000')`,
    [restockJournalId],
  );

  const writeDownId = randomUUID();
  const writeDownJournalId = randomUUID();
  await client.query(
    `INSERT INTO journal_entries
      (id, document_number, source_type, source_id, event, document_date, accounting_date, description, created_by)
     VALUES ($1, $2, 'inventory_write_down', $3, 'inventory_write_down', '2026-08-26', '2026-08-26', 'C14 damage', $4)`,
    [
      writeDownJournalId,
      `C14-WD-JE-${writeDownId.slice(0, 8)}`,
      writeDownId,
      adminId,
    ],
  );
  await client.query(
    `INSERT INTO journal_lines (entry_id, account_id, debit_base, credit_base, currency_code, original_amount, exchange_rate)
     SELECT $1, id, CASE WHEN code = '5010' THEN 40 ELSE 0 END, CASE WHEN code = '1010' THEN 40 ELSE 0 END,
       'IQD', 40, 1 FROM ledger_accounts WHERE code IN ('5010','1010')`,
    [writeDownJournalId],
  );
  await client.query(
    `INSERT INTO inventory_write_downs
      (id, document_number, operation_id, document_date, accounting_date, reason, status, created_by, journal_entry_id)
     VALUES ($1, $2, $3, '2026-08-26', '2026-08-26', 'C14 acceptance damage', 'posted', $4, $5)`,
    [
      writeDownId,
      `C14-WD-${writeDownId.slice(0, 8)}`,
      `c14-write-down-${writeDownId}`,
      adminId,
      writeDownJournalId,
    ],
  );
  await client.query(
    `INSERT INTO inventory_write_down_lines
      (write_down_id, variant_id, batch_id, location_id, quantity, unit_cost_iqd)
     VALUES ($1, $2, $3, $4, 1, 40)`,
    [writeDownId, variantId, batchId, locationId],
  );
  await client.query(
    `INSERT INTO accounting_periods (month, status, closed_at, closed_by)
     VALUES ('2026-07-01', 'closed', now(), $1)
     ON CONFLICT (month) DO UPDATE SET status = 'closed', closed_at = now(), closed_by = $1`,
    [adminId],
  );
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
}

const countRows = await client.query(
  `SELECT COUNT(*)::int AS count FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.order_number LIKE 'C14-%'`,
);
check(
  countRows.rows[0].count,
  20001,
  'performance dataset contains at least 20,000 order lines',
);

const reportTimes = new Map();
const timed = async (name, path) => {
  const start = performance.now();
  const payload = await request(path, { token: adminToken });
  const elapsed = performance.now() - start;
  reportTimes.set(name, [...(reportTimes.get(name) ?? []), elapsed]);
  check(
    elapsed < 2000,
    true,
    `${path} answers within two seconds (was ${elapsed.toFixed(0)} ms)`,
  );
  return payload;
};

const sales = await timed(
  'sales',
  '/admin/reports/sales?from=2026-08-01&to=2026-08-31&group_by=sku',
);
check(sales.touches_open_period, true, 'August is marked as an open period');
check(
  sales.totals.gross_sales,
  '666700.0000',
  'sales gross comes from posted order line snapshots',
);
check(
  sales.totals.tier_discounts,
  '46669.0000',
  'tier discounts are reported exactly',
);
check(
  sales.totals.coupon_discounts,
  '20001.0000',
  'coupon discounts are reported exactly',
);
check(sales.totals.returns, '90.0000', 'posted returns reduce sales');
check(
  sales.totals.net_sales,
  '599940.0000',
  'net sales includes discounts and returns',
);
check(
  sales.totals.original_delivery_fees,
  '400.0000',
  'original delivery fee is retained',
);
check(
  sales.totals.charged_delivery_fees,
  '500.0000',
  'adjusted delivery fee is charged',
);
check(sales.totals.cancelled_count, 1, 'cancelled orders are counted');
check(sales.totals.rejected_count, 1, 'rejected orders are counted');
check(
  'cost_of_goods_sold' in sales.totals,
  false,
  'sales response exposes no costs',
);
check(
  sales.data[0].drilldown.documents.resource,
  'orders',
  'sales rows identify their underlying document resource',
);
check(
  sales.data[0].drilldown.journals.resource,
  'journal_entries',
  'sales rows identify their underlying journal resource',
);

const profit = await timed(
  'profitability',
  '/admin/reports/profitability?from=2026-08-01&to=2026-08-31&group_by=sku',
);
check(
  profit.totals.cost_of_goods_sold,
  '266680.0000',
  'profit report uses original issue cost',
);
check(
  profit.totals.return_cost_reversals,
  '40.0000',
  'return cost reversal is reported',
);
check(
  profit.totals.inventory_write_downs,
  '40.0000',
  'damage is separate from gross profit',
);
check(
  profit.totals.gross_profit,
  '333300.0000',
  'gross profit reconciles exactly',
);
check(
  profit.data[0].drilldown.documents.parameters.group_by,
  'sku',
  'profitability drill-down preserves the grouping selector',
);

const skuPicker = await request(
  `/admin/reports/catalog-picker?report_type=profitability&kind=sku&q=${encodeURIComponent(`C14-${variantId}`)}`,
  { token: adminToken },
);
check(
  skuPicker.data[0].id,
  variantId,
  'report-scoped SKU picker returns the matching variant',
);
const categoryPicker = await request(
  '/admin/reports/catalog-picker?report_type=sales&kind=category&q=C14',
  { token: adminToken },
);
check(
  categoryPicker.data.some((row) => row.id === categoryId),
  true,
  'report-scoped category picker returns matching categories',
);

const pnl = await timed(
  'profit_loss',
  '/admin/reports/profit-loss?from=2026-08-01&to=2026-08-31&per_page=1',
);
check(
  pnl.current.sales_revenue,
  '600030.0000',
  'P&L sales revenue comes from ledger account 4000',
);
check(
  pnl.current.sales_returns,
  '90.0000',
  'P&L includes returns account 4100',
);
check(
  pnl.current.cost_of_goods_sold,
  '266640.0000',
  'P&L COGS includes the return cost reversal',
);
check(
  pnl.current.inventory_write_downs,
  '40.0000',
  'P&L presents write-downs separately',
);
check(
  pnl.current.operating_expenses,
  '1000.0000',
  'P&L includes posted C12 expenses exactly once',
);
check(
  pnl.current.expenses.length,
  1,
  'expense categories are sourced from their posted documents',
);
check(
  pnl.current.expenses[0].amount,
  '1000.0000',
  'expense category amount reconciles exactly',
);
check(pnl.data.length, 1, 'P&L detail rows use server-side pagination');
check(
  pnl.pagination.total > 1,
  true,
  'P&L pagination reports the complete account-row count',
);
check(
  pnl.data[0].drilldown.resource,
  'journal_entries',
  'P&L detail rows provide journal drill-down metadata',
);
const pnlSecondPage = await request(
  '/admin/reports/profit-loss?from=2026-08-01&to=2026-08-31&page=2&per_page=1',
  { token: adminToken },
);
check(
  pnlSecondPage.data[0].account_id === pnl.data[0].account_id,
  false,
  'P&L pages return distinct stable account rows',
);

const ledger = await client.query(`
  SELECT a.code, SUM(jl.debit_base - jl.credit_base)::text AS net
  FROM journal_entries je
  JOIN journal_lines jl ON jl.entry_id = je.id
  JOIN ledger_accounts a ON a.id = jl.account_id
  WHERE je.accounting_date BETWEEN '2026-08-01' AND '2026-08-31'
  GROUP BY a.code
`);
const ledgerNet = Object.fromEntries(
  ledger.rows.map((row) => [row.code, amount(row.net)]),
);
check(
  amount(pnl.current.sales_revenue),
  -(ledgerNet['4000'] ?? 0),
  'P&L revenue reconciles with the ledger',
);
check(
  amount(pnl.current.sales_returns),
  ledgerNet['4100'] ?? 0,
  'P&L returns reconcile with the ledger',
);
check(
  amount(pnl.current.cost_of_goods_sold),
  ledgerNet['5000'] ?? 0,
  'P&L COGS reconciles with the ledger',
);
check(
  amount(pnl.current.inventory_write_downs),
  ledgerNet['5010'] ?? 0,
  'P&L write-downs reconcile with the ledger',
);
check(
  amount(pnl.current.operating_expenses),
  ledgerNet['5100'] ?? 0,
  'P&L operating expenses reconcile with the ledger',
);

const closedSales = await request(
  '/admin/reports/sales?from=2026-07-01&to=2026-07-31',
  { token: adminToken },
);
check(
  closedSales.touches_open_period,
  false,
  'a fully closed range is identified',
);
const mixedSales = await request(
  '/admin/reports/sales?from=2026-07-01&to=2026-09-30',
  { token: adminToken },
);
check(
  mixedSales.touches_open_period,
  true,
  'a range touching an open period is identified',
);

const trial = await timed(
  'trial_balance',
  '/admin/reports/trial-balance?as_of=2026-08-31&per_page=500',
);
check(trial.balanced, true, 'trial balance is balanced');
check(
  trial.debit_total,
  trial.credit_total,
  'trial balance debit and credit totals match',
);
check(
  trial.data.some((row) => row.code === 'C14-INACTIVE'),
  true,
  'trial balance includes inactive accounts',
);
const directTrial = await client.query(`
  SELECT COALESCE(SUM(jl.debit_base), 0)::text AS debit, COALESCE(SUM(jl.credit_base), 0)::text AS credit
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
  WHERE je.accounting_date <= '2026-08-31'
`);
check(
  amount(trial.debit_total),
  amount(directTrial.rows[0].debit),
  'trial debits reconcile with posted ledger lines',
);
check(
  amount(trial.credit_total),
  amount(directTrial.rows[0].credit),
  'trial credits reconcile with posted ledger lines',
);

const balance = await timed(
  'balance_sheet',
  '/admin/reports/balance-sheet?as_of=2026-08-31&per_page=500',
);
check(balance.totals.balanced, true, 'balance sheet balances');
check(
  balance.totals.assets,
  balance.totals.liabilities_and_equity,
  'balance sheet equation reconciles',
);

const stabilityReports = [
  ['sales', '/admin/reports/sales?from=2026-08-01&to=2026-08-31&group_by=sku'],
  [
    'profitability',
    '/admin/reports/profitability?from=2026-08-01&to=2026-08-31&group_by=sku',
  ],
  ['profit_loss', '/admin/reports/profit-loss?from=2026-08-01&to=2026-08-31'],
  [
    'trial_balance',
    '/admin/reports/trial-balance?as_of=2026-08-31&per_page=500',
  ],
  [
    'balance_sheet',
    '/admin/reports/balance-sheet?as_of=2026-08-31&per_page=500',
  ],
];
for (let pass = 1; pass < 10; pass += 1) {
  for (const [name, path] of stabilityReports) await timed(name, path);
}

const audits = await client.query(
  `
  SELECT after->>'report' AS report FROM audit_logs
  WHERE actor_id = $1 AND action = 'report.read' AND entity_type = 'report'
`,
  [adminId],
);
const audited = new Set(audits.rows.map((row) => row.report));
check(audited.has('profitability'), true, 'profitability read is audited');
check(audited.has('profit_loss'), true, 'profit-and-loss read is audited');

const queued = await request('/admin/reports/exports', {
  token: adminToken,
  method: 'POST',
  expected: 202,
  body: {
    report_type: 'sales',
    format: 'csv',
    language: 'ar',
    from: '2026-08-01',
    to: '2026-08-31',
    group_by: 'sku',
  },
});
check('data' in queued, false, 'export progress contains no report rows');
let progress = queued;
for (
  let attempt = 0;
  attempt < 100 && !['completed', 'failed'].includes(progress.status);
  attempt += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  progress = await request(`/admin/reports/exports/${queued.id}/progress`, {
    token: adminToken,
  });
}
check(
  progress.status,
  'completed',
  `Arabic export completed: ${progress.last_error ?? ''}`,
);
check(
  progress.rows_done,
  progress.rows_total,
  'export progress reaches its exact total',
);
check('data' in progress, false, 'polling payload remains progress-only');
const csv = await request(`/admin/reports/exports/${queued.id}/download`, {
  token: adminToken,
});
check(
  [...csv.subarray(0, 3)],
  [0xef, 0xbb, 0xbf],
  'CSV starts with a UTF-8 BOM',
);
check(csv.toString('utf8').includes('الرمز'), true, 'CSV has Arabic headers');

await client.end();
const timingSummary = [...reportTimes.entries()]
  .map(([name, timings]) => {
    const sorted = [...timings].sort((left, right) => left - right);
    const median = (sorted[4] + sorted[5]) / 2;
    return `${name} min/median/max ${sorted[0].toFixed(1)}/${median.toFixed(1)}/${sorted.at(-1).toFixed(1)} ms`;
  })
  .join('; ');
console.log(
  `Reports part 1 acceptance assertions: ${assertions}; 10 consecutive passes over 20,001 order lines: ${timingSummary}`,
);
