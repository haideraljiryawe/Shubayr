import assert from 'node:assert/strict';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Run acceptance through npm run test:acceptance (isolated *_verify database required)',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1' || !new URL(api).port) {
  throw new Error('Acceptance requires the runner-owned loopback API URL');
}
const otp = process.env.DEV_OTP ?? '000000';
let assertions = 0;

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
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

async function login(phone) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone },
    expected: 200,
  });
  check(
    challenge.dev_otp,
    otp,
    'development OTP must be known only in development',
  );
  return request('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: challenge.dev_otp },
    expected: 200,
  });
}

function adminLogin() {
  return request('/admin/auth/login', {
    method: 'POST', body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' }, expected: 201,
  });
}

const admin = await adminLogin();
const customer = await login('+9647700000006');
const seededOrders = await request('/orders?per_page=100', {
  token: customer.access_token,
});
for (const status of ['pending', 'confirmed', 'dispatched', 'delivered']) {
  const sample = seededOrders.data.find(
    (order) =>
      order.order_number.startsWith('DEV-ORDER-') && order.status === status,
  );
  assert.ok(sample, `seeded ${status} order must be visible to the customer`);
  assertions += 1;
  assert.ok(
    sample.delivery_id &&
      sample.items[0]?.product_name_en &&
      sample.items[0]?.image_url,
    `${status} seed needs delivery and immutable line snapshots`,
  );
  assertions += 1;
}
const deliveredSample = seededOrders.data.find(
  (order) => order.order_number === 'DEV-ORDER-4',
);
check(
  deliveredSample.items[0].reviewed,
  true,
  'delivered seed shows reviewed signal',
);
const productId = '40000000-0000-4000-8000-000000000001';
await request(`/admin/products/${productId}`, {
  method: 'PATCH',
  token: admin.access_token,
  body: { price: 20.15 },
});
const product = await request(`/products/${productId}`);
check(
  product.effective_price,
  10.08,
  'seeded active 50% discount must round 20.15 to 10.08',
);
const variant = product.variants.find((entry) => entry.sku === 'SEED-001-STD');
assert.ok(variant, 'seeded standard variant must exist');
assertions += 1;

// Make the test repeatable against a developer's already-used customer cart.
const existing = await request('/cart', { token: customer.access_token });
for (const item of existing.items) {
  await request(`/cart/items/${item.id}`, {
    method: 'DELETE',
    token: customer.access_token,
    expected: 204,
  });
}
await request('/cart/items', {
  method: 'POST',
  token: customer.access_token,
  expected: 422,
  body: {
    product_id: productId,
    variant_id: variant.id,
    quantity: 2,
    unit_price: 0.01,
  },
});
const initialCart = await request('/cart/items', {
  method: 'POST',
  token: customer.access_token,
  body: { product_id: productId, variant_id: variant.id, quantity: 2 },
});
check(
  initialCart.items[0].unit_price,
  10.08,
  'cart must use server price, not client price',
);
check(initialCart.subtotal, 20.16, 'line totals must use rounded money');

await request(`/admin/products/${productId}`, {
  method: 'PATCH',
  token: admin.access_token,
  body: { price: 30.15 },
});
const repricedCart = await request('/cart', { token: customer.access_token });
check(
  repricedCart.items[0].unit_price,
  15.08,
  'cart must reprice after catalog change',
);
check(repricedCart.subtotal, 30.16, 'repriced quantity two subtotal');
await request('/coupons/validate', {
  method: 'POST',
  token: customer.access_token,
  body: { code: 'SHUBAYR10' },
});
const couponCart = await request('/cart', { token: customer.access_token });
check(couponCart.coupon_code, 'SHUBAYR10', 'seeded live coupon must apply');
check(couponCart.discount, 3.02, '10% coupon uses shared half-away rounding');
check(couponCart.total, 27.14, 'checkout preview total includes coupon');
const withoutCoupon = await request('/cart/coupon', {
  method: 'DELETE',
  token: customer.access_token,
});
check(withoutCoupon.coupon_code, null, 'remove detaches coupon');
check(withoutCoupon.discount, 0, 'remove clears coupon discount');
check(withoutCoupon.total, 30.16, 'remove restores undiscounted total');
const repeatedRemoval = await request('/cart/coupon', {
  method: 'DELETE',
  token: customer.access_token,
});
check(repeatedRemoval.total, 30.16, 'removing twice is safe');
await request('/coupons/validate', {
  method: 'POST',
  token: customer.access_token,
  body: { code: 'SHUBAYR10' },
});

