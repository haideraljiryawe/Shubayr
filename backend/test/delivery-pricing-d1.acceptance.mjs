import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error('D1 acceptance requires a disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('D1 acceptance requires the runner-owned loopback API');
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function present(value, message) {
  assert.ok(value, message);
  assertions += 1;
  return value;
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
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

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

async function adminLogin(username, password) {
  return request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username, password },
  });
}

async function clearCart(token) {
  const cart = await request('/cart', { token });
  for (const item of cart.items) {
    await request(`/cart/items/${item.id}`, {
      token,
      method: 'DELETE',
      expected: 204,
    });
  }
  if (cart.coupon_code) {
    await request('/cart/coupon', { token, method: 'DELETE' });
  }
}

async function setSingleCartLine(token, product, variant, price) {
  await clearCart(token);
  await db.query(
    `UPDATE products SET price=$2, discount_type=NULL, discount_value=NULL,
       discount_starts_at=NULL, discount_ends_at=NULL, updated_at=now()
     WHERE id=$1`,
    [product.id, price - Number(variant.price_delta)],
  );
  return request('/cart/items', {
    token,
    method: 'POST',
    body: { product_id: product.id, variant_id: variant.id, quantity: 1 },
  });
}

async function createAddress(token, governorateId, label) {
  return request('/addresses', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      governorate_id: governorateId,
      label,
      city: label,
      area: 'D1 acceptance',
      street: 'Pricing test route',
      contact_phone: '+9647700888811',
    },
  });
}

async function place(token, addressId, label) {
  return request('/orders', {
    token,
    method: 'POST',
    expected: 201,
    headers: { 'Idempotency-Key': `d1-${label}-${randomUUID()}` },
    body: { address_id: addressId, payment_method: 'cod' },
  });
}

async function advance(order, statuses) {
  let current = order;
  for (const status of statuses) {
    current = await request(`/admin/orders/${order.id}/status`, {
      token: adminToken,
      method: 'PATCH',
      body: {
        status,
        version: current.version,
        ...(status === 'confirmed'
          ? {
              customer_contacted: true,
              customer_contact_note: 'Customer confirmed by phone for D1',
              below_cost_override_reason: 'D1 fixture price approval',
            }
          : {}),
      },
    });
  }
  return current;
}

