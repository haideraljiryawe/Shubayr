import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  addBusinessDateDays,
  businessDate,
  businessDateText,
} from '../dist/src/modules/finance/business-date.js';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
)
  throw new Error(
    'Returns acceptance requires the runner-owned disposable database',
  );
if (!api || new URL(api).hostname !== '127.0.0.1')
  throw new Error('Returns acceptance requires the loopback API');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
}
function ok(value, message) {
  assert.ok(value, message);
  assertions++;
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
  return (
    await request('/auth/verify-otp', {
      method: 'POST',
      body: { phone, code: challenge.dev_otp },
      expected: 200,
    })
  ).access_token;
}
async function adminLogin() {
  return (
    await request('/admin/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
      expected: 201,
    })
  ).access_token;
}
async function operationsLogin() {
  return (
    await request('/admin/auth/login', {
      method: 'POST',
      body: {
        username: 'operations',
        password: 'Shubayr-Dev-Staff!2026',
      },
      expected: 201,
    })
  ).access_token;
}
async function scalar(sql, values = []) {
  const result = await db.query(sql, values);
  return result.rows[0]?.value;
}

const productId = '40000000-0000-4000-8000-000000000001';
const variantId = '50000000-0000-4000-8000-000000000001';
const batchId = '70000000-0000-4000-8000-000000000001';
const sellableLocation = '90000000-0000-4000-8000-000000000002';
const today = businessDate();
const todayText = businessDateText(today);