const address = await request('/addresses', {
  method: 'POST',
  token: customer.access_token,
  expected: 201,
  body: {
    label: 'Acceptance',
    city: 'Baghdad',
    area: 'Karrada',
    contact_phone: '+9647700080006',
  },
});
const orderCountBefore = (
  await request('/orders', { token: customer.access_token })
).total;
const stockBefore = await request(`/products/${productId}/availability`);
const key = `order-acceptance-${Date.now()}`;
const body = { address_id: address.id, payment_method: 'cod' };
const placed = await request('/orders', {
  method: 'POST',
  token: customer.access_token,
  headers: { 'Idempotency-Key': key },
  body,
  expected: 201,
});
check(placed.status, 'pending', 'new COD order starts pending');
check(placed.items[0].unit_price, 15.08, 'checkout snaps current server price');
check(placed.items[0].line_total, 30.16, 'checkout snaps line total');
check(placed.total, 27.14, 'checkout recomputes coupon-inclusive total');
check(
  placed.delivery_contact_phone,
  '+9647700080006',
  'checkout snaps address contact phone',
);
check(
  placed.items[0].product_name_en,
  product.name_en,
  'checkout snaps product name',
);
check(
  placed.items[0].image_url,
  product.images[0].url,
  'checkout snaps primary image',
);
assert.ok(placed.delivery_id, 'checkout must create a delivery record');
assertions += 1;

const replay = await request('/orders', {
  method: 'POST',
  token: customer.access_token,
  headers: { 'Idempotency-Key': key },
  body,
  expected: 201,
});
check(replay.id, placed.id, 'same idempotency key must return same order');
const countAfter = (await request('/orders', { token: customer.access_token }))
  .total;
check(
  countAfter,
  orderCountBefore + 1,
  'double POST creates exactly one order',
);
await request('/orders', {
  method: 'POST',
  token: customer.access_token,
  headers: { 'Idempotency-Key': key },
  body: { ...body, coupon_code: 'SHUBAYR10' },
  expected: 409,
});
const listed = await request('/orders?status=pending&per_page=100', {
  token: customer.access_token,
});
check(
  listed.data.some((order) => order.id === placed.id),
  true,
  'new order appears in user-scoped list',
);
const tracked = await request(`/orders/${placed.id}/track`, {
  token: customer.access_token,
});
check(
  tracked.events.map((event) => event.status),
  ['pending'],
  'tracking starts with pending event',
);
const stockAfter = await request(`/products/${productId}/availability`);
const variantStock = (stock) =>
  stock.variants.find((entry) => entry.variant_id === variant.id).available_qty;
check(
  variantStock(stockAfter),
  variantStock(stockBefore) - 2,
  'placement reduces sellable stock',
);

await request(`/admin/products/${productId}`, {
  method: 'PATCH',
  token: admin.access_token,
  body: { price: 50.15 },
});
const snapshot = await request(`/orders/${placed.id}`, {
  token: customer.access_token,
});
check(
  snapshot.items[0].unit_price,
  15.08,
  'later catalog price edits cannot rewrite order price',
);
check(
  snapshot.items[0].product_name_en,
  product.name_en,
  'later catalog edits cannot rewrite name',
);
await request(`/addresses/${address.id}`, {
  method: 'DELETE',
  token: customer.access_token,
  expected: 204,
});
const afterAddressDelete = await request(`/orders/${placed.id}`, {
  token: customer.access_token,
});
check(
  afterAddressDelete.address_id,
  null,
  'deleted address reference is cleared',
);
check(
  afterAddressDelete.delivery_city,
  'Baghdad',
  'address deletion retains immutable snapshot',
);
check(
  afterAddressDelete.delivery_contact_phone,
  '+9647700080006',
  'contact snapshot remains immutable',
);

await request(`/orders/${placed.id}/status`, {
  method: 'PATCH',
  token: customer.access_token,
  body: { status: 'confirmed' },
  expected: 403,
});
const otherCustomer = await login('+9647700099999');
await request(`/orders/${placed.id}`, {
  token: otherCustomer.access_token,
  expected: 403,
});
await request(`/orders/${placed.id}/track`, {
  token: otherCustomer.access_token,
  expected: 403,
});
const confirmed = await request(`/orders/${placed.id}/status`, {
  method: 'PATCH',
  token: admin.access_token,
  body: { status: 'confirmed' },
});
check(confirmed.status, 'confirmed', 'admin may advance the order');
const cancelled = await request(`/orders/${placed.id}/cancel`, {
  method: 'POST',
  token: customer.access_token,
});
check(cancelled.status, 'cancelled', 'customer may cancel a confirmed order');
const finalTrack = await request(`/orders/${placed.id}/track`, {
  token: customer.access_token,
});
check(
  finalTrack.events.map((event) => event.status),
  ['pending', 'confirmed', 'cancelled'],
  'tracking records each transition',
);
const stockRestored = await request(`/products/${productId}/availability`);
check(
  variantStock(stockRestored),
  variantStock(stockBefore),
  'cancellation releases simple stock hold',
);

console.log(`COD order acceptance passed (${assertions} assertions).`);
