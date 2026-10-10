import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Phase-8 closing acceptance requires a disposable *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error(
    'Phase-8 closing acceptance requires the runner-owned loopback API',
  );
}

let assertions = 0;
const operationRequests = [];
const operationResponses = [];

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function near(actual, expected, message, tolerance = 0.01) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`,
  );
  assertions += 1;
}

async function request(
  path,
  { token, method = 'GET', body, headers, expected = 200 } = {},
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

async function operation(
  path,
  { token, method = 'POST', body, expected = 201 },
) {
  assert.ok(body?.operation_id, `${method} ${path} must carry operation_id`);
  assertions += 1;
  const result = await request(path, { token, method, body, expected });
  operationRequests.push({ path, token, method, body, expected });
  operationResponses.push(structuredClone(result));
  return result;
}

function baghdadDate(value = new Date()) {
  const values = Object.fromEntries(
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
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date, amount) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount))
    .toISOString()
    .slice(0, 10);
}

function midnightBoundary(date) {
  const [year, month, day] = date.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day, -3, 0, 0);
  return {
    before: new Date(utc - 10_000).toISOString(),
    after: new Date(utc + 10_000).toISOString(),
  };
}

function dateOnly(value) {
  return typeof value === 'string' ? value.slice(0, 10) : value;
}

async function loginStaff(username, password = 'Shubayr-Dev-Staff!2026') {
  return request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username, password },
  });
}

async function loginApp(phone) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone },
  });
  return request('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: challenge.dev_otp },
  });
}

async function allPages(path, token) {
  const separator = path.includes('?') ? '&' : '?';
  const first = await request(`${path}${separator}page=1&per_page=100`, {
    token,
  });
  const rows = [...first.data];
  for (let page = 2; rows.length < first.total; page += 1) {
    const next = await request(`${path}${separator}page=${page}&per_page=100`, {
      token,
    });
    rows.push(...next.data);
  }
  return rows;
}

const today = baghdadDate();
const previousDay = addDays(today, -1);
const boundary = midnightBoundary(today);
const suffix = randomUUID().slice(0, 8);

const adminLogin = await loginStaff('admin', 'Shubayr-Dev-Admin!2026');
const admin = adminLogin.access_token;
const stock = (await loginStaff('stock')).access_token;
const customerLogin = await loginApp('+9647700000006');
const customer = customerLogin.access_token;
const agentLogin = await loginApp('+9647700000005');
const agent = agentLogin.access_token;

// Give the second seeded staff user the existing accountant duties through the
// real access-management API. A fresh login is required after permission_version changes.
const presets = await request('/admin/presets', { token: admin });
const operationsPreset = presets.find((row) => row.name === 'operations');
const accountantPreset = presets.find((row) => row.name === 'accountant');
assert.ok(
  operationsPreset && accountantPreset,
  'seeded operations/accountant presets exist',
);
assertions += 1;
const operationsSeed = await loginStaff('operations');
await request(`/admin/staff/${operationsSeed.user.id}/access`, {
  token: admin,
  method: 'PUT',
  body: {
    preset_ids: [operationsPreset.id, accountantPreset.id],
    permission_keys: [],
    reason: 'Phase-8 closing acceptance settlement and reversal duties',
  },
});
const operationsLogin = await loginStaff('operations');
const operations = operationsLogin.access_token;

const originalSettings = await request('/admin/settings', { token: admin });
await request('/admin/settings', {
  token: admin,
  method: 'PUT',
  body: {
    settings: {
      separation_of_duties_level: 'standard',
      delivery_fee: '5000',
    },
  },
});

const categories = await request('/admin/categories', { token: admin });
const category = categories
  .flatMap((row) => row.children ?? [])
  .find((row) => row.parent_id);
assert.ok(category?.id, 'a catalog category is available');
assertions += 1;
const product = await request('/admin/products', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    category_id: category.id,
    name_en: `C9 closing product ${suffix}`,
    name_ar: `C9 closing product ${suffix}`,
    description: 'Created only through the API for the phase-8 closing day',
    price: 20000,
    status: 'active',
    published: true,
    variants: [
      {
        sku: `C9-PIECE-${suffix}`,
        attributes: { unit: 'piece' },
        base_unit: 'piece',
        whole_units_only: true,
      },
      {
        sku: `C9-WEIGHT-${suffix}`,
        attributes: { unit: 'kg' },
        base_unit: 'kg',
        whole_units_only: false,
      },
      {
        sku: `C9-USD-${suffix}`,
        attributes: { source: 'USD invoice' },
        base_unit: 'piece',
        whole_units_only: true,
      },
    ],
  },
});
const piece = product.variants.find((row) => row.sku.startsWith('C9-PIECE'));
const weight = product.variants.find((row) => row.sku.startsWith('C9-WEIGHT'));
const usdSku = product.variants.find((row) => row.sku.startsWith('C9-USD'));
assert.ok(
  piece && weight && usdSku,
  'piece, weight and USD-source SKUs were created',
);
assertions += 1;

const warehouses = await request('/admin/inventory/warehouses', {
  token: admin,
});
const location = warehouses
  .flatMap((warehouse) => warehouse.locations)
  .find((row) => row.is_active && row.is_sellable);
assert.ok(location, 'an active sellable warehouse location exists');
assertions += 1;

const localSupplier = await request('/admin/suppliers', {
  token: stock,
  method: 'POST',
  expected: 201,
  body: {
    name: `C9 local supplier ${suffix}`,
    default_currency: 'IQD',
    payment_terms_days: 30,
  },
});
const usdSupplier = await request('/admin/suppliers', {
  token: stock,
  method: 'POST',
  expected: 201,
  body: {
    name: `C9 USD supplier ${suffix}`,
    default_currency: 'USD',
    payment_terms_days: 30,
  },
});

const localInvoice = await operation('/admin/purchase-invoices', {
  token: stock,
  body: {
    operation_id: `c9-local-purchase-${suffix}`,
    document_date: previousDay,
    supplier_id: localSupplier.id,
    supplier_invoice_number: `C9-LOCAL-${suffix}`,
    currency_code: 'IQD',
    default_location_id: location.id,
    allocation_method: 'value',
    lines: [
      {
        variant_id: piece.id,
        quantity: '80',
        pack_size: '1',
        unit_cost: '10000',
        lot_number: `C9-PIECE-${suffix}`,
      },
      {
        variant_id: weight.id,
        quantity: '60',
        pack_size: '1',
        unit_cost: '5000',
        lot_number: `C9-WEIGHT-${suffix}`,
      },
    ],
  },
});
check(
  dateOnly(localInvoice.document_date),
  previousDay,
  'local purchase is recorded before the Baghdad midnight boundary',
);
check(Boolean(localInvoice.created_by_name), true, 'purchase returns its actor display name');

await request('/admin/exchange-rates', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    currency_code: 'USD',
    rate: '1500',
    basis: 1,
    effective_at: `${previousDay}T12:00:00.000Z`,
    reason: 'Phase-8 closing acceptance USD rate',
  },
});
const usdInvoice = await operation('/admin/purchase-invoices', {
  token: stock,
  body: {
    operation_id: `c9-usd-purchase-${suffix}`,
    document_date: previousDay,
    supplier_id: usdSupplier.id,
    supplier_invoice_number: `C9-USD-${suffix}`,
    currency_code: 'USD',
    exchange_rate: '1500',
    default_location_id: location.id,
    allocation_method: 'value',
    lines: [
      {
        variant_id: usdSku.id,
        quantity: '40',
        pack_size: '1',
        unit_cost: '5',
        lot_number: `C9-USD-${suffix}`,
      },
    ],
  },
});
check(
  usdInvoice.currency_code,
  'USD',
  'one stock invoice is denominated in USD',
);

const till = await request('/admin/cash-accounts', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: { name: `C9 till ${suffix}`, kind: 'cash', currency_code: 'IQD' },
});
await operation(`/admin/cash-accounts/${till.id}/opening-balance`, {
  token: admin,
  body: {
    operation_id: `c9-till-opening-${suffix}`,
    document_date: previousDay,
    amount: '2000000',
  },
});
const usdPayment = await operation('/admin/supplier-payments', {
  token: admin,
  body: {
    operation_id: `c9-usd-payment-${suffix}`,
    document_date: today,
    supplier_id: usdSupplier.id,
    cash_account_id: till.id,
    currency_code: 'IQD',
    amount: '300000',
    allocations: [{ invoice_id: usdInvoice.id, amount: '300000' }],
  },
});
check(
  Number(usdPayment.allocations[0].amount_invoice_currency),
  200,
  'IQD account payment settles the 200 USD supplier invoice',
);
check(Boolean(usdPayment.created_by_name), true, 'supplier payment returns its actor display name');

const address = await request('/addresses', {
  token: customer,
  method: 'POST',
  expected: 201,
  body: {
    label: `C9 ${suffix}`,
    city: 'Baghdad',
    area: 'Karrada',
    street: 'Closing acceptance route',
    contact_phone: '+9647700000006',
  },
});

async function clearCart() {
  const cart = await request('/cart', { token: customer });
  for (const item of cart.items) {
    await request(`/cart/items/${item.id}`, {
      token: customer,
      method: 'DELETE',
      expected: 204,
    });
  }
}

async function placeOrder(
  label,
  variant,
  quantity,
  { acceptPrice = false } = {},
) {
  await clearCart();
  await request('/cart/items', {
    token: customer,
    method: 'POST',
    body: {
      product_id: product.id,
      variant_id: variant.id,
      quantity,
    },
  });
  let cart = await request('/cart', { token: customer });
  if (acceptPrice) {
    await request(`/admin/products/${product.id}`, {
      token: admin,
      method: 'PATCH',
      body: { price: Number(product.price) + 10000 },
    });
    cart = await request('/cart', { token: customer });
    check(
      cart.items[0].price_changed,
      true,
      'checkout detects the price change',
    );
  }
  const key = `c9-order-${label}-${suffix}`;
  const body = {
    address_id: address.id,
    payment_method: 'cod',
    ...(cart.items.some((item) => item.price_changed)
      ? {
          accepted_price_versions: cart.items.map((item) => ({
            variant_id: item.variant_id,
            price_version: item.current_price_version,
          })),
        }
      : {}),
  };
  const placed = await request('/orders', {
    token: customer,
    method: 'POST',
    expected: 201,
    headers: { 'Idempotency-Key': key },
    body,
  });
  const replay = await request('/orders', {
    token: customer,
    method: 'POST',
    expected: 201,
    headers: { 'Idempotency-Key': key },
    body,
  });
  check(replay.id, placed.id, `${label} checkout replay returns one order`);
  return placed;
}

async function ready(order) {
  let current = order;
  for (const status of ['confirmed', 'preparing', 'ready_for_dispatch']) {
    current = await request(`/admin/orders/${order.id}/status`, {
      token: admin,
      method: 'PATCH',
      body: { status, version: current.version },
    });
  }
  return current;
}

async function currentOrder(orderId) {
  return request(`/admin/orders/${orderId}`, { token: admin });
}

async function dispatchInternal(order) {
  await request(`/deliveries/${order.delivery_id}/assign`, {
    token: admin,
    method: 'PATCH',
    body: { agent_id: agentLogin.user.id },
  });
  const assigned = await currentOrder(order.id);
  await request(`/deliveries/${order.delivery_id}`, {
    token: agent,
    method: 'PATCH',
    body: { status: 'out_for_delivery', order_version: assigned.version },
  });
  return currentOrder(order.id);
}

async function deliverInternal(
  order,
  label,
  { confirmation = 'confirmed', collected = order.total } = {},
) {
  const current = await currentOrder(order.id);
  return operation(`/deliveries/${order.delivery_id}`, {
    token: agent,
    method: 'PATCH',
    expected: 200,
    body: {
      status: 'delivered',
      order_version: current.version,
      operation_id: `c9-deliver-${label}-${suffix}`,
      collection_confirmation: confirmation,
      ...(confirmation === 'confirmed'
        ? { collected_amount: String(collected) }
        : {}),
    },
  });
}

const orders = {};
orders.full = await ready(
  await placeOrder('full-price-change', piece, 1, { acceptPrice: true }),
);
check(
  Boolean(orders.full.price_change_info?.accepted_at),
  true,
  'price-change acceptance is stored on the order',
);
orders.weight = await ready(await placeOrder('weight-short', weight, 1.25));
check(
  orders.weight.items[0].quantity,
  1.25,
  'weight SKU preserves a decimal quantity',
);
orders.laterFull = await ready(await placeOrder('later-full', piece, 1));
orders.laterShort = await ready(await placeOrder('later-short', piece, 1));
orders.retry = await ready(await placeOrder('retry-delivered', piece, 1));
orders.retrieval = await ready(await placeOrder('failed-retrieval', piece, 1));
orders.loss = await ready(await placeOrder('party-loss', piece, 1));
orders.returned = await ready(await placeOrder('door-return', piece, 1));

for (const name of Object.keys(orders)) {
  orders[name] = await dispatchInternal(orders[name]);
}

await deliverInternal(orders.full, 'full');
await deliverInternal(orders.weight, 'weight-short', {
  collected: orders.weight.total - 1000,
});
await deliverInternal(orders.laterFull, 'unconfirmed-full', {
  confirmation: 'unconfirmed',
});
await deliverInternal(orders.laterShort, 'unconfirmed-short', {
  confirmation: 'unconfirmed',
});

const laterFullConfirmation = {
  operation_id: `c9-confirm-later-full-${suffix}`,
  collected_amount: String(orders.laterFull.total),
};
await operation(
  `/admin/deliveries/${orders.laterFull.delivery_id}/collection-confirmation`,
  { token: admin, body: laterFullConfirmation, expected: 200 },
);
await operation(
  `/admin/deliveries/${orders.laterShort.delivery_id}/collection-confirmation`,
  {
    token: admin,
    body: {
      operation_id: `c9-confirm-later-short-${suffix}`,
      collected_amount: String(orders.laterShort.total - 2000),
    },
    expected: 200,
  },
);

await request(`/deliveries/${orders.retry.delivery_id}`, {
  token: agent,
  method: 'PATCH',
  body: {
    status: 'failed',
    order_version: orders.retry.version,
    reason: 'Customer was temporarily unavailable',
  },
});
let retryOrder = await currentOrder(orders.retry.id);
await request(`/admin/deliveries/${orders.retry.delivery_id}/status`, {
  token: admin,
  method: 'PATCH',
  body: { status: 'out_for_delivery', order_version: retryOrder.version },
});
retryOrder = await currentOrder(orders.retry.id);
await operation(`/deliveries/${orders.retry.delivery_id}`, {
  token: agent,
  method: 'PATCH',
  expected: 200,
  body: {
    status: 'delivered',
    order_version: retryOrder.version,
    operation_id: `c9-retry-delivered-${suffix}`,
    collection_confirmation: 'confirmed',
    collected_amount: String(orders.retry.total),
  },
});
const retryResult = await currentOrder(orders.retry.id);
check(
  retryResult.delivery_attempts.map((row) => row.status),
  ['failed', 'delivered'],
  'failed delivery is retried and then delivered',
);

await request(`/deliveries/${orders.retrieval.delivery_id}`, {
  token: agent,
  method: 'PATCH',
  body: {
    status: 'failed',
    order_version: orders.retrieval.version,
    reason: 'Customer refused the parcel',
  },
});
const retrieval = await operation(
  `/admin/orders/${orders.retrieval.id}/retrievals`,
  {
    token: admin,
    body: {
      operation_id: `c9-open-retrieval-${suffix}`,
      outcome: 'retry',
      reason: 'Return the failed parcel to the warehouse',
    },
  },
);
const receivedRetrieval = await operation(
  `/admin/retrievals/${retrieval.id}/receive`,
  {
    token: admin,
    expected: 200,
    body: {
      operation_id: `c9-receive-retrieval-${suffix}`,
      lines: retrieval.lines.map((line) => ({
        line_id: line.id,
        location_id: location.id,
        quantity: String(line.expected_quantity),
      })),
    },
  },
);
check(receivedRetrieval.status, 'closed', 'failed delivery is fully retrieved');

const lossCustody = await request(
  `/admin/delivery-parties/${agentLogin.user.id}/custody`,
  { token: admin },
);
const lossHolding = lossCustody.goods.lines.find(
  (row) => row.order.id === orders.loss.id,
);
assert.ok(lossHolding, 'dispatched loss order is in agent goods custody');
assertions += 1;
const partyLoss = await operation('/admin/custody-exceptions/goods-loss', {
  token: admin,
  body: {
    operation_id: `c9-party-loss-${suffix}`,
    document_date: today,
    order_id: orders.loss.id,
    liability_bearer: 'party',
    reason: 'Agent accepts responsibility for the missing parcel',
    lines: [{ custody_holding_id: lossHolding.holding_id, quantity: '1' }],
  },
});
check(
  partyLoss.liability_bearer,
  'party',
  'lost goods are explicitly party-borne',
);
check(Boolean(partyLoss.created_by_name), true, 'custody exception returns its actor display name');

const returnedCustody = await request(
  `/admin/delivery-parties/${agentLogin.user.id}/custody`,
  { token: admin },
);
const returnedHolding = returnedCustody.goods.lines.find(
  (row) => row.order.id === orders.returned.id,
);
assert.ok(
  returnedHolding,
  'door-return order is in agent custody before delivery',
);
assertions += 1;
await deliverInternal(orders.returned, 'door-return-short', {
  collected: 0,
});
const doorReturn = await operation('/admin/custody-exceptions/return-against-uncollected', {
  token: admin,
  body: {
    operation_id: `c9-door-return-${suffix}`,
    document_date: today,
    order_id: orders.returned.id,
    reason: 'Customer returned the parcel at the door',
    lines: [
      {
        custody_holding_id: returnedHolding.holding_id,
        location_id: location.id,
        quantity: String(returnedHolding.quantity),
      },
    ],
  },
});
check(Boolean(doorReturn.created_by_name), true, 'door return returns its actor display name');
const feeRefund = await operation(
  '/admin/custody-exceptions/delivery-fee-refund',
  {
    token: admin,
    body: {
      operation_id: `c9-fee-refund-${suffix}`,
      document_date: today,
      order_id: orders.returned.id,
      amount_iqd: String(orders.returned.delivery_fee),
      settlement_method: 'cash_account',
      cash_account_id: till.id,
      reason: 'Refund the delivery fee after the door return',
    },
  },
);
check(feeRefund.type, 'delivery_fee_refund', 'delivery-fee refund is posted');
const duplicateFeeRefund = await request(
  '/admin/custody-exceptions/delivery-fee-refund',
  {
    token: admin,
    method: 'POST',
    expected: 409,
    body: {
      operation_id: `c10-fee-refund-refusal-${suffix}`,
      document_date: today,
      order_id: orders.returned.id,
      amount_iqd: '1',
      settlement_method: 'cash_account',
      cash_account_id: till.id,
      reason: 'Stable refusal-code acceptance',
    },
  },
);
check(
  duplicateFeeRefund.code,
  'DELIVERY_FEE_REFUND_EXCEEDS_CHARGE',
  'custody refusal has a stable specific code',
);

const internalCollections = await request(
  `/admin/delivery-parties/${agentLogin.user.id}/collections?per_page=100`,
  { token: admin },
);
const byOrder = new Map(
  internalCollections.data.map((row) => [row.order.id, row]),
);
const receiptOrders = [orders.full, orders.laterFull, orders.retry];
for (const order of receiptOrders) {
  assert.ok(byOrder.get(order.id), `${order.order_number} has a collection`);
  assertions += 1;
}
const firstAllocations = receiptOrders.slice(0, 2).map((order) => ({
  order_id: order.id,
  amount_iqd: String(Math.min(10000, byOrder.get(order.id).collected_amount)),
}));
const laterAllocationAmount = Math.min(
  5000,
  byOrder.get(receiptOrders[2].id).collected_amount,
);
const receiptAmount =
  firstAllocations.reduce((sum, row) => sum + Number(row.amount_iqd), 0) +
  laterAllocationAmount;
const splitReceipt = await operation('/admin/cash-receipts', {
  token: admin,
  body: {
    operation_id: `c9-split-receipt-${suffix}`,
    document_date: today,
    party_id: agentLogin.user.id,
    cash_account_id: till.id,
    amount_iqd: String(receiptAmount),
    reference: 'One handover across several orders',
    allocations: firstAllocations,
  },
});
check(
  splitReceipt.unallocated_amount_iqd,
  laterAllocationAmount,
  'multi-order receipt keeps an explicit remainder',
);
check(
  Boolean(splitReceipt.created_by_name),
  true,
  'cash receipt returns its actor display name',
);
check(
  Boolean(splitReceipt.allocation_batches[0].created_by_name),
  true,
  'initial allocation returns its actor display name',
);
const allocatedLater = await operation(
  `/admin/cash-receipts/${splitReceipt.id}/allocations`,
  {
    token: operations,
    body: {
      operation_id: `c9-later-allocation-${suffix}`,
      document_date: today,
      allocations: [
        {
          order_id: receiptOrders[2].id,
          amount_iqd: String(laterAllocationAmount),
        },
      ],
    },
  },
);
check(
  allocatedLater.unallocated_amount_iqd,
  0,
  'receipt remainder is allocated later',
);
check(
  Boolean(allocatedLater.allocation_batches.at(-1).created_by_name),
  true,
  'later allocation returns its actor display name',
);
const allocationRefusal = await request(
  `/admin/cash-receipts/${splitReceipt.id}/allocations`,
  {
    token: operations,
    method: 'POST',
    expected: 409,
    body: {
      operation_id: `c10-over-allocated-${suffix}`,
      document_date: today,
      allocations: [{ order_id: receiptOrders[2].id, amount_iqd: '1' }],
    },
  },
);
check(
  allocationRefusal.code,
  'ALLOCATION_EXCEEDS_RECEIPT',
  'allocation refusal has a stable specific code',
);

const reversibleReceipt = await operation('/admin/cash-receipts', {
  token: admin,
  body: {
    operation_id: `c9-reversible-receipt-${suffix}`,
    document_date: today,
    party_id: agentLogin.user.id,
    cash_account_id: till.id,
    amount_iqd: '1000',
    reference: 'Second-user reversal proof',
    allocations: [],
  },
});
const selfReversal = await request(
  `/admin/cash-receipts/${reversibleReceipt.id}/reversal`,
  {
    token: admin,
    method: 'POST',
    expected: 403,
    body: {
      operation_id: `c10-self-reversal-${suffix}`,
      reason: 'Stable self-reversal refusal-code acceptance',
    },
  },
);
check(
  selfReversal.code,
  'SELF_REVERSAL_FORBIDDEN',
  'self-reversal refusal has a stable specific code',
);
const reversedReceipt = await operation(
  `/admin/cash-receipts/${reversibleReceipt.id}/reversal`,
  {
    token: operations,
    body: {
      operation_id: `c9-reverse-receipt-${suffix}`,
      reason: 'Second staff user reverses the mistaken handover',
    },
  },
);
check(reversedReceipt.status, 'reversed', 'a second user reverses the receipt');
check(
  reversedReceipt.reversal.created_by,
  operationsLogin.user.id,
  'reversal records the second staff user',
);
check(
  Boolean(reversedReceipt.reversal.created_by_name),
  true,
  'receipt reversal returns its actor display name',
);

// Customer-direct trips cannot also charge the store delivery fee. Change the
// configured fee through the settings API only for this one checkout.
await request('/admin/settings', {
  token: admin,
  method: 'PUT',
  body: { settings: { delivery_fee: '0' } },
});
let tripOrder = await ready(await placeOrder('external-trip', usdSku, 1));
await request('/admin/settings', {
  token: admin,
  method: 'PUT',
  body: {
    settings: {
      delivery_fee: originalSettings.settings.delivery_fee ?? '5000',
    },
  },
});
const driver = await request('/admin/external-drivers', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    name: `C9 external driver ${suffix}`,
    phone: `+96476${Date.now()}`.slice(0, 16),
    vehicle_number: `C9-${suffix}`,
  },
});
const trip = await operation('/admin/external-driver-trips', {
  token: admin,
  body: {
    operation_id: `c9-trip-create-${suffix}`,
    driver_party_id: driver.id,
    fare_bearer: 'customer_direct',
    fare_amount_iqd: '3000',
    fare_settlement_method: 'customer_direct',
    failure_cancellation_agreement: 'Customer pays the fare directly',
    document_date: previousDay,
  },
});
check(Boolean(trip.created_by_name), true, 'trip returns its creator display name');
const tripWithOrder = await operation(`/admin/external-driver-trips/${trip.id}/orders`, {
  token: admin,
  body: {
    operation_id: `c9-trip-handover-${suffix}`,
    order_id: tripOrder.id,
    order_version: tripOrder.version,
    fare_share_iqd: '3000',
    source: 'Signed dispatch sheet',
    event_at: boundary.before,
    customer_acceptance_note: 'Customer accepted the IQD 3,000 direct fare',
  },
});
check(
  Boolean(tripWithOrder.events.at(-1).recorded_by_name),
  true,
  'trip handover event returns its actor display name',
);
const startedTrip = await operation(`/admin/external-driver-trips/${trip.id}/start`, {
  token: admin,
  expected: 200,
  body: {
    operation_id: `c9-trip-start-${suffix}`,
    source: 'Dispatch desk',
    event_at: boundary.before,
  },
});
check(Boolean(startedTrip.started_by_name), true, 'trip start returns its actor display name');
const unresolvedTrip = await request(
  `/admin/external-driver-trips/${trip.id}/close`,
  {
    token: operations,
    method: 'POST',
    expected: 409,
    body: {
      operation_id: `c10-unresolved-trip-${suffix}`,
      document_date: today,
      source: 'Stable unresolved-order refusal-code acceptance',
      event_at: boundary.after,
    },
  },
);
check(
  unresolvedTrip.code,
  'TRIP_ORDERS_UNRESOLVED',
  'trip refusal has a stable specific code',
);
tripOrder = await currentOrder(tripOrder.id);
await operation(`/admin/deliveries/${tripOrder.delivery_id}/status`, {
  token: admin,
  method: 'PATCH',
  expected: 200,
  body: {
    status: 'delivered',
    order_version: tripOrder.version,
    operation_id: `c9-trip-delivered-${suffix}`,
    collection_confirmation: 'confirmed',
    collected_amount: String(tripOrder.total),
    source: 'External driver signed receipt',
    event_at: boundary.after,
  },
});
const tripCash = Math.max(1, tripOrder.total - 2000);
const tripReceipt = await operation('/admin/cash-receipts', {
  token: admin,
  body: {
    operation_id: `c9-trip-receipt-${suffix}`,
    document_date: today,
    party_id: driver.id,
    cash_account_id: till.id,
    amount_iqd: String(tripCash),
    allocations: [{ order_id: tripOrder.id, amount_iqd: String(tripCash) }],
  },
});
const wrongPartyAllocation = await request(
  `/admin/cash-receipts/${splitReceipt.id}/allocations`,
  {
    token: operations,
    method: 'POST',
    expected: 409,
    body: {
      operation_id: `c10-wrong-party-${suffix}`,
      document_date: today,
      allocations: [{ order_id: tripOrder.id, amount_iqd: '1' }],
    },
  },
);
check(
  wrongPartyAllocation.code,
  'ALLOCATION_WRONG_PARTY',
  'wrong-party allocation refusal has a stable specific code',
);
const closedTrip = await operation(
  `/admin/external-driver-trips/${trip.id}/close`,
  {
    token: operations,
    expected: 200,
    body: {
      operation_id: `c9-trip-close-${suffix}`,
      document_date: today,
      source: 'Cashier end-of-day settlement',
      event_at: boundary.after,
    },
  },
);
check(
  closedTrip.status,
  'closed',
  'external-driver trip closes after midnight',
);
check(
  closedTrip.settlement.outstanding_cash_iqd,
  2000,
  'trip close keeps the IQD 2,000 cash difference visible',
);
check(Boolean(closedTrip.closed_by_name), true, 'trip close returns its actor display name');
check(
  [dateOnly(trip.document_date), baghdadDate(new Date(closedTrip.closed_at))],
  [previousDay, today],
  'trip documents straddle the Baghdad midnight boundary',
);

const unallocatedLow = await operation('/admin/cash-receipts', {
  token: admin,
  body: {
    operation_id: `c10-unallocated-low-${suffix}`,
    document_date: today,
    party_id: driver.id,
    cash_account_id: till.id,
    amount_iqd: '400',
    reference: 'Sorting and reconciliation low remainder',
    allocations: [],
  },
});
const unallocatedHigh = await operation('/admin/cash-receipts', {
  token: admin,
  body: {
    operation_id: `c10-unallocated-high-${suffix}`,
    document_date: today,
    party_id: driver.id,
    cash_account_id: till.id,
    amount_iqd: '600',
    reference: 'Sorting and reconciliation high remainder',
    allocations: [],
  },
});
check(
  [tripReceipt.created_by_name, unallocatedLow.created_by_name, unallocatedHigh.created_by_name].every(Boolean),
  true,
  'all trip cash vouchers return actor display names',
);

const trial = await request('/admin/ledger/trial-balance', { token: admin });
check(trial.balanced, true, 'ledger reports balanced');
check(
  trial.debit_total,
  trial.credit_total,
  'trial-balance debits equal credits',
);
const account = (code) => trial.data.find((row) => row.code === code);

const lots = await allPages('/admin/inventory/lots', admin);
const warehouseLotValue = lots.reduce(
  (sum, lot) =>
    sum +
    lot.batch_stock.reduce(
      (inner, row) => inner + Number(row.quantity) * Number(lot.purchase_cost),
      0,
    ),
  0,
);
near(
  Number(account('1000').balance),
  warehouseLotValue,
  'inventory account equals warehouse lot value',
);

const custodyOverview = await allPages(
  '/admin/delivery-parties/custody-overview',
  admin,
);
const goodsHeld = custodyOverview.reduce(
  (sum, row) => sum + Number(row.custody_summary.goods_value_iqd),
  0,
);
const cashHeld = custodyOverview.reduce(
  (sum, row) => sum + Number(row.custody_summary.cash_held),
  0,
);
near(
  Number(account('1010').balance),
  goodsHeld,
  'goods-in-custody equals all party holdings',
);
near(
  Number(account('1020').balance),
  cashHeld,
  'cash-in-custody equals all party holdings',
);

const supplierBalances = await request('/admin/suppliers/balances', {
  token: admin,
});
const supplierIqd = supplierBalances.reduce(
  (sum, row) => sum + Number(row.balance_iqd),
  0,
);
near(
  Number(account('2000').balance),
  supplierIqd,
  'AP control equals supplier balances',
);

const defaultVoucherSort = await allPages('/admin/cash-receipts', admin);
check(
  defaultVoucherSort[0].id,
  unallocatedHigh.id,
  'voucher list defaults to newest first',
);
for (const direction of ['asc', 'desc']) {
  const rows = await allPages(
    `/admin/cash-receipts?sort_by=amount&sort_direction=${direction}`,
    admin,
  );
  const amounts = rows.map((row) => Number(row.amount_iqd));
  check(
    amounts,
    [...amounts].sort((left, right) =>
      direction === 'asc' ? left - right : right - left,
    ),
    `voucher amount sort is ${direction}`,
  );
}
for (const direction of ['asc', 'desc']) {
  const rows = await allPages(
    `/admin/cash-receipts?sort_by=date&sort_direction=${direction}`,
    admin,
  );
  const dates = rows.map((row) => row.document_date);
  check(
    dates,
    [...dates].sort((left, right) =>
      direction === 'asc'
        ? left.localeCompare(right)
        : right.localeCompare(left),
    ),
    `voucher date sort is ${direction}`,
  );
}

const unallocated = await allPages('/admin/cash-receipts/unallocated', admin);
check(
  unallocated.slice(0, 2).map((row) => row.id),
  [unallocatedHigh.id, unallocatedLow.id],
  'unallocated receipts default to newest first',
);
const unallocatedAscending = await allPages(
  '/admin/cash-receipts/unallocated?sort_by=amount&sort_direction=asc',
  admin,
);
check(
  unallocatedAscending.map((row) => row.id),
  [unallocatedLow.id, unallocatedHigh.id],
  'unallocated receipts sort by amount ascending',
);
const unallocatedDescending = await allPages(
  '/admin/cash-receipts/unallocated?sort_by=amount&sort_direction=desc',
  admin,
);
check(
  unallocatedDescending.map((row) => row.id),
  [unallocatedHigh.id, unallocatedLow.id],
  'unallocated receipts sort by amount descending',
);
const unallocatedDateAscending = await allPages(
  '/admin/cash-receipts/unallocated?sort_by=date&sort_direction=asc',
  admin,
);
check(
  unallocatedDateAscending.map((row) => row.id),
  [unallocatedLow.id, unallocatedHigh.id],
  'unallocated receipts sort by date ascending',
);
const unallocatedDateDescending = await allPages(
  '/admin/cash-receipts/unallocated?sort_by=date&sort_direction=desc',
  admin,
);
check(
  unallocatedDateDescending.map((row) => row.id),
  [unallocatedHigh.id, unallocatedLow.id],
  'unallocated receipts sort by date descending',
);
const unallocatedTotal = unallocated.reduce(
  (sum, row) => sum + Number(row.unallocated_amount_iqd),
  0,
);
const activeReceipts = await allPages(
  '/admin/cash-receipts?status=active',
  admin,
);
const detailUnallocated = activeReceipts.reduce(
  (sum, row) => sum + Number(row.unallocated_amount_iqd),
  0,
);
near(
  unallocatedTotal,
  detailUnallocated,
  'unallocated receipt queue equals active voucher remainders',
);

const reconciliation = await request(
  '/admin/cash-receipts/reconciliation',
  { token: admin },
);
near(
  reconciliation.overall.total_receipts_iqd -
    reconciliation.overall.total_allocations_iqd -
    reconciliation.overall.total_reversals_iqd,
  reconciliation.overall.total_unallocated_iqd,
  'overall receipt subledger obeys receipts minus allocations minus reversals',
);
near(
  reconciliation.overall.total_unallocated_iqd,
  unallocatedTotal,
  'receipt reconciliation equals the unallocated queue',
);
for (const party of reconciliation.parties) {
  near(
    party.total_receipts_iqd -
      party.total_allocations_iqd -
      party.total_reversals_iqd,
    party.total_unallocated_iqd,
    `${party.party.name} receipt subledger reconciles`,
  );
}
const driverReconciliation = reconciliation.parties.find(
  (row) => row.party.id === driver.id,
);
assert.ok(driverReconciliation, 'driver has a receipt reconciliation row');
assertions += 1;
check(
  driverReconciliation.total_unallocated_iqd,
  1000,
  'driver reconciliation exposes both unallocated receipts',
);

const goodsStatement = await request(
  `/admin/delivery-parties/${driver.id}/statement?page=1&per_page=1`,
  { token: admin },
);
check(
  Object.hasOwn(goodsStatement, 'cash_activity'),
  false,
  'goods statement does not embed cash paging',
);
const cashActivity = await request(
  `/admin/delivery-parties/${driver.id}/cash-activity?page=1&per_page=1`,
  { token: admin },
);
check(cashActivity.page, 1, 'party cash activity has its own page');
check(cashActivity.per_page, 1, 'party cash activity has its own page size');
check(cashActivity.total > 1, true, 'party cash activity reports its own total');

const ledgerEntries = await allPages('/admin/ledger/entries', admin);
const numberPattern = /^([A-Z][A-Z-]+)-(\d{4})-(\d{6})$/;
const documentNumbers = new Set();
function collectNumbers(value) {
  if (typeof value === 'string' && numberPattern.test(value)) {
    documentNumbers.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(collectNumbers);
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(collectNumbers);
  }
}
operationResponses.forEach(collectNumbers);
ledgerEntries.forEach(collectNumbers);
const series = new Map();
for (const value of documentNumbers) {
  const [, prefix, year, sequence] = numberPattern.exec(value);
  const key = `${prefix}-${year}`;
  const values = series.get(key) ?? [];
  values.push(Number(sequence));
  series.set(key, values);
}
for (const [key, values] of series) {
  values.sort((left, right) => left - right);
  check(
    values,
    Array.from({ length: values.at(-1) }, (_, index) => index + 1),
    `${key} document numbers are sequential without gaps`,
  );
}
check(
  series.size > 5,
  true,
  'closing day exercises multiple numbered document series',
);

const beforeReplay = {
  trial,
  lots,
  custodyOverview,
  supplierBalances,
  unallocated,
  reconciliation,
  documentNumbers: [...documentNumbers].sort(),
};
for (const [index, replay] of operationRequests.entries()) {
  const result = await request(replay.path, replay);
  check(
    result,
    operationResponses[index],
    `${replay.body.operation_id} replay returns the original response`,
  );
}
const afterReplayTrial = await request('/admin/ledger/trial-balance', {
  token: admin,
});
const afterReplayLots = await allPages('/admin/inventory/lots', admin);
const afterReplayCustody = await allPages(
  '/admin/delivery-parties/custody-overview',
  admin,
);
const afterReplaySuppliers = await request('/admin/suppliers/balances', {
  token: admin,
});
const afterReplayUnallocated = await allPages(
  '/admin/cash-receipts/unallocated',
  admin,
);
const afterReplayReconciliation = await request(
  '/admin/cash-receipts/reconciliation',
  { token: admin },
);
const afterReplayEntries = await allPages('/admin/ledger/entries', admin);
const afterNumbers = new Set();
for (const entry of afterReplayEntries) {
  if (numberPattern.test(entry.document_number))
    afterNumbers.add(entry.document_number);
}
check(
  afterReplayTrial,
  beforeReplay.trial,
  'operation replays do not change the trial balance',
);
check(
  afterReplayLots,
  beforeReplay.lots,
  'operation replays do not change warehouse lots',
);
check(
  afterReplayCustody,
  beforeReplay.custodyOverview,
  'operation replays do not change party custody',
);
check(
  afterReplaySuppliers,
  beforeReplay.supplierBalances,
  'operation replays do not change supplier balances',
);
check(
  afterReplayUnallocated,
  beforeReplay.unallocated,
  'operation replays do not change receipt remainders',
);
check(
  afterReplayReconciliation,
  beforeReplay.reconciliation,
  'operation replays do not change receipt reconciliation',
);
check(
  [...afterNumbers].sort(),
  beforeReplay.documentNumbers.filter((value) => value.startsWith('JRN-')),
  'operation replays issue no new journal document numbers',
);

console.log(
  `Phase-8 closing acceptance passed (${assertions} assertions, ${operationRequests.length} operation replays).`,
);