async function seedDeliveredOrder({
  customerId,
  adminId,
  partyId,
  productId: orderProductId = productId,
  variantId: orderVariantId = variantId,
  batchId: orderBatchId = batchId,
  quantity,
  wholeUnitsOnly,
  baseUnit,
  lineTotal,
  tierShare = 0,
  couponShare = 0,
  loyaltyShare = 0,
  netPaid,
  deliveryFee = 0,
  deliveredDate = today,
  collectedAmount,
  shortfallAmount = 0,
  earnedPoints = 0,
  redeemedPoints = 0,
}) {
  const orderId = randomUUID();
  const orderNumber = `C11-${orderId.slice(0, 8)}`;
  const itemId = randomUUID();
  const deliveryId = randomUUID();
  const total = Number(netPaid) + Number(deliveryFee);
  const issueCost = await scalar(
    'SELECT average_cost_iqd AS value FROM sku_costs WHERE variant_id=$1',
    [orderVariantId],
  );
  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO orders
       (id,user_id,order_number,status,payment_method,subtotal,delivery_fee,
        original_delivery_fee,discount,tier_discount,coupon_discount,total,
        loyalty_points_redeemed,loyalty_redemption_amount,
        delivery_contact_phone,delivery_city,document_date,accounting_date)
       VALUES ($1,$2,$3,'delivered','cod',$4,$5,$5,$6,$7,$8,$9,$10,$11,
               '+9647700000006','Baghdad',$12,$12)`,
      [
        orderId,
        customerId,
        orderNumber,
        lineTotal,
        deliveryFee,
        Number(tierShare) + Number(couponShare) + Number(loyaltyShare),
        tierShare,
        couponShare,
        total,
        redeemedPoints,
        loyaltyShare,
        deliveredDate,
      ],
    );
    await db.query(
      `INSERT INTO order_items
       (id,order_id,product_id,variant_id,product_name_ar,product_name_en,
        quantity,unit_price,line_total,discount_share,coupon_discount_share,
        tier_discount_share,loyalty_discount_share,net_line_total,net_paid_total,
        base_unit,whole_units_only)
       VALUES ($1,$2,$3,$4,'منتج اختبار','Test product',$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14)`,
      [
        itemId,
        orderId,
        orderProductId,
        orderVariantId,
        quantity,
        Number(lineTotal) / Number(quantity),
        lineTotal,
        Number(tierShare) + Number(couponShare) + Number(loyaltyShare),
        couponShare,
        tierShare,
        loyaltyShare,
        netPaid,
        baseUnit,
        wholeUnitsOnly,
      ],
    );
    await db.query(
      `INSERT INTO deliveries
       (id,order_id,agent_id,status,delivery_fee,dispatched_at,delivered_at)
       VALUES ($1,$2,$3,'delivered',$4,$5,$5)`,
      [deliveryId, orderId, partyId, deliveryFee, deliveredDate],
    );
    await db.query('UPDATE orders SET delivery_id=$1 WHERE id=$2', [
      deliveryId,
      orderId,
    ]);
    await db.query(
      `INSERT INTO stock_reservations
       (order_id,order_item_id,batch_id,location_id,quantity,status,consumed_at,issue_cost_iqd)
       VALUES ($1,$2,$3,$4,$5,'consumed',now(),$6)`,
      [orderId, itemId, orderBatchId, sellableLocation, quantity, issueCost],
    );
    await db.query(
      `INSERT INTO custody_holdings
       (order_id,order_item_id,delivery_id,custody_party_id,batch_id,quantity,
        remaining_quantity,unit_cost_iqd,status,settled_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,'sold',now())`,
      [orderId, itemId, deliveryId, partyId, orderBatchId, quantity, issueCost],
    );
    if (collectedAmount === undefined) {
      await db.query(
        `INSERT INTO payments
         (order_id,method,status,amount,document_date,accounting_date,paid_at)
         VALUES ($1,'cod','paid',$2,$3,$3,now())`,
        [orderId, total, deliveredDate],
      );
    } else {
      const journalId = randomUUID();
      await db.query(
        `INSERT INTO journal_entries
         (id,document_number,source_type,source_id,event,document_date,
          accounting_date,description,created_by)
         VALUES ($1,$2,'acceptance_delivery',$3,'delivered',$4,$4,'C11 fixture',$5)`,
        [
          journalId,
          `JRN-C11-${journalId.slice(0, 8)}`,
          orderId,
          deliveredDate,
          adminId,
        ],
      );
      await db.query(
        `INSERT INTO delivery_collections
         (delivery_id,order_id,party_id,status,due_amount,collected_amount,
          shortfall_amount,delivered_operation_id,delivered_by,delivered_at,
          accounting_date,delivery_journal_entry_id)
         VALUES ($1,$2,$3,'confirmed_short',$4,$5,$6,$7,$8,now(),$9,$10)`,
        [
          deliveryId,
          orderId,
          partyId,
          total,
          collectedAmount,
          shortfallAmount,
          `c11-deliver-${orderId}`,
          adminId,
          deliveredDate,
          journalId,
        ],
      );
    }
    if (earnedPoints || redeemedPoints) {
      const accountId = await scalar(
        `INSERT INTO loyalty_accounts (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id
         RETURNING id AS value`,
        [customerId],
      );
      if (earnedPoints)
        await db.query(
          `INSERT INTO loyalty_ledger
           (account_id,order_id,type,reason,points,created_by)
           VALUES ($1,$2,'earn','c11_order_earn',$3,$4)`,
          [accountId, orderId, earnedPoints, adminId],
        );
      if (redeemedPoints)
        await db.query(
          `INSERT INTO loyalty_ledger
           (account_id,order_id,type,reason,points,created_by)
           VALUES ($1,$2,'redeem','c11_order_redeem',$3,$4)`,
          [accountId, orderId, -redeemedPoints, adminId],
        );
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  return {
    orderId,
    orderNumber,
    itemId,
    deliveryId,
    issueCost: Number(issueCost),
  };
}

function financial(operationId, extra = {}) {
  return { operation_id: operationId, document_date: todayText, ...extra };
}
async function openReturn(
  token,
  order,
  quantity,
  reasonCode = 'defect',
  expected = 201,
  operationId = randomUUID(),
) {
  return request('/returns', {
    token,
    method: 'POST',
    expected,
    body: {
      operation_id: operationId,
      order_id: order.orderId,
      items: [
        {
          order_item_id: order.itemId,
          quantity,
          reason_code: reasonCode,
          reason: 'Acceptance return reason',
        },
      ],
    },
  });
}
async function approve(admin, ret, quantity) {
  return request(`/returns/${ret.id}/approve`, {
    token: admin,
    method: 'POST',
    body: financial(randomUUID(), {
      decision: 'approve',
      items: [{ return_item_id: ret.items[0].id, approved_quantity: quantity }],
    }),
  });
}
async function receive(admin, ret) {
  return request(`/returns/${ret.id}/receive`, {
    token: admin,
    method: 'POST',
    body: financial(randomUUID()),
  });
}
async function inspect(admin, ret, condition, locationId) {
  return request(`/returns/${ret.id}/inspect`, {
    token: admin,
    method: 'POST',
    body: financial(randomUUID(), {
      items: [
        { return_item_id: ret.items[0].id, condition, location_id: locationId },
      ],
    }),
  });
}

try {
  const customer = await login('+9647700000006');
  const other = await login('+9647700099977');
  const admin = await adminLogin();
  const operations = await operationsLogin();
  const customerId = await scalar(
    "SELECT id AS value FROM users WHERE phone='+9647700000006'",
  );
  const adminId = await scalar(
    "SELECT id AS value FROM users WHERE username='admin'",
  );
  const partyId = await scalar(
    'SELECT id AS value FROM delivery_parties WHERE is_active=true ORDER BY id LIMIT 1',
  );
  const cashLedgerId = randomUUID();
  const cashAccountId = randomUUID();
  const cashLedgerCode = `1051-${cashLedgerId.slice(0, 8)}`;
  await db.query(
    `INSERT INTO ledger_accounts
       (id, code, name_ar, name_en, type, normal_side, is_system, enabled)
     VALUES ($1, $2, 'صندوق اختبار المرتجعات', 'Returns acceptance cash', 'asset', 'debit', false, true)`,
    [cashLedgerId, cashLedgerCode],
  );
  await db.query(
    `INSERT INTO cash_accounts
       (id, name, kind, currency_code, ledger_account_id, is_active)
     VALUES ($1, 'Returns acceptance cash', 'cash', 'IQD', $2, true)`,
    [cashAccountId, cashLedgerId],
  );
  const warehouseId = await scalar(
    'SELECT warehouse_id AS value FROM warehouse_locations WHERE id=$1',
    [sellableLocation],
  );
  const damagedLocation = randomUUID();
  await db.query(
    `INSERT INTO warehouse_locations
     (id,warehouse_id,zone,code,description,is_sellable,is_active)
     VALUES ($1,$2,$3,$4,'C11 damaged returns',false,true)`,
    [
      damagedLocation,
      warehouseId,
      `C11-${damagedLocation.slice(0, 6)}`,
      `C11-DMG-${damagedLocation.slice(0, 6)}`,
    ],
  );

  const piece = await seedDeliveredOrder({
    customerId,
    adminId,
    partyId,
    quantity: 3,
    wholeUnitsOnly: true,
    baseUnit: 'piece',
    lineTotal: 30000,
    tierShare: 3000,
    loyaltyShare: 3000,
    netPaid: 24000,
    earnedPoints: 30,
    redeemedPoints: 9,
  });
  await openReturn(customer, piece, 2.5, 'defect', 422);
  await openReturn(customer, piece, 4, 'defect', 422);
  const refusedOrder = await seedDeliveredOrder({
    customerId,
    adminId,
    partyId,
    quantity: 3,
    wholeUnitsOnly: true,
    baseUnit: 'piece',
    lineTotal: 3000,
    netPaid: 3000,
  });
  const refusedHoldingId = await scalar(
    'SELECT id AS value FROM custody_holdings WHERE order_item_id=$1',
    [refusedOrder.itemId],
  );
  const refusedExceptionId = randomUUID();
  await db.query(
    `INSERT INTO custody_exceptions
     (id,document_number,operation_id,type,party_id,order_id,reason,
      document_date,accounting_date,created_by)
     VALUES ($1,$2,$3,'return_against_uncollected',$4,$5,
             'One unit refused at delivery',$6,$6,$7)`,
    [
      refusedExceptionId,
      `CEX-C11-${refusedExceptionId.slice(0, 8)}`,
      `c11-refused-${refusedExceptionId}`,
      partyId,
      refusedOrder.orderId,
      today,
      adminId,
    ],
  );
  await db.query(
    `INSERT INTO custody_exception_lines
     (exception_id,custody_holding_id,order_item_id,batch_id,location_id,
      quantity,unit_cost_iqd,return_amount_iqd)
     VALUES ($1,$2,$3,$4,$5,1,$6,1000)`,
    [
      refusedExceptionId,
      refusedHoldingId,
      refusedOrder.itemId,
      batchId,
      sellableLocation,
      refusedOrder.issueCost,
    ],
  );
  await openReturn(customer, refusedOrder, 3, 'defect', 422);
  const createOperation = randomUUID();
  const first = await openReturn(
    customer,
    piece,
    1,
    'defect',
    201,
    createOperation,
  );
  const replay = await openReturn(
    customer,
    piece,
    1,
    'defect',
    201,
    createOperation,
  );
  check(replay.id, first.id, 'request replay returns the same return');
  check(first.expected_refund, 8000, 'one piece uses its exact net-paid share');
  check(
    first.items[0].discount_share,
    2000,
    'tier and loyalty allocations stay in the share',
  );
  await request(`/returns/${first.id}`, { token: other, expected: 404 });
  await request(`/returns/${first.id}/approve`, {
    token: customer,
    method: 'POST',
    expected: 403,
    body: financial(randomUUID(), { decision: 'reject', note: 'Not allowed' }),
  });
  const approved = await approve(admin, first, 1);
  check(
    approved.items[0].approved_refund,
    8000,
    'approval never recomputes current price',
  );
  await receive(admin, approved);
  const inspected = await inspect(
    admin,
    approved,
    'sellable',
    sellableLocation,
  );
  check(
    inspected.refund_amount,
    8000,
    'inspection creates the exact refund obligation',
  );
  const refundOperation = randomUUID();
  const refunded = await request(`/returns/${first.id}/refund`, {
    token: admin,
    method: 'POST',
    body: financial(refundOperation, {
      method: 'cash_account',
      cash_account_id: cashAccountId,
    }),
  });
  const refundReplay = await request(`/returns/${first.id}/refund`, {
    token: admin,
    method: 'POST',
    body: financial(refundOperation, {
      method: 'cash_account',
      cash_account_id: cashAccountId,
    }),
  });
  check(refundReplay.id, refunded.id, 'refund replay is idempotent');
  check(refunded.status, 'refunded', 'cash refund completes the return');
  check(
    refunded.points_effect,
    { earned_reversed: 10, redeemed_restored: 3, net: -7 },
    'points follow the returned paid share',
  );
  check(
    refunded.refund_payments[0].amount_iqd,
    8000,
    'cash payment equals the obligation',
  );
  check(
    Number(
      await scalar(
        'SELECT count(*)::int AS value FROM return_refund_payments WHERE return_id=$1',
        [first.id],
      ),
    ),
    1,
    'refund replay creates one payment',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM stock_movements WHERE return_item_id=$1 AND type='return_in'",
        [first.items[0].id],
      ),
    ),
    1,
    'sellable stock returns once',
  );

  const orderDetail = await request(`/orders/${piece.orderId}`, {
    token: customer,
  });
  check(
    orderDetail.returns[0].points_effect.net,
    -7,
    'order detail includes return points effect',
  );
  const queue = await request(
    `/returns/queue?status=refunded&order_id=${piece.orderId}`,
    { token: admin },
  );
  check(queue.total, 1, 'staff filters returns by state and order');
  check(queue.data[0].customer_phone, '+9647700000006', 'queue shows phone');
  ok(queue.data[0].customer_name, 'queue shows customer display name');
  const phoneQueue = await request(
    `/returns/queue?customer_phone=${encodeURIComponent('+9647700000006')}`,
    { token: operations },
  );
  check(
    phoneQueue.data.some((row) => row.id === first.id),
    true,
    'returns queue filters by customer phone',
  );
  const orderQueue = await request(
    `/returns/queue?order_number=${encodeURIComponent(piece.orderNumber)}`,
    { token: operations },
  );
  check(
    orderQueue.data.some((row) => row.id === first.id),
    true,
    'returns queue filters by order number without orders permission',
  );
  const adminReturn = await request(`/returns/queue/${first.id}`, {
    token: admin,
  });
  check(
    'original_issue_cost' in adminReturn.items[0],
    true,
    'cost viewers see the original issue cost',
  );
  const operationsReturn = await request(`/returns/queue/${first.id}`, {
    token: operations,
  });
  check(
    'original_issue_cost' in operationsReturn.items[0],
    false,
    'staff without cost.view cannot see original issue cost',
  );
  check(
    operationsReturn.events.every(
      (event) => event.actor_display_name && event.actor_role,
    ),
    true,
    'staff timeline entries name the actor and role',
  );
  check(
    operationsReturn.events.some((event) => 'phone' in event),
    false,
    'staff timeline never exposes actor phones',
  );
  const customerReturn = await request(`/returns/${first.id}`, {
    token: customer,
  });
  check(
    customerReturn.events.every(
      (event) =>
        ['you', 'store'].includes(event.actor_display_name) &&
        event.actor_role === null,
    ),
    true,
    'customer timeline identifies only you or store',
  );
  const refundAccounts = await request('/returns/refund-cash-accounts', {
    token: operations,
  });
  check(
    refundAccounts.some((account) => account.id === cashAccountId),
    true,
    'returns.refund lists eligible cash accounts without cash_accounts.view',
  );
  check(
    refundAccounts.some((account) => 'balance' in account),
    false,
    'refund cash account choices never include balances',
  );

  const feeOrder = await seedDeliveredOrder({
    customerId,
    adminId,
    partyId,
    quantity: 1,
    wholeUnitsOnly: true,
    baseUnit: 'piece',
    lineTotal: 1000,
    netPaid: 1000,
    deliveryFee: 5000,
  });
  const feeReturn = await openReturn(customer, feeOrder, 1, 'defect');
  const feePreview = await request(
    `/returns/${feeReturn.id}/delivery-fee-preview`,
    {
      token: operations,
      method: 'POST',
      body: {
        items: [
          {
            return_item_id: feeReturn.items[0].id,
            approved_quantity: 1,
          },
        ],
      },
    },
  );
  check(
    feePreview.refund_delivery_fee,
    true,
    'full store-fault return refunds fee',
  );
  check(feePreview.amount, 5000, 'fee preview uses the charged delivery fee');
  const feeApproved = await approve(admin, feeReturn, 1);
  check(
    feeApproved.delivery_fee_refund,
    feePreview.amount,
    'approval applies exactly the previewed delivery-fee policy outcome',
  );

  const weightVariantId = randomUUID();
  const weightBatchId = randomUUID();
  await db.query(
    `INSERT INTO product_variants
       (id, product_id, sku, base_unit, whole_units_only, selling_price,
        published_price, price_approved_at)
     VALUES ($1, $2, $3, 'kg', false, 10000, 10000, now())`,
    [weightVariantId, productId, `C11-WEIGHT-${weightVariantId.slice(0, 8)}`],
  );
  await db.query(
    `INSERT INTO inventory_batches
       (id, product_id, variant_id, purchase_cost, qty_received)
     VALUES ($1, $2, $3, 4000, 100)`,
    [weightBatchId, productId, weightVariantId],
  );
  await db.query(
    `INSERT INTO batch_stock (batch_id, location_id, quantity, reserved)
     VALUES ($1, $2, 100, 0)`,
    [weightBatchId, sellableLocation],
  );
  await db.query(
    `INSERT INTO sku_costs
       (variant_id, book_quantity, book_value_iqd, average_cost_iqd,
        last_landed_cost_iqd)
     VALUES ($1, 100, 400000, 4000, 4000)`,
    [weightVariantId],
  );
  const weight = await seedDeliveredOrder({
    customerId,
    adminId,
    partyId,
    variantId: weightVariantId,
    batchId: weightBatchId,
    quantity: 1.5,
    wholeUnitsOnly: false,
    baseUnit: 'kg',
    lineTotal: 15000,
    tierShare: 3000,
    netPaid: 12000,
  });
  const weightReturn = await openReturn(customer, weight, 0.25);
  check(
    weightReturn.expected_refund,
    2000,
    'weight partial return uses exact quanta share',
  );
  await approve(admin, weightReturn, 0.25);
  await receive(admin, weightReturn);
  const damaged = await inspect(
    admin,
    weightReturn,
    'damaged',
    damagedLocation,
  );
  check(
    damaged.items[0].approved_quantity,
    0.25,
    'weight approval keeps three decimals',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM stock_movements WHERE return_item_id=$1 AND type='return_in'",
        [weightReturn.items[0].id],
      ),
    ),
    1,
    'damaged goods are first received',
  );
  check(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM stock_movements WHERE return_item_id=$1 AND type='write_down'",
        [weightReturn.items[0].id],
      ),
    ),
    1,
    'damaged goods are written down',
  );
  check(
    Number(
      await scalar(
        'SELECT quantity AS value FROM batch_stock WHERE batch_id=$1 AND location_id=$2',
        [weightBatchId, damagedLocation],
      ),
    ),
    0,
    'non-sellable stock is cleared by write-down',
  );

  const expiredOrder = await seedDeliveredOrder({
    customerId,
    adminId,
    partyId,
    quantity: 1,
    wholeUnitsOnly: true,
    baseUnit: 'piece',
    lineTotal: 1000,
    netPaid: 1000,
    deliveredDate: addBusinessDateDays(today, -15),
  });
  await openReturn(customer, expiredOrder, 1, 'defect', 409);

  const staffOrder = await seedDeliveredOrder({
    customerId,
    adminId,
    partyId,
    quantity: 1,
    wholeUnitsOnly: true,
    baseUnit: 'piece',
    lineTotal: 1000,
    netPaid: 1000,
  });
  const staffReturn = await request('/returns/staff', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: randomUUID(),
      customer_id: customerId,
      order_id: staffOrder.orderId,
      items: [
        {
          order_item_id: staffOrder.itemId,
          quantity: 1,
          reason_code: 'defect',
          reason: 'Staff-assisted return',
        },
      ],
    },
  });
  await request(`/returns/${staffReturn.id}/approve`, {
    token: admin,
    method: 'POST',
    expected: 403,
    body: financial(randomUUID(), {
      decision: 'approve',
      items: [
        { return_item_id: staffReturn.items[0].id, approved_quantity: 1 },
      ],
    }),
  });

  const custody = await seedDeliveredOrder({
    customerId,
    adminId,
    partyId,
    quantity: 1,
    wholeUnitsOnly: true,
    baseUnit: 'piece',
    lineTotal: 9000,
    netPaid: 9000,
    deliveryFee: 5000,
    collectedAmount: 8000,
    shortfallAmount: 6000,
  });
  const custodyReturn = await openReturn(
    customer,
    custody,
    1,
    'change_of_mind',
  );
  await approve(admin, custodyReturn, 1);
  await receive(admin, custodyReturn);
  const custodyInspected = await inspect(
    admin,
    custodyReturn,
    'sellable',
    sellableLocation,
  );
  check(
    custodyInspected.uncollected_offset,
    6000,
    'uncollected cash is offset first',
  );
  check(
    custodyInspected.cash_refund_amount,
    3000,
    'only paid cash remains refundable',
  );
  const collectionId = await scalar(
    'SELECT id AS value FROM delivery_collections WHERE order_id=$1',
    [custody.orderId],
  );
  const custodyRefund = await request(`/returns/${custodyReturn.id}/refund`, {
    token: admin,
    method: 'POST',
    body: financial(randomUUID(), {
      method: 'delivery_custody',
      collection_id: collectionId,
      proof_reference: 'SIGNED-C11-CUSTODY-REFUND',
    }),
  });
  check(
    custodyRefund.refund_payments[0].amount_iqd,
    3000,
    'custody payment is the net cash refund',
  );

  const unbalanced = await db.query(
    `SELECT je.id FROM journal_entries je
     JOIN journal_lines jl ON jl.entry_id=je.id
     WHERE je.source_type='return' AND je.source_id IN ($1,$2,$3)
     GROUP BY je.id HAVING sum(jl.debit_base)<>sum(jl.credit_base)`,
    [first.id, weightReturn.id, custodyReturn.id],
  );
  check(unbalanced.rowCount, 0, 'return GL has no unbalanced document');
  check(
    Number(
      await scalar(
        'SELECT coalesce(sum(points),0)::int AS value FROM loyalty_ledger WHERE order_id=$1',
        [piece.orderId],
      ),
    ),
    14,
    'loyalty ledger reconciles after reversal and restoration',
  );
  ok(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM audit_logs WHERE entity_type='return' AND entity_id IN ($1,$2,$3,$4)",
        [first.id, weightReturn.id, staffReturn.id, custodyReturn.id],
      ),
    ) > 0,
    'return lifecycle is audited',
  );
  ok(
    Number(
      await scalar(
        "SELECT count(*)::int AS value FROM notification_events WHERE entity_type='return' AND entity_id=$1",
        [first.id],
      ),
    ) >= 3,
    'approval and refund use the normal notification pipeline',
  );

  console.log(
    `Returns v2 acceptance: ${assertions} assertions passed (disposable database)`,
  );
} finally {
  await db.end();
}
