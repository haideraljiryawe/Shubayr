import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error('Reports part 2 acceptance requires the disposable database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Reports part 2 acceptance requires the loopback API');
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}
function ok(value, message) {
  assert.ok(value, message);
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
async function login(username, password) {
  return (
    await request('/admin/auth/login', {
      method: 'POST',
      expected: 201,
      body: { username, password },
    })
  ).access_token;
}
async function postEntry({
  sourceType,
  sourceId,
  event,
  date,
  description,
  adminId,
  lines,
}) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO journal_entries
       (id,document_number,source_type,source_id,event,document_date,
        accounting_date,description,created_by,posted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,
       ($6::date + time '12:00') AT TIME ZONE 'Asia/Baghdad')`,
    [
      id,
      `C14B-JE-${id.slice(0, 8)}`,
      sourceType,
      sourceId,
      event,
      date,
      description,
      adminId,
    ],
  );
  for (const line of lines) {
    await db.query(
      `INSERT INTO journal_lines
         (entry_id,account_id,debit_base,credit_base,currency_code,
          original_amount,exchange_rate,memo)
       SELECT $1,id,$3,$4,'IQD',$5,1,$6 FROM ledger_accounts WHERE code=$2`,
      [
        id,
        line.code,
        line.debit ?? 0,
        line.credit ?? 0,
        line.debit ?? line.credit,
        description,
      ],
    );
  }
  return id;
}
async function timed(path, token, limit) {
  const started = performance.now();
  const payload = await request(path, { token });
  const elapsed = performance.now() - started;
  check(
    elapsed < limit,
    true,
    `${path} answers within ${limit} ms (was ${elapsed.toFixed(1)} ms)`,
  );
  return payload;
}

const boundary = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
check(
  boundary.format(new Date('2025-01-31T20:59:59.999Z')),
  '2025-01-31',
  'the instant before Baghdad midnight stays on January 31',
);
check(
  boundary.format(new Date('2025-01-31T21:00:00.000Z')),
  '2025-02-01',
  'Baghdad midnight begins February 1',
);

const adminToken = await login('admin', 'Shubayr-Dev-Admin!2026');
const deniedToken = await login('operations', 'Shubayr-Dev-Staff!2026');
await request('/admin/reports/cash?from=2025-01-10&to=2025-01-31', {
  token: deniedToken,
  expected: 403,
});
await request('/admin/reports/liabilities?as_of=2025-01-31', {
  token: deniedToken,
  expected: 403,
});
await request('/admin/reports/inventory-valuation?as_of=2025-01-31', {
  token: deniedToken,
  expected: 403,
});

const refs = await db.query(`
  SELECT
    (SELECT id FROM users WHERE username='admin') admin_id,
    (SELECT id FROM users WHERE username='operations') operations_id,
    (SELECT id FROM users WHERE phone IS NOT NULL ORDER BY created_at LIMIT 1) customer_id,
    (SELECT p.id FROM products p JOIN product_variants v ON v.product_id=p.id ORDER BY p.id LIMIT 1) product_id,
    (SELECT id FROM product_variants ORDER BY product_id,id LIMIT 1) variant_id,
    (SELECT id FROM warehouse_locations WHERE is_active ORDER BY id LIMIT 1) location_id,
    (SELECT id FROM expense_categories WHERE code='rent') category_id
`);
const {
  admin_id: adminId,
  operations_id: operationsId,
  customer_id: customerId,
  product_id: productId,
  variant_id: variantId,
  location_id: locationId,
  category_id: categoryId,
} = refs.rows[0];
ok(
  adminId &&
    operationsId &&
    customerId &&
    productId &&
    variantId &&
    locationId &&
    categoryId,
  'reference data for the report fixture exists',
);

const cashLedgerId = randomUUID();
const cashAccountId = randomUUID();
const partyId = randomUUID();
const openingId = randomUUID();
const batchId = randomUUID();
const orderId = randomUUID();
const deliveryId = randomUUID();
const collectionId = randomUUID();
const receiptId = randomUUID();
const supplierId = randomUUID();
const supplierEntryId = randomUUID();
const expenseId = randomUUID();
const returnId = randomUUID();

await db.query('BEGIN');
try {
  await db.query(
    `INSERT INTO ledger_accounts
       (id,code,name_ar,name_en,type,normal_side,is_system,enabled)
     VALUES ($1,$2,'صندوق اختبار التقارير','C14b report cash','asset','debit',false,true)`,
    [cashLedgerId, `C14B-CASH-${cashLedgerId.slice(0, 8)}`],
  );
  await db.query(
    `INSERT INTO cash_accounts
       (id,name,kind,currency_code,ledger_account_id,is_active)
     VALUES ($1,'C14b report cash','cash','IQD',$2,true)`,
    [cashAccountId, cashLedgerId],
  );
  const cashOpeningJournal = await postEntry({
    sourceType: 'cash_opening',
    sourceId: openingId,
    event: 'opening_balance',
    date: '2025-01-01',
    description: 'C14b cash opening',
    adminId,
    lines: [
      { code: `C14B-CASH-${cashLedgerId.slice(0, 8)}`, debit: 1000 },
      { code: '3000', credit: 1000 },
    ],
  });
  await db.query(
    `INSERT INTO cash_opening_balances
       (id,document_number,cash_account_id,amount,currency_code,document_date,
        accounting_date,created_by,journal_entry_id)
     VALUES ($1,$2,$3,1000,'IQD','2025-01-01','2025-01-01',$4,$5)`,
    [
      openingId,
      `C14B-COB-${openingId.slice(0, 8)}`,
      cashAccountId,
      adminId,
      cashOpeningJournal,
    ],
  );
  await postEntry({
    sourceType: 'cash_receipt',
    sourceId: randomUUID(),
    event: 'customer_receipt',
    date: '2025-01-15',
    description: 'C14b customer receipt',
    adminId,
    lines: [
      { code: `C14B-CASH-${cashLedgerId.slice(0, 8)}`, debit: 500 },
      { code: '4000', credit: 500 },
    ],
  });
  await postEntry({
    sourceType: 'expense_payment',
    sourceId: randomUUID(),
    event: 'expense_paid',
    date: '2025-01-20',
    description: 'C14b expense payment',
    adminId,
    lines: [
      { code: '5100', debit: 200 },
      { code: `C14B-CASH-${cashLedgerId.slice(0, 8)}`, credit: 200 },
    ],
  });

  await db.query(
    `INSERT INTO delivery_parties (id,kind,name,phone,is_active)
     VALUES ($1,'external_driver','C14b Driver','+9647700014400',true)`,
    [partyId],
  );
  const inventoryOpeningJournal = await postEntry({
    sourceType: 'inventory_opening',
    sourceId: openingId,
    event: 'opening_balance',
    date: '2025-01-01',
    description: 'C14b inventory opening',
    adminId,
    lines: [
      { code: '1000', debit: 400 },
      { code: '3000', credit: 400 },
    ],
  });
  await db.query(
    `INSERT INTO inventory_batches
       (id,product_id,variant_id,purchase_cost,currency_code,qty_received,
        source_type,source_id,entry_date)
     VALUES ($1,$2,$3,40,'IQD',10,'inventory_opening',$4,
       '2025-01-01T09:00:00+03:00')`,
    [batchId, productId, variantId, openingId],
  );
  await db.query(
    `INSERT INTO inventory_openings
       (id,document_number,operation_id,document_date,accounting_date,status,
        created_by,journal_entry_id,created_at,posted_at)
     VALUES ($1,$2,$3,'2025-01-01','2025-01-01','posted',$4,$5,
       '2025-01-01T09:00:00+03:00','2025-01-01T09:00:00+03:00')`,
    [
      openingId,
      `C14B-INV-${openingId.slice(0, 8)}`,
      `c14b-inv-${openingId}`,
      adminId,
      inventoryOpeningJournal,
    ],
  );
  await db.query(
    `INSERT INTO inventory_opening_lines
       (opening_id,variant_id,location_id,lot_id,quantity,unit_cost_iqd)
     VALUES ($1,$2,$3,$4,10,40)`,
    [openingId, variantId, locationId, batchId],
  );
  await db.query(
    `INSERT INTO batch_stock (batch_id,location_id,quantity,reserved)
     VALUES ($1,$2,7,0)`,
    [batchId, locationId],
  );
  await db.query(
    `INSERT INTO stock_movements
       (batch_id,type,to_location,quantity,reference,user_id,unit_cost_iqd,
        source_type,source_id,created_at)
     VALUES ($1,'receive',$2,10,'C14b opening',$3,40,
       'inventory_opening',$4,'2025-01-01T09:00:00+03:00')`,
    [batchId, locationId, adminId, openingId],
  );

  await db.query(
    `INSERT INTO orders
       (id,user_id,order_number,status,payment_method,subtotal,delivery_fee,
        original_delivery_fee,total,document_date,accounting_date,
        delivery_contact_phone,delivery_city,placed_at)
     VALUES ($1,$2,$3,'delivered','cod',500,0,0,500,'2025-01-15',
       '2025-01-15','+9647700014401','Baghdad','2025-01-15T10:00:00+03:00')`,
    [orderId, customerId, `C14B-${orderId.slice(0, 8)}`],
  );
  await db.query(
    `INSERT INTO deliveries
       (id,order_id,agent_id,status,delivery_fee,currency_code,dispatched_at,delivered_at)
     VALUES ($1,$2,$3,'delivered',0,'IQD','2025-01-15T10:00:00+03:00',
       '2025-01-15T12:00:00+03:00')`,
    [deliveryId, orderId, partyId],
  );
  await db.query('UPDATE orders SET delivery_id=$1 WHERE id=$2', [
    deliveryId,
    orderId,
  ]);
  const deliveryJournal = await postEntry({
    sourceType: 'delivery_collection',
    sourceId: collectionId,
    event: 'delivered_full',
    date: '2025-01-15',
    description: 'C14b delivery collection',
    adminId,
    lines: [
      { code: '1020', debit: 500 },
      { code: '4000', credit: 500 },
    ],
  });
  await db.query(
    `INSERT INTO delivery_collections
       (id,delivery_id,order_id,party_id,status,due_amount,collected_amount,
        shortfall_amount,currency_code,delivered_operation_id,delivered_by,
        delivered_at,accounting_date,delivery_journal_entry_id,
        confirmed_operation_id,confirmed_by,confirmed_at)
     VALUES ($1,$2,$3,$4,'confirmed_full',500,500,0,'IQD',$5,$6,
       '2025-01-15T12:00:00+03:00','2025-01-15',$7,$8,$6,
       '2025-01-15T12:05:00+03:00')`,
    [
      collectionId,
      deliveryId,
      orderId,
      partyId,
      `c14b-deliver-${orderId}`,
      adminId,
      deliveryJournal,
      `c14b-confirm-${orderId}`,
    ],
  );
  await postEntry({
    sourceType: 'custody_issue',
    sourceId: orderId,
    event: 'issued_to_delivery',
    date: '2025-01-15',
    description: 'C14b goods custody',
    adminId,
    lines: [
      { code: '1010', debit: 120 },
      { code: '1000', credit: 120 },
    ],
  });
  await db.query(
    `INSERT INTO stock_movements
       (batch_id,type,from_location,quantity,reference,user_id,unit_cost_iqd,
        source_type,source_id,custody_party_id,created_at)
     VALUES ($1,'issue_to_custody',$2,3,'C14b custody issue',$3,40,
       'order',$4,$5,'2025-01-15T10:00:00+03:00')`,
    [batchId, locationId, adminId, orderId, partyId],
  );

  const receiptJournal = await postEntry({
    sourceType: 'cash_receipt',
    sourceId: receiptId,
    event: 'cash_received',
    date: '2025-01-20',
    description: 'C14b unallocated receipt',
    adminId,
    lines: [
      { code: `C14B-CASH-${cashLedgerId.slice(0, 8)}`, debit: 50 },
      { code: '1020', credit: 50 },
    ],
  });
  await db.query(
    `INSERT INTO cash_receipt_vouchers
       (id,document_number,operation_id,party_id,cash_account_id,amount_iqd,
        document_date,accounting_date,created_by,journal_entry_id,created_at)
     VALUES ($1,$2,$3,$4,$5,50,'2025-01-20','2025-01-20',$6,$7,
       '2025-01-20T12:00:00+03:00')`,
    [
      receiptId,
      `C14B-CRV-${receiptId.slice(0, 8)}`,
      `c14b-crv-${receiptId}`,
      partyId,
      cashAccountId,
      adminId,
      receiptJournal,
    ],
  );

  await db.query(
    `INSERT INTO suppliers (id,name,default_currency,is_active)
     VALUES ($1,'C14b Supplier','IQD',true)`,
    [supplierId],
  );
  const supplierJournal = await postEntry({
    sourceType: 'supplier_opening',
    sourceId: supplierEntryId,
    event: 'supplier_payable',
    date: '2025-01-10',
    description: 'C14b supplier payable',
    adminId,
    lines: [
      { code: '5100', debit: 300 },
      { code: '2000', credit: 300 },
    ],
  });
  void supplierJournal;
  await db.query(
    `INSERT INTO supplier_account_entries
       (id,supplier_id,source_type,source_id,document_number,document_date,
        accounting_date,due_date,currency_code,credit_currency,credit_iqd)
     VALUES ($1,$2,'acceptance',$1,$3,'2025-01-10','2025-01-10',
       '2025-01-18','IQD',300,300)`,
    [supplierEntryId, supplierId, `C14B-SUP-${supplierEntryId.slice(0, 8)}`],
  );

  const expenseJournal = await postEntry({
    sourceType: 'expense',
    sourceId: expenseId,
    event: 'posted',
    date: '2025-01-12',
    description: 'C14b accrued expense',
    adminId,
    lines: [
      { code: '5100', debit: 200 },
      { code: '2040', credit: 200 },
    ],
  });
  await db.query(
    `INSERT INTO expenses
       (id,document_number,status,category_id,amount_currency,currency_code,
        exchange_rate,amount_iqd,paid_currency,balance_currency,payment_mode,
        payee,description,document_date,accounting_date,created_by,posted_by,
        posted_at,journal_entry_id)
     VALUES ($1,$2,'posted',$3,200,'IQD',1,200,0,200,'owed',
       'C14b Landlord','C14b accrued expense','2025-01-12','2025-01-12',
       $4,$4,'2025-01-12T12:00:00+03:00',$5)`,
    [
      expenseId,
      `C14B-EXP-${expenseId.slice(0, 8)}`,
      categoryId,
      adminId,
      expenseJournal,
    ],
  );

  const refundJournal = await postEntry({
    sourceType: 'return',
    sourceId: returnId,
    event: 'refund_obligation',
    date: '2025-01-22',
    description: 'C14b customer refund owed',
    adminId,
    lines: [
      { code: '4100', debit: 100 },
      { code: '2030', credit: 100 },
    ],
  });
  await db.query(
    `INSERT INTO returns
       (id,document_number,order_id,user_id,created_by,source,type,status,reason,
        expected_refund,refund_amount,cash_refund_amount,document_date,
        accounting_date,reviewed_by,reviewed_at)
     VALUES ($1,$2,$3,$4,$5,'staff','return','inspected','C14b refund',
       100,100,100,'2025-01-22','2025-01-22',$5,
       '2025-01-22T12:00:00+03:00')`,
    [
      returnId,
      `C14B-RET-${returnId.slice(0, 8)}`,
      orderId,
      customerId,
      adminId,
    ],
  );
  await db.query(
    `INSERT INTO return_postings (return_id,role,journal_entry_id)
     VALUES ($1,'refund_obligation',$2)`,
    [returnId, refundJournal],
  );
  const loyaltyAccount = await db.query(
    `INSERT INTO loyalty_accounts (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id`,
    [customerId],
  );
  await db.query(
    `INSERT INTO loyalty_ledger
       (account_id,order_id,type,reason,points,created_by,created_at)
     VALUES ($1,$2,'earn','c14b_acceptance',25,$3,'2025-01-25T12:00:00+03:00')`,
    [loyaltyAccount.rows[0].id, orderId, adminId],
  );
  await db.query('COMMIT');
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
}

await db.query(
  `INSERT INTO user_permission_grants (user_id,permission_id,granted_by,reason)
   SELECT $1,p.id,$2,'C14b acceptance restricted report reader'
   FROM permissions p WHERE p.key = ANY($3::text[])
   ON CONFLICT DO NOTHING`,
  [
    operationsId,
    adminId,
    [
      'reports.cash.read',
      'reports.liabilities.read',
      'reports.inventory.read',
      'ledger.view',
      'cash_accounts.view',
      'inventory.view',
      'cost.view',
    ],
  ],
);
await db.query(
  'UPDATE users SET permission_version=permission_version+1 WHERE id=$1',
  [operationsId],
);
const restrictedToken = await login('operations', 'Shubayr-Dev-Staff!2026');

const cash = await timed(
  '/admin/reports/cash?from=2025-01-10&to=2025-01-31&per_page=500',
  adminToken,
  2000,
);
check(cash.touches_open_period, true, 'cash range is marked as open');
const cashRow = cash.data.find((row) => row.cash_account.id === cashAccountId);
ok(cashRow, 'cash report contains every cash account, including the fixture');
check(
  cashRow.opening_balance,
  '1000.0000',
  'cash opening comes from prior posted ledger lines',
);
check(cashRow.inflows, '550.0000', 'cash inflows are exact');
check(cashRow.outflows, '200.0000', 'cash outflows are exact');
check(
  cashRow.closing_balance,
  '1350.0000',
  'cash closing equals opening plus movements',
);
check(
  cashRow.sources.customer_receipts.inflows,
  '550.0000',
  'customer receipts are classified',
);
check(
  cashRow.sources.expense_payments.outflows,
  '200.0000',
  'expense payments are classified',
);
const directCash = await db.query(
  `SELECT
     COALESCE(SUM(jl.debit_base-jl.credit_base) FILTER (WHERE je.accounting_date<'2025-01-10'),0)::text opening,
     COALESCE(SUM(jl.debit_base) FILTER (WHERE je.accounting_date BETWEEN '2025-01-10' AND '2025-01-31'),0)::text inflows,
     COALESCE(SUM(jl.credit_base) FILTER (WHERE je.accounting_date BETWEEN '2025-01-10' AND '2025-01-31'),0)::text outflows
   FROM cash_accounts ca JOIN journal_lines jl ON jl.account_id=ca.ledger_account_id
   JOIN journal_entries je ON je.id=jl.entry_id WHERE ca.id=$1`,
  [cashAccountId],
);
check(
  Number(cashRow.opening_balance),
  Number(directCash.rows[0].opening),
  'cash opening reconciles to ledger',
);
check(
  Number(cashRow.inflows),
  Number(directCash.rows[0].inflows),
  'cash inflows reconcile to ledger',
);
check(
  Number(cashRow.outflows),
  Number(directCash.rows[0].outflows),
  'cash outflows reconcile to ledger',
);

const custody = await timed(
  '/admin/reports/delivery-custody?as_of=2025-01-31&per_page=500',
  adminToken,
  2000,
);
check(
  custody.totals.goods_value,
  '120.0000',
  'custody goods use original issue cost',
);
check(
  custody.totals.goods_ledger_balance,
  '120.0000',
  'goods custody ledger is exact',
);
check(custody.totals.goods_reconciled, true, 'goods custody reconciles');
check(
  custody.totals.cash_held,
  '450.0000',
  'receipt reduces delivery cash held',
);
check(
  custody.totals.cash_ledger_balance,
  '450.0000',
  'cash custody ledger is exact',
);
check(custody.totals.cash_reconciled, true, 'delivery cash custody reconciles');
const party = custody.data.find((row) => row.party.id === partyId);
check(
  party.goods_quantity,
  '3.000',
  'custody quantity is reported per delivery party',
);
check(
  party.cash_held,
  '450.0000',
  'custody cash is reported per delivery party',
);
ok(
  party.oldest_goods_age_days > 0 && party.oldest_cash_age_days > 0,
  'custody ageing is present',
);

const liabilities = await timed(
  '/admin/reports/liabilities?as_of=2025-01-31&per_page=500',
  adminToken,
  2000,
);
check(
  liabilities.totals.supplier_payables,
  '300.0000',
  'supplier payable is exact',
);
check(
  liabilities.totals.supplier_reconciled,
  true,
  'supplier payable reconciles',
);
check(
  liabilities.totals.accrued_expenses,
  '200.0000',
  'accrued expense is exact',
);
check(
  liabilities.totals.expenses_reconciled,
  true,
  'accrued expense reconciles',
);
check(
  liabilities.totals.customer_refunds_owed,
  '100.0000',
  'customer refund owed is exact',
);
check(
  liabilities.totals.refunds_reconciled,
  true,
  'customer refund reconciles',
);
check(
  liabilities.totals.liability_ledger_total,
  '600.0000',
  'liability total equals liability accounts',
);
check(
  liabilities.totals.unallocated_customer_receipts,
  '50.0000',
  'unallocated receipt remainder is reported',
);
check(
  liabilities.totals.unallocated_receipts_ledger_valued,
  false,
  'unallocated cash is allocation state, not a second GL balance',
);
check(
  liabilities.totals.loyalty_points,
  '25',
  'outstanding loyalty points are counted',
);
check(
  liabilities.totals.loyalty_value_iqd,
  null,
  'no monetary loyalty value is invented without a GL account',
);
check(
  new Set(liabilities.data.map((row) => row.type)),
  new Set([
    'supplier_payable',
    'accrued_expense',
    'customer_refund',
    'unallocated_receipt',
  ]),
  'liability detail includes every required source',
);

const inventory = await timed(
  '/admin/reports/inventory-valuation?as_of=2025-01-31&slow_days=10&per_page=500',
  adminToken,
  2000,
);
check(
  inventory.totals.quantity,
  '7.000',
  'inventory quantity follows posted movements',
);
check(
  inventory.totals.value,
  '280.0000',
  'inventory valuation uses moving-average issue cost',
);
check(
  inventory.totals.inventory_ledger_balance,
  '280.0000',
  'inventory GL is exact',
);
check(
  inventory.totals.reconciled,
  true,
  'inventory valuation reconciles to account 1000',
);
const inventoryRow = inventory.data.find((row) => row.variant_id === variantId);
check(
  inventoryRow.quantity,
  '7.000',
  'SKU and warehouse detail has the remaining quantity',
);
check(
  inventoryRow.moving_average_cost,
  '40.0000',
  'SKU moving average cost is exact',
);
check(
  inventoryRow.slow_moving,
  true,
  'SKU with no sale in N days is slow moving',
);

const restrictedDashboard = await timed(
  '/admin/reports/dashboard',
  restrictedToken,
  300,
);
ok(
  restrictedDashboard.sales,
  'orders permission exposes launch dashboard sales',
);
ok(
  restrictedDashboard.cash_on_hand,
  'cash report permission exposes cash on hand',
);
ok(
  'low_stock_count' in restrictedDashboard,
  'inventory report permission exposes low stock count',
);
ok(
  'payables_due_next_7_days' in restrictedDashboard,
  'liability permission exposes upcoming payables',
);
check(
  'month_to_date_gross_profit' in restrictedDashboard.sales,
  false,
  'cost.view alone never exposes dashboard profit',
);
const adminDashboard = await timed('/admin/reports/dashboard', adminToken, 300);
ok(
  'month_to_date_gross_profit' in adminDashboard.sales,
  'reports.profit.read exposes dashboard gross profit',
);

const audits = await db.query(
  `SELECT after->>'report' report FROM audit_logs
   WHERE actor_id=$1 AND action='report.read' AND entity_type='report'`,
  [adminId],
);
const audited = new Set(audits.rows.map((row) => row.report));
check(
  audited.has('delivery_custody'),
  true,
  'cost-bearing custody read is audited',
);
check(
  audited.has('inventory_valuation'),
  true,
  'inventory valuation read is audited',
);

const queued = await request('/admin/reports/exports', {
  token: adminToken,
  method: 'POST',
  expected: 202,
  body: {
    report_type: 'cash',
    format: 'csv',
    language: 'ar',
    from: '2025-01-10',
    to: '2025-01-31',
  },
});
check('data' in queued, false, 'export creation returns progress only');
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
  `cash export completed: ${progress.last_error ?? ''}`,
);
check(
  progress.rows_done,
  progress.rows_total,
  'cash export progress completes exactly',
);
const csv = await request(`/admin/reports/exports/${queued.id}/download`, {
  token: adminToken,
});
check(
  [...csv.subarray(0, 3)],
  [0xef, 0xbb, 0xbf],
  'Arabic CSV has a UTF-8 BOM',
);
check(
  csv.toString('utf8').includes('حساب النقد'),
  true,
  'cash export uses Arabic headers',
);

await db.end();
console.log(`Reports part 2 acceptance assertions: ${assertions}`);
