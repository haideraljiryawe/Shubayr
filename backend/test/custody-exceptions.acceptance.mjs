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
    'Custody-exception acceptance requires an isolated *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Custody-exception acceptance requires the runner-owned API');
}

let assertions = 0;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function ledgerAmount(value) {
  return Number(Number(value).toFixed(4));
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

async function scalar(sql, values = []) {
  return (await db.query(sql, values)).rows[0].value;
}

const admin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
});
const adminToken = admin.access_token;
const adminId = admin.user.id;
const operationsId = await scalar(
  "SELECT id::text AS value FROM users WHERE username='operations'",
);
await db.query(
  `INSERT INTO user_presets (user_id,preset_id,assigned_by,reason)
   SELECT $1,preset.id,$2,'C7 acceptance cashier and exception duties'
   FROM permission_presets preset WHERE preset.name='cashier'
   ON CONFLICT (user_id,preset_id) DO UPDATE
   SET assigned_by=excluded.assigned_by,reason=excluded.reason`,
  [operationsId, adminId],
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
const internalParty = (
  await db.query(
    `SELECT id,user_id FROM delivery_parties
     WHERE kind='internal_agent' AND is_active
     ORDER BY id LIMIT 1`,
  )
).rows[0];
assert.ok(internalParty, 'seeded internal delivery party is required');
const externalParty = await request('/admin/external-drivers', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    name: 'C7 Exception Driver',
    phone: `+96479${Date.now()}`.slice(0, 16),
    vehicle_number: 'C7-EX',
  },
});
const till = await request('/admin/cash-accounts', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    name: `C7 Till ${randomUUID().slice(0, 8)}`,
    kind: 'cash',
    currency_code: 'IQD',
  },
});
const stock = (
  await db.query(`
    SELECT batch.id AS batch_id, batch.variant_id, variant.product_id,
           balance.location_id, cost.average_cost_iqd::numeric AS unit_cost
    FROM inventory_batches batch
    JOIN product_variants variant ON variant.id=batch.variant_id
    JOIN batch_stock balance ON balance.batch_id=batch.id
    JOIN sku_costs cost ON cost.variant_id=batch.variant_id
    WHERE balance.quantity-balance.reserved>10
      AND cost.book_quantity>10 AND cost.average_cost_iqd>0
    ORDER BY balance.quantity DESC, batch.id
    LIMIT 1`)
).rows[0];
assert.ok(stock, 'an inventory batch with enough available stock is required');
// Journal lines persist base amounts to four decimal places. Stabilize this
// synthetic issue fixture at the same precision so its inventory and ledger
// effects remain exactly comparable after earlier acceptance packs recost SKUs.
const unitCost = ledgerAmount(stock.unit_cost);
const today = baghdadDate();
const openingInventoryValue = Number(
  await scalar(
    'SELECT coalesce(sum(book_value_iqd),0)::numeric AS value FROM sku_costs',
  ),
);
const openingLedger1000 = Number(
  await scalar(
    `SELECT coalesce(sum(line.debit_base-line.credit_base),0)::numeric AS value
     FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
     WHERE account.code='1000'`,
  ),
);
const openingInventoryGap = ledgerAmount(
  openingInventoryValue - openingLedger1000,
);