let adminToken;
try {
  const admin = await adminLogin('admin', 'Shubayr-Dev-Admin!2026');
  adminToken = admin.access_token;
  const operations = await adminLogin('operations', 'Shubayr-Dev-Staff!2026');
  const agent = await appLogin('+9647700000005');
  const customer = await appLogin('+9647700888811');

  const governorates = await request('/governorates');
  check(governorates.length, 19, 'all 18 Iraqi governorates plus Halabja ship');
  const baghdad = present(
    governorates.find((entry) => entry.code === 'baghdad'),
    'Baghdad is seeded',
  );
  const basra = present(
    governorates.find((entry) => entry.code === 'basra'),
    'Basra is seeded',
  );
  const halabja = present(
    governorates.find((entry) => entry.code === 'halabja'),
    'Halabja is seeded',
  );
  check(
    [baghdad.name_en, baghdad.name_ar, halabja.name_en, halabja.name_ar],
    ['Baghdad', 'بغداد', 'Halabja', 'حلبجة'],
    'governorates expose Arabic and English names',
  );

  await request('/admin/delivery-zones', {
    token: operations.access_token,
    expected: 403,
  });
  const seededZones = await request('/admin/delivery-zones', {
    token: adminToken,
  });
  const developmentZone = present(
    seededZones.find((zone) => zone.name_en === 'All Iraq (development)'),
    'development seed provides an editable checkout zone',
  );
  const remainingGovernorates = governorates
    .filter((entry) => !['baghdad', 'basra', 'halabja'].includes(entry.code))
    .map((entry) => entry.id);
  await request(`/admin/delivery-zones/${developmentZone.id}`, {
    token: adminToken,
    method: 'PATCH',
    body: { governorate_ids: remainingGovernorates },
  });
  const baghdadZone = await request('/admin/delivery-zones', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      name_ar: 'منطقة بغداد',
      name_en: 'Baghdad zone',
      fee_iqd: 6000,
      governorate_ids: [baghdad.id],
    },
  });
  const basraZone = await request('/admin/delivery-zones', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      name_ar: 'منطقة البصرة',
      name_en: 'Basra zone',
      fee_iqd: 9000,
      governorate_ids: [basra.id],
    },
  });
  check(
    [baghdadZone.fee_iqd, basraZone.fee_iqd],
    [6000, 9000],
    'zones retain independent whole-IQD fees',
  );
  const pricedGovernorates = await request('/governorates');
  const pricedBaghdad = present(
    pricedGovernorates.find((entry) => entry.code === 'baghdad'),
    'public governorates retain Baghdad',
  );
  const pricedBasra = present(
    pricedGovernorates.find((entry) => entry.code === 'basra'),
    'public governorates retain Basra',
  );
  const pricedHalabja = present(
    pricedGovernorates.find((entry) => entry.code === 'halabja'),
    'public governorates retain Halabja',
  );
  check(
    [
      pricedBaghdad.is_served,
      pricedBaghdad.delivery_fee,
      pricedBaghdad.currency,
      pricedBasra.is_served,
      pricedBasra.delivery_fee,
      pricedHalabja.is_served,
      pricedHalabja.delivery_fee,
    ],
    [true, 6000, 'IQD', true, 9000, false, null],
    'guests can read each governorate fee and an explicit unserved state',
  );
  const duplicateZone = await request('/admin/delivery-zones', {
    token: adminToken,
    method: 'POST',
    expected: 409,
    body: {
      name_ar: 'تعارض',
      name_en: 'Conflict',
      fee_iqd: 1,
      governorate_ids: [baghdad.id, basra.id],
    },
  });
  check(
    duplicateZone.code,
    'GOVERNORATE_ALREADY_IN_DELIVERY_ZONE',
    'one governorate cannot be attached to two zones',
  );
  check(
    duplicateZone.errors.map((entry) => [
      entry.governorate_code,
      entry.delivery_zone_name_en,
    ]),
    [
      ['baghdad', 'Baghdad zone'],
      ['basra', 'Basra zone'],
    ],
    'zone conflicts name every clashing governorate and existing zone',
  );

  const baghdadAddress = await createAddress(
    customer.access_token,
    baghdad.id,
    'Baghdad',
  );
  const basraAddress = await createAddress(
    customer.access_token,
    basra.id,
    'Basra',
  );
  const halabjaAddress = await createAddress(
    customer.access_token,
    halabja.id,
    'Halabja',
  );
  const legacyAddressId = randomUUID();
  await db.query(
    `INSERT INTO addresses (id,user_id,city,contact_phone,is_default)
     VALUES ($1,$2,'Legacy city','+9647700888811',false)`,
    [legacyAddressId, customer.user.id],
  );

  const product = await request(
    '/products/40000000-0000-4000-8000-000000000002',
  );
  const secondProduct = await request(
    '/products/40000000-0000-4000-8000-000000000003',
  );
  const variant = present(
    product.variants.find((entry) => entry.sku.endsWith('-STD')),
    'D1 product has a standard sellable SKU',
  );
  const secondVariant = present(
    secondProduct.variants.find((entry) => entry.sku.endsWith('-STD')),
    'D1 second product has a standard sellable SKU',
  );
  const originalProducts = (
    await db.query(
      `SELECT id::text, price::text, discount_type, discount_value::text,
              discount_starts_at, discount_ends_at, status
       FROM products WHERE id = ANY($1::uuid[])`,
      [[product.id, secondProduct.id]],
    )
  ).rows;

  const tierFive = await request('/admin/discount-tiers', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: { min_subtotal_iqd: 10000, percent: 5 },
  });
  const tierFifteen = await request('/admin/discount-tiers', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: { min_subtotal_iqd: 20000, percent: 15 },
  });
  const guestTiers = await request('/discount-tiers');
  check(
    guestTiers,
    {
      currency: 'IQD',
      coupon_stacking_enabled: false,
      tiers: [
        { min_subtotal: 10000, percent: 5 },
        { min_subtotal: 20000, percent: 15 },
      ],
    },
    'guests can read active tiers and the coupon-stacking setting',
  );
  await request(`/admin/discount-tiers/${tierFive.id}`, {
    token: adminToken,
    method: 'PATCH',
    body: { percent: 6 },
  });
  const editedGuestTiers = await request('/discount-tiers');
  check(
    editedGuestTiers.tiers[0].percent,
    6,
    'an owner tier edit invalidates the public cache immediately',
  );
  await request(`/admin/discount-tiers/${tierFive.id}`, {
    token: adminToken,
    method: 'PATCH',
    body: { percent: 5 },
  });

  let cart = await setSingleCartLine(
    customer.access_token,
    product,
    variant,
    9999,
  );
  check(
    [cart.applied_tier, cart.next_tier.amount_remaining],
    [null, 1],
    'one IQD below the first threshold reports one IQD remaining',
  );
  cart = await setSingleCartLine(
    customer.access_token,
    product,
    variant,
    10000,
  );
  check(
    [cart.applied_tier.id, cart.tier_discount, cart.next_tier.amount_remaining],
    [tierFive.id, 500, 10000],
    'the first tier applies exactly at its threshold',
  );
  await request('/coupons/validate', {
    token: customer.access_token,
    method: 'POST',
    body: { code: 'SHUBAYR10' },
  });
  cart = await request('/cart', { token: customer.access_token });
  check(
    [cart.discount_source, cart.discount, cart.coupon_discount],
    ['coupon', 1000, 1000],
    'the larger coupon wins over the first tier',
  );
  await request('/cart/coupon', {
    token: customer.access_token,
    method: 'DELETE',
  });
  cart = await setSingleCartLine(
    customer.access_token,
    product,
    variant,
    19999,
  );
  check(
    [cart.applied_tier.id, cart.next_tier.amount_remaining],
    [tierFive.id, 1],
    'one IQD below the second threshold reports one IQD remaining',
  );

  await clearCart(customer.access_token);
  await db.query(
    `UPDATE products SET price=$2, discount_type=NULL, discount_value=NULL,
       discount_starts_at=NULL, discount_ends_at=NULL, updated_at=now()
     WHERE id=$1`,
    [product.id, 12000 - Number(variant.price_delta)],
  );
  await db.query(
    `UPDATE products SET price=$2, discount_type=NULL, discount_value=NULL,
       discount_starts_at=NULL, discount_ends_at=NULL, updated_at=now()
     WHERE id=$1`,
    [secondProduct.id, 8000 - Number(secondVariant.price_delta)],
  );
  await request('/cart/items', {
    token: customer.access_token,
    method: 'POST',
    body: { product_id: product.id, variant_id: variant.id, quantity: 1 },
  });
  await request('/cart/items', {
    token: customer.access_token,
    method: 'POST',
    body: {
      product_id: secondProduct.id,
      variant_id: secondVariant.id,
      quantity: 1,
    },
  });
  await request('/coupons/validate', {
    token: customer.access_token,
    method: 'POST',
    body: { code: 'SHUBAYR10' },
  });
  cart = await request('/cart', { token: customer.access_token });
  check(
    [cart.subtotal, cart.discount_source, cart.discount, cart.next_tier],
    [20000, 'tier', 3000, null],
    'the higher tier wins over the coupon at its exact threshold',
  );
  const baghdadGovernorateQuote = await request(
    `/cart?governorate_id=${baghdad.id}`,
    { token: customer.access_token },
  );
  const baghdadAddressQuote = await request(
    `/cart?address_id=${baghdadAddress.id}`,
    { token: customer.access_token },
  );
  const basraAddressQuote = await request(
    `/cart?address_id=${basraAddress.id}`,
    { token: customer.access_token },
  );
  check(
    [
      baghdadGovernorateQuote.delivery_fee,
      baghdadGovernorateQuote.total,
      baghdadAddressQuote.delivery_fee,
      baghdadAddressQuote.total,
      basraAddressQuote.delivery_fee,
      basraAddressQuote.total,
    ],
    [6000, 23000, 6000, 23000, 9000, 26000],
    'signed-in cart pricing supports governorate and owned-address selectors',
  );
  const unservedCart = await request(`/cart?governorate_id=${halabja.id}`, {
    token: customer.access_token,
    expected: 409,
  });
  check(
    unservedCart.code,
    'DELIVERY_ZONE_NOT_SERVED',
    'cart pricing and checkout share the unserved-governorate code',
  );

  const reservationBefore = Number(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM stock_reservations WHERE status='active'",
      )
    ).rows[0].count,
  );
  const legacyRefusal = await request('/orders', {
    token: customer.access_token,
    method: 'POST',
    expected: 409,
    headers: { 'Idempotency-Key': `d1-legacy-${randomUUID()}` },
    body: { address_id: legacyAddressId, payment_method: 'cod' },
  });
  check(
    legacyRefusal.code,
    'ADDRESS_GOVERNORATE_REQUIRED',
    'a legacy address must select a governorate at checkout',
  );
  const unservedRefusal = await request('/orders', {
    token: customer.access_token,
    method: 'POST',
    expected: 409,
    headers: { 'Idempotency-Key': `d1-unserved-${randomUUID()}` },
    body: { address_id: halabjaAddress.id, payment_method: 'cod' },
  });
  check(
    unservedRefusal.code,
    'DELIVERY_ZONE_NOT_SERVED',
    'an unserved governorate has a clear checkout refusal',
  );
  check(
    Number(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM stock_reservations WHERE status='active'",
        )
      ).rows[0].count,
    ),
    reservationBefore,
    'refused checkout reserves no stock',
  );

  const raisedOrder = await place(
    customer.access_token,
    baghdadAddress.id,
    'raised',
  );
  check(
    [
      raisedOrder.original_delivery_fee,
      raisedOrder.delivery_fee,
      raisedOrder.total,
    ],
    [
      baghdadGovernorateQuote.delivery_fee,
      baghdadAddressQuote.delivery_fee,
      baghdadAddressQuote.total,
    ],
    'Baghdad checkout exactly matches and snapshots the pre-order cart quote',
  );
  check(
    raisedOrder.items.reduce((sum, item) => sum + item.discount_share, 0),
    raisedOrder.discount,
    'largest-remainder line shares sum to the exact order discount',
  );
  check(
    raisedOrder.items.reduce((sum, item) => sum + item.net_line_total, 0),
    raisedOrder.subtotal - raisedOrder.discount,
    'net line snapshots reconcile to discounted goods revenue',
  );

  await request(`/admin/orders/${raisedOrder.id}/status`, {
    token: adminToken,
    method: 'PATCH',
    expected: 409,
    body: { status: 'confirmed', version: raisedOrder.version },
  });
  const noPermission = await request(`/admin/orders/${raisedOrder.id}/status`, {
    token: operations.access_token,
    method: 'PATCH',
    expected: 403,
    body: {
      status: 'confirmed',
      version: raisedOrder.version,
      customer_contacted: true,
      customer_contact_note: 'Customer contacted',
      adjusted_delivery_fee: 8000,
      delivery_fee_adjustment_reason: 'Remote street',
    },
  });
  check(
    noPermission.code,
    'DELIVERY_FEE_ADJUSTMENT_FORBIDDEN',
    'fee adjustment requires its dedicated permission',
  );
  const missingReason = await request(
    `/admin/orders/${raisedOrder.id}/status`,
    {
      token: adminToken,
      method: 'PATCH',
      expected: 409,
      body: {
        status: 'confirmed',
        version: raisedOrder.version,
        customer_contacted: true,
        customer_contact_note: 'Customer contacted',
        adjusted_delivery_fee: 8000,
      },
    },
  );
  check(
    missingReason.code,
    'DELIVERY_FEE_ADJUSTMENT_REASON_REQUIRED',
    'an adjusted fee requires a reason',
  );
  let raised = await request(`/admin/orders/${raisedOrder.id}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: {
      status: 'confirmed',
      version: raisedOrder.version,
      customer_contacted: true,
      customer_contact_note: 'Customer confirmed by phone',
      adjusted_delivery_fee: 8000,
      delivery_fee_adjustment_reason: 'Remote street confirmed by customer',
      below_cost_override_reason: 'D1 fixture price approval',
    },
  });
  check(
    [raised.original_delivery_fee, raised.adjusted_delivery_fee, raised.total],
    [6000, 8000, 25000],
    'raising the fee retains the original and updates the order total',
  );
  const notifications = await request(
    '/me/notifications?type=order_confirmed&per_page=100',
    { token: customer.access_token },
  );
  check(
    notifications.data.some(
      (notification) => notification.entity_id === raisedOrder.id,
    ),
    true,
    'the customer receives a confirmation inbox notification',
  );

  await clearCart(customer.access_token);
  await request('/cart/items', {
    token: customer.access_token,
    method: 'POST',
    body: { product_id: product.id, variant_id: variant.id, quantity: 1 },
  });
  const loweredOrder = await place(
    customer.access_token,
    basraAddress.id,
    'lowered',
  );
  check(loweredOrder.delivery_fee, 9000, 'Basra checkout uses its zone fee');
  const lowered = await request(`/admin/orders/${loweredOrder.id}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: {
      status: 'confirmed',
      version: loweredOrder.version,
      customer_contacted: true,
      customer_contact_note: 'Customer confirmed by phone',
      adjusted_delivery_fee: 4000,
      delivery_fee_adjustment_reason: 'Nearby delivery point',
      below_cost_override_reason: 'D1 fixture price approval',
    },
  });
  check(
    [lowered.original_delivery_fee, lowered.adjusted_delivery_fee],
    [9000, 4000],
    'lowering the fee also retains the original snapshot',
  );
  await request(`/deliveries/${lowered.delivery_id}/assign`, {
    token: adminToken,
    method: 'PATCH',
    body: { agent_id: agent.user.id },
  });

  raised = await advance(raised, ['preparing', 'ready_for_dispatch']);
  await request(`/deliveries/${raised.delivery_id}/assign`, {
    token: adminToken,
    method: 'PATCH',
    body: { agent_id: agent.user.id },
  });
  raised = await request(`/admin/orders/${raised.id}/status`, {
    token: adminToken,
    method: 'PATCH',
    body: { status: 'dispatched', version: raised.version },
  });
  const lateAdjustment = await request(`/admin/orders/${raised.id}/status`, {
    token: adminToken,
    method: 'PATCH',
    expected: 409,
    body: {
      status: 'confirmed',
      version: raised.version,
      customer_contacted: true,
      customer_contact_note: 'Too late',
      adjusted_delivery_fee: 1,
      delivery_fee_adjustment_reason: 'Too late',
    },
  });
  check(
    lateAdjustment.code,
    'STALE_ORDER_STATE',
    'the fee cannot change after dispatch',
  );
  const delivered = await request(`/deliveries/${raised.delivery_id}`, {
    token: agent.access_token,
    method: 'PATCH',
    body: {
      status: 'delivered',
      order_version: raised.version,
      operation_id: `d1-delivery-${randomUUID()}`,
      collection_confirmation: 'confirmed',
      collected_amount: String(raised.total),
    },
  });
  check(
    [delivered.collection.due_amount, delivered.collection.collected_amount],
    [25000, 25000],
    'collection uses the adjusted total',
  );

  const revenue = (
    await db.query(
      `SELECT account.code, line.credit_base::numeric AS amount
       FROM delivery_collections collection
       JOIN journal_entries entry ON entry.id=collection.delivery_journal_entry_id
       JOIN journal_lines line ON line.entry_id=entry.id
       JOIN ledger_accounts account ON account.id=line.account_id
       WHERE collection.order_id=$1 AND account.code IN ('4000','4010')
       ORDER BY account.code`,
      [raised.id],
    )
  ).rows.map((row) => [row.code, Number(row.amount)]);
  check(
    revenue,
    [
      ['4000', 17000],
      ['4010', 8000],
    ],
    'ledger revenue splits net goods and the adjusted delivery fee',
  );

  const till = await request('/admin/cash-accounts', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      name: `D1 till ${randomUUID().slice(0, 8)}`,
      kind: 'cash',
      currency_code: 'IQD',
    },
  });
  const receipt = await request('/admin/cash-receipts', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: `d1-receipt-${randomUUID()}`,
      document_date: baghdadDate(),
      party_id: agent.user.id,
      cash_account_id: till.id,
      amount_iqd: String(raised.total),
      reference: 'D1 adjusted-fee collection',
      allocations: [{ order_id: raised.id, amount_iqd: String(raised.total) }],
    },
  });
  check(
    [
      receipt.amount_iqd,
      receipt.allocated_amount_iqd,
      receipt.unallocated_amount_iqd,
    ],
    [25000, 25000, 0],
    'the cash receipt reconciles the adjusted collection exactly',
  );

  await request(`/admin/products/${product.id}`, {
    token: adminToken,
    method: 'PATCH',
    body: { status: 'hidden' },
  });
  const returnLine = raised.items[0];
  const requestedReturn = await request('/returns', {
    token: customer.access_token,
    method: 'POST',
    expected: 201,
    body: {
      operation_id: randomUUID(),
      order_id: raised.id,
      reason: 'D1 net-share return',
      items: [
        {
          order_item_id: returnLine.id,
          quantity: returnLine.quantity,
          reason_code: 'change_of_mind',
          reason: 'Return after product is hidden',
        },
      ],
    },
  });
  check(
    [
      requestedReturn.items[0].discount_share,
      requestedReturn.items[0].net_amount,
      requestedReturn.expected_refund,
    ],
    [
      returnLine.discount_share,
      returnLine.net_line_total,
      returnLine.net_line_total,
    ],
    'a hidden product return uses the exact snapshotted net line share',
  );

  const auditActions = (
    await db.query(
      `SELECT DISTINCT action FROM audit_logs
       WHERE action IN ('delivery_zone.create','delivery_zone.update',
                        'discount_tier.create','order.delivery_fee.adjust')`,
    )
  ).rows.map((row) => row.action);
  check(
    [...auditActions].sort(),
    [
      'delivery_zone.create',
      'delivery_zone.update',
      'discount_tier.create',
      'order.delivery_fee.adjust',
    ].sort(),
    'zone, tier, and fee changes are audited',
  );

  await request(`/admin/discount-tiers/${tierFive.id}`, {
    token: adminToken,
    method: 'DELETE',
    expected: 204,
  });
  await request(`/admin/discount-tiers/${tierFifteen.id}`, {
    token: adminToken,
    method: 'DELETE',
    expected: 204,
  });
  for (const original of originalProducts) {
    await db.query(
      `UPDATE products SET price=$2, discount_type=$3, discount_value=$4,
         discount_starts_at=$5, discount_ends_at=$6, status=$7, updated_at=now()
       WHERE id=$1`,
      [
        original.id,
        original.price,
        original.discount_type,
        original.discount_value,
        original.discount_starts_at,
        original.discount_ends_at,
        original.status,
      ],
    );
  }
  await db.query('DELETE FROM addresses WHERE id=$1', [legacyAddressId]);

  console.log(
    `D1 delivery-pricing acceptance passed (${assertions} assertions).`,
  );
} finally {
  await db.end();
}