async function custodyFixture(
  label,
  partyId,
  quantities,
  { deliveryFee = 5000, prices, handoverBy = adminId } = {},
) {
  const orderId = randomUUID();
  const deliveryId = randomUUID();
  const totalQuantity = quantities.reduce((sum, value) => sum + value, 0);
  const unitPrices = prices ?? quantities.map(() => 100000);
  const subtotal = quantities.reduce(
    (sum, quantity, index) => sum + quantity * unitPrices[index],
    0,
  );
  const entryId = randomUUID();
  const lines = quantities.map((quantity, index) => ({
    itemId: randomUUID(),
    holdingId: randomUUID(),
    quantity,
    unitPrice: unitPrices[index],
  }));
  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO orders
        (id,user_id,order_number,status,version,payment_method,subtotal,delivery_fee,discount,total,currency_code,document_date,accounting_date,delivery_contact_phone,delivery_city)
       VALUES ($1,$2,$3,'dispatched',2,'cod',$4,$5,0,$6,'IQD',$7,$7,'+9647700000006','Baghdad')`,
      [
        orderId,
        customerId,
        `VERIFY-C7-${label}-${orderId.slice(0, 8)}`,
        subtotal,
        deliveryFee,
        subtotal + deliveryFee,
        today,
      ],
    );
    await db.query(
      `INSERT INTO deliveries
        (id,order_id,agent_id,status,delivery_fee,currency_code,dispatched_at)
       VALUES ($1,$2,$3,'out_for_delivery',$4,'IQD',now())`,
      [deliveryId, orderId, partyId, deliveryFee],
    );
    await db.query('UPDATE orders SET delivery_id=$1 WHERE id=$2', [
      deliveryId,
      orderId,
    ]);
    for (const [index, line] of lines.entries()) {
      await db.query(
        `INSERT INTO order_items
          (id,order_id,product_id,variant_id,product_name_ar,product_name_en,quantity,unit_price,line_total,currency_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'IQD')`,
        [
          line.itemId,
          orderId,
          stock.product_id,
          stock.variant_id,
          `اختبار C7 ${index + 1}`,
          `C7 fixture ${index + 1}`,
          line.quantity,
          line.unitPrice,
          line.quantity * line.unitPrice,
        ],
      );
      await db.query(
        `INSERT INTO custody_holdings
          (id,order_id,order_item_id,delivery_id,custody_party_id,batch_id,quantity,remaining_quantity,unit_cost_iqd,status,issued_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,'in_custody',now())`,
        [
          line.holdingId,
          orderId,
          line.itemId,
          deliveryId,
          partyId,
          stock.batch_id,
          line.quantity,
          unitCost,
        ],
      );
      await db.query(
        `INSERT INTO stock_movements
          (batch_id,type,from_location,quantity,unit_cost_iqd,reference,source_type,source_id,custody_party_id,user_id)
         VALUES ($1,'issue_to_custody',$2,$3,$4,$5,'order',$6,$7,$8)`,
        [
          stock.batch_id,
          stock.location_id,
          line.quantity,
          unitCost,
          `C7 fixture ${label}`,
          orderId,
          partyId,
          handoverBy,
        ],
      );
    }
    await db.query(
      `UPDATE batch_stock SET quantity=quantity-$1
       WHERE batch_id=$2 AND location_id=$3`,
      [totalQuantity, stock.batch_id, stock.location_id],
    );
    await db.query(
      `UPDATE sku_costs
       SET book_quantity=book_quantity-$1,
           book_value_iqd=book_value_iqd-($1*$2),
           average_cost_iqd=CASE WHEN book_quantity-$1=0 THEN 0
             ELSE (book_value_iqd-($1*$2))/(book_quantity-$1) END,
           updated_at=now()
       WHERE variant_id=$3`,
      [totalQuantity, unitCost, stock.variant_id],
    );
    await db.query(
      `INSERT INTO journal_entries
        (id,document_number,source_type,source_id,event,document_date,accounting_date,description,created_by)
       VALUES ($1,$2,'order',$3,'issue_to_custody',$4,$4,'C7 fixture custody issue',$5)`,
      [entryId, `C7-ISS-${orderId.slice(0, 8)}`, orderId, today, handoverBy],
    );
    await db.query(
      `INSERT INTO journal_lines
        (entry_id,account_id,debit_base,credit_base,currency_code,original_amount,exchange_rate)
       SELECT $1,account.id,
              CASE WHEN account.code='1010' THEN $2::numeric ELSE 0 END,
              CASE WHEN account.code='1000' THEN $2::numeric ELSE 0 END,
              'IQD',$2::numeric,1
       FROM ledger_accounts account WHERE account.code IN ('1000','1010')`,
      [entryId, totalQuantity * unitCost],
    );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  return { orderId, deliveryId, subtotal, lines };
}

async function posting(exceptionId, role) {
  return (
    await db.query(
      `SELECT account.code,
              CASE WHEN line.debit_base>0 THEN 'debit' ELSE 'credit' END AS side,
              greatest(line.debit_base,line.credit_base)::numeric AS amount
       FROM custody_exception_postings posting
       JOIN journal_lines line ON line.entry_id=posting.journal_entry_id
       JOIN ledger_accounts account ON account.id=line.account_id
       WHERE posting.exception_id=$1 AND posting.role=$2
       ORDER BY account.code`,
      [exceptionId, role],
    )
  ).rows.map((row) => [row.code, row.side, Number(row.amount)]);
}

await db.query(
  "UPDATE store_settings SET value='standard' WHERE key='separation_of_duties_level'",
);

const multi = await custodyFixture('multi-loss', externalParty.id, [2, 1]);
const lossInput = {
  operation_id: `c7-loss-${randomUUID()}`,
  document_date: today,
  order_id: multi.orderId,
  liability_bearer: 'store',
  reason: 'One unit damaged and one unit lost in custody',
  lines: multi.lines.map((line) => ({
    custody_holding_id: line.holdingId,
    quantity: '1',
  })),
};
const storeLoss = await request('/admin/custody-exceptions/goods-loss', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: lossInput,
});
check(storeLoss.type, 'goods_loss', 'goods loss creates an exception document');
check(
  storeLoss.goods_cost_iqd,
  unitCost * 2,
  'loss is recorded at original issue cost',
);
check(
  await posting(storeLoss.id, 'liability_resolution'),
  [
    ['1040', 'credit', unitCost * 2],
    ['5020', 'debit', unitCost * 2],
  ],
  'store-borne loss exactly matches the phase-3 exception_loss map',
);
check(
  Number(
    await scalar(
      'SELECT sum(remaining_quantity)::numeric AS value FROM custody_holdings WHERE order_id=$1',
      [multi.orderId],
    ),
  ),
  1,
  'partial multi-line loss reduces custody once and leaves the untouched unit',
);
check(
  await scalar('SELECT status AS value FROM orders WHERE id=$1', [
    multi.orderId,
  ]),
  'failed',
  'partial loss follows the failed-order lifecycle',
);
const replayedLoss = await request('/admin/custody-exceptions/goods-loss', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: lossInput,
});
check(replayedLoss.id, storeLoss.id, 'operation replay returns one document');
await request('/admin/custody-exceptions/goods-loss', {
  token: adminToken,
  method: 'POST',
  expected: 409,
  body: { ...lossInput, reason: 'A conflicting replay payload' },
});

const lossList = await request(
  `/admin/custody-exceptions?type=goods_loss&party_id=${externalParty.id}&order_id=${multi.orderId}&date_from=${today}&date_to=${today}&status=active`,
  { token: adminToken },
);
check(lossList.total, 1, 'exception list filters return the active loss');
const noCostToken = operationsToken;
const redactedLoss = await request(
  `/admin/custody-exceptions/${storeLoss.id}`,
  { token: noCostToken },
);
check(
  Object.hasOwn(redactedLoss, 'goods_cost_iqd'),
  false,
  'exception totals hide original cost without cost.view',
);
check(
  Object.hasOwn(redactedLoss.lines[0], 'unit_cost_iqd'),
  false,
  'exception lines hide original unit cost without cost.view',
);
const selfReversal = await request(
  `/admin/custody-exceptions/${storeLoss.id}/reversal`,
  {
    token: adminToken,
    method: 'POST',
    expected: 403,
    body: {
      operation_id: `c7-self-reversal-${randomUUID()}`,
      reason: 'Creator must not reverse this document',
    },
  },
);
check(
  selfReversal.code,
  'SELF_REVERSAL_FORBIDDEN',
  'standard separation of duties refuses a creator reversal',
);
const lossReversalInput = {
  operation_id: `c7-loss-reversal-${randomUUID()}`,
  reason: 'Investigation found the missing goods',
};
const reversedStoreLoss = await request(
  `/admin/custody-exceptions/${storeLoss.id}/reversal`,
  {
    token: operationsToken,
    method: 'POST',
    expected: 201,
    body: lossReversalInput,
  },
);
check(reversedStoreLoss.status, 'reversed', 'loss correction is a reversal');
const replayedReversal = await request(
  `/admin/custody-exceptions/${storeLoss.id}/reversal`,
  {
    token: operationsToken,
    method: 'POST',
    expected: 201,
    body: lossReversalInput,
  },
);
check(
  replayedReversal.reversal.id,
  reversedStoreLoss.reversal.id,
  'reversal operation replay returns one reversal document',
);
check(
  Number(
    await scalar(
      'SELECT sum(remaining_quantity)::numeric AS value FROM custody_holdings WHERE order_id=$1',
      [multi.orderId],
    ),
  ),
  3,
  'loss reversal restores custody quantities',
);

const partyFixture = await custodyFixture('party-loss', internalParty.id, [1]);
const partyCashBefore = Number(
  (
    await request('/admin/delivery-parties/custody-overview?per_page=100', {
      token: adminToken,
    })
  ).data.find((row) => row.id === internalParty.id).custody_summary.cash_held,
);
const partyLoss = await request('/admin/custody-exceptions/goods-loss', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `c7-party-loss-${randomUUID()}`,
    document_date: today,
    order_id: partyFixture.orderId,
    liability_bearer: 'party',
    reason: 'Driver accepts liability for the missing parcel',
    lines: [
      {
        custody_holding_id: partyFixture.lines[0].holdingId,
        quantity: '1',
      },
    ],
  },
});
check(
  await posting(partyLoss.id, 'liability_resolution'),
  [
    ['1020', 'debit', unitCost],
    ['1040', 'credit', unitCost],
  ],
  'party-borne loss exactly matches the phase-3 exception_handover map',
);
const partyOverview = await request(
  '/admin/delivery-parties/custody-overview?per_page=100',
  { token: adminToken },
);
check(
  partyOverview.data.find((row) => row.id === internalParty.id).custody_summary
    .cash_held,
  partyCashBefore + unitCost,
  'party-borne loss becomes party cash custody',
);
const liabilityReceipt = await request('/admin/cash-receipts', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `c7-liability-receipt-${randomUUID()}`,
    document_date: today,
    party_id: internalParty.id,
    cash_account_id: till.id,
    amount_iqd: String(partyCashBefore + unitCost),
    reference: 'C7 party liability hand-in',
  },
});
await request(`/admin/custody-exceptions/${partyLoss.id}/reversal`, {
  token: operationsToken,
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `c7-consumed-liability-${randomUUID()}`,
    reason: 'Must reverse the consuming receipt first',
  },
});
await request(`/admin/cash-receipts/${liabilityReceipt.id}/reversal`, {
  token: operationsToken,
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `c7-liability-receipt-reversal-${randomUUID()}`,
    reason: 'Restore the liability before correcting the exception',
  },
});
await request(`/admin/custody-exceptions/${partyLoss.id}/reversal`, {
  token: operationsToken,
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `c7-party-loss-reversal-${randomUUID()}`,
    reason: 'Liability correction after receipt reversal',
  },
});

const returned = await custodyFixture('door-return', externalParty.id, [1], {
  prices: [100000],
});
await request(`/admin/deliveries/${returned.deliveryId}/status`, {
  token: adminToken,
  method: 'PATCH',
  body: {
    status: 'delivered',
    order_version: 2,
    operation_id: `c7-deliver-short-${randomUUID()}`,
    collection_confirmation: 'confirmed',
    collected_amount: '50000',
    source: 'C7 staff delivery',
  },
});
const collectionId = await scalar(
  'SELECT id::text AS value FROM delivery_collections WHERE order_id=$1',
  [returned.orderId],
);
const collectionReceipt = await request('/admin/cash-receipts', {
  token: adminToken,
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `c7-collected-receipt-${randomUUID()}`,
    document_date: today,
    party_id: externalParty.id,
    cash_account_id: till.id,
    amount_iqd: '50000',
    allocations: [{ order_id: returned.orderId, amount_iqd: '50000' }],
  },
});
const inventoryBeforeReturn = {
  stock: Number(
    await scalar(
      'SELECT quantity::numeric AS value FROM batch_stock WHERE batch_id=$1 AND location_id=$2',
      [stock.batch_id, stock.location_id],
    ),
  ),
  value: Number(
    await scalar(
      'SELECT book_value_iqd::numeric AS value FROM sku_costs WHERE variant_id=$1',
      [stock.variant_id],
    ),
  ),
  ledger: Number(
    await scalar(
      `SELECT coalesce(sum(line.debit_base-line.credit_base),0)::numeric AS value
       FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
       WHERE account.code='1000'`,
    ),
  ),
};
const doorReturn = await request(
  '/admin/custody-exceptions/return-against-uncollected',
  {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `c7-door-return-${randomUUID()}`,
      document_date: today,
      order_id: returned.orderId,
      reason: 'Customer returned the parcel at the door',
      lines: [
        {
          custody_holding_id: returned.lines[0].holdingId,
          location_id: stock.location_id,
          quantity: '1',
        },
      ],
    },
  },
);
check(
  await posting(doorReturn.id, 'return_value'),
  [
    ['1040', 'credit', 55000],
    ['2030', 'credit', 45000],
    ['4100', 'debit', 100000],
  ],
  'door return exactly matches the phase-3 return_against_uncollected map',
);
check(
  await scalar('SELECT status AS value FROM orders WHERE id=$1', [
    returned.orderId,
  ]),
  'returned',
  'a complete door return follows the returned lifecycle',
);
const inventoryAfterReturn = {
  stock: Number(
    await scalar(
      'SELECT quantity::numeric AS value FROM batch_stock WHERE batch_id=$1 AND location_id=$2',
      [stock.batch_id, stock.location_id],
    ),
  ),
  value: Number(
    await scalar(
      'SELECT book_value_iqd::numeric AS value FROM sku_costs WHERE variant_id=$1',
      [stock.variant_id],
    ),
  ),
  ledger: Number(
    await scalar(
      `SELECT coalesce(sum(line.debit_base-line.credit_base),0)::numeric AS value
       FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
       WHERE account.code='1000'`,
    ),
  ),
};
check(
  inventoryAfterReturn.stock - inventoryBeforeReturn.stock,
  1,
  'door return restores physical inventory',
);
check(
  [
    ledgerAmount(inventoryAfterReturn.value - inventoryBeforeReturn.value),
    ledgerAmount(inventoryAfterReturn.ledger - inventoryBeforeReturn.ledger),
  ],
  [unitCost, unitCost],
  'door return restores inventory value and account 1000 at original issue cost',
);
const feeRefund = await request(
  '/admin/custody-exceptions/delivery-fee-refund',
  {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `c7-fee-refund-${randomUUID()}`,
      document_date: today,
      order_id: returned.orderId,
      amount_iqd: '5000',
      settlement_method: 'cash_account',
      cash_account_id: till.id,
      reason: 'Refund delivery fee after the door return',
    },
  },
);
check(
  await posting(feeRefund.id, 'delivery_fee_refund'),
  [
    ['2030', 'credit', 5000],
    ['4110', 'debit', 5000],
  ],
  'fee refund exactly matches the phase-3 delivery_fee_refund map',
);
await request('/admin/custody-exceptions/delivery-fee-refund', {
  token: adminToken,
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `c7-fee-over-cap-${randomUUID()}`,
    document_date: today,
    order_id: returned.orderId,
    amount_iqd: '1',
    settlement_method: 'cash_account',
    cash_account_id: till.id,
    reason: 'Must exceed the already fully refunded fee',
  },
});
const collections = await request(
  `/admin/delivery-parties/${externalParty.id}/collections?order_id=${returned.orderId}`,
  { token: adminToken },
);
check(
  collections.data[0].id,
  collectionId,
  'collection read returns the order',
);
check(
  [
    collections.data[0].uncollected_amount_iqd,
    collections.data[0].allocated_amount_iqd,
    collections.data[0].settlement_status,
  ],
  [0, 50000, 'settled'],
  'return clears cash expectation without invalidating the settled receipt allocation',
);
check(
  collections.data[0].receipt_allocations[0].voucher_id,
  collectionReceipt.id,
  'already-receipted collected cash remains allocated to a real collected amount',
);
check(
  collections.data[0].exceptions.map((entry) => entry.type).sort(),
  ['delivery_fee_refund', 'return_against_uncollected'],
  'collection read exposes both active exception effects',
);

const statement = await request(
  `/admin/delivery-parties/${externalParty.id}/cash-activity?per_page=100`,
  { token: adminToken },
);
check(
  statement.data.some(
    (entry) => entry.voucher_document_number === doorReturn.document_number,
  ),
  true,
  'party statement retains the door-return exception',
);

const strictFixture = await custodyFixture(
  'strict-loss',
  externalParty.id,
  [1],
  { handoverBy: operationsId },
);
await db.query(
  "UPDATE store_settings SET value='strict' WHERE key='separation_of_duties_level'",
);
const strictError = await request('/admin/custody-exceptions/goods-loss', {
  token: operationsToken,
  method: 'POST',
  expected: 403,
  body: {
    operation_id: `c7-strict-${randomUUID()}`,
    document_date: today,
    order_id: strictFixture.orderId,
    liability_bearer: 'store',
    reason: 'Strict mode must require a different handover actor',
    lines: [
      {
        custody_holding_id: strictFixture.lines[0].holdingId,
        quantity: '1',
      },
    ],
  },
});
check(
  strictError.code,
  'SEPARATION_OF_DUTIES_VIOLATION',
  'strict separation refuses the handover actor',
);
await db.query(
  "UPDATE store_settings SET value='standard' WHERE key='separation_of_duties_level'",
);

const closedFixture = await custodyFixture(
  'closed-period',
  externalParty.id,
  [1],
);
const previous = new Date(`${today}T00:00:00.000Z`);
previous.setUTCMonth(previous.getUTCMonth() - 1, 1);
const closedMonth = previous.toISOString().slice(0, 7);
const closedDate = `${closedMonth}-15`;
await db.query(
  `INSERT INTO accounting_periods (month,status,closed_at,closed_by)
   VALUES ($1,'closed',now(),$2)
   ON CONFLICT (month) DO UPDATE
   SET status='closed',closed_at=now(),closed_by=excluded.closed_by`,
  [`${closedMonth}-01`, adminId],
);
const closedError = await request('/admin/custody-exceptions/goods-loss', {
  token: adminToken,
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `c7-closed-${randomUUID()}`,
    document_date: closedDate,
    accounting_date: closedDate,
    backdate_reason: 'Closed-period custody exception test',
    order_id: closedFixture.orderId,
    liability_bearer: 'store',
    reason: 'This posting must be refused in the closed period',
    lines: [
      {
        custody_holding_id: closedFixture.lines[0].holdingId,
        quantity: '1',
      },
    ],
  },
});
check(closedError.code, 'PERIOD_CLOSED', 'closed period is declared');
await db.query('DELETE FROM accounting_periods WHERE month=$1', [
  `${closedMonth}-01`,
]);

check(
  Number(
    await scalar(
      `SELECT count(*)::int AS value FROM audit_logs
       WHERE entity_type='custody_exception' AND entity_id=$1`,
      [doorReturn.id],
    ),
  ) >= 1,
  true,
  'exception creation is audited',
);
check(
  Number(
    await scalar(
      `SELECT count(*)::int AS value FROM audit_logs
       WHERE entity_type='custody_exception' AND entity_id=$1
         AND action='custody_exception.reverse'`,
      [storeLoss.id],
    ),
  ),
  1,
  'exception reversal is audited exactly once after replay',
);
const overview = await request(
  '/admin/delivery-parties/custody-overview?per_page=100',
  { token: adminToken },
);
const overviewGoods = overview.data.reduce(
  (sum, row) => sum + row.custody_summary.goods_value_iqd,
  0,
);
const overviewCash = overview.data.reduce(
  (sum, row) => sum + row.custody_summary.cash_held,
  0,
);
const ledger1010 = Number(
  await scalar(
    `SELECT coalesce(sum(line.debit_base-line.credit_base),0)::numeric AS value
     FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
     WHERE account.code='1010'`,
  ),
);
const ledger1020 = Number(
  await scalar(
    `SELECT coalesce(sum(line.debit_base-line.credit_base),0)::numeric AS value
     FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
     WHERE account.code='1020'`,
  ),
);
check(
  ledgerAmount(overviewGoods),
  ledgerAmount(ledger1010),
  'goods custody overview equals the goods-in-custody ledger balance',
);
check(
  ledgerAmount(overviewCash),
  ledgerAmount(ledger1020),
  'cash custody overview equals the cash-in-custody ledger balance',
);
const inventoryValue = Number(
  await scalar(
    'SELECT coalesce(sum(book_value_iqd),0)::numeric AS value FROM sku_costs',
  ),
);
const ledger1000 = Number(
  await scalar(
    `SELECT coalesce(sum(line.debit_base-line.credit_base),0)::numeric AS value
     FROM journal_lines line JOIN ledger_accounts account ON account.id=line.account_id
     WHERE account.code='1000'`,
  ),
);
check(
  ledgerAmount(inventoryValue - ledger1000),
  openingInventoryGap,
  'exceptions preserve the inventory-to-ledger reconciliation balance',
);

await db.end();
console.log(`custody exception acceptance assertions: ${assertions}`);
