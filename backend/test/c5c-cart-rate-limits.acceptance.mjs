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

let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

async function request(
  path,
  {
    token,
    method = 'GET',
    body,
    expected = 200,
    forwardedFor,
    idempotencyKey,
  } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}

// The runner reaches the API from loopback, which is deliberately configured
// as a trusted store proxy. Each forwarded shopper therefore gets a separate
// generous catalog bucket; the server itself is never exempt.
await Promise.all(
  Array.from({ length: 300 }, (_, index) =>
    request('/settings', {
      forwardedFor: `198.51.${Math.floor(index / 250)}.${(index % 250) + 1}`,
    }),
  ),
);

const otpShopper = '203.0.113.70';
for (let attempt = 0; attempt < 30; attempt += 1) {
  await request('/auth/request-otp', {
    method: 'POST',
    forwardedFor: otpShopper,
    body: { phone: '+9647700085070' },
  });
}
await request('/auth/request-otp', {
  method: 'POST',
  forwardedFor: otpShopper,
  body: { phone: '+9647700085070' },
  expected: 429,
});

const customerIp = '203.0.113.71';
const challenge = await request('/auth/request-otp', {
  method: 'POST',
  forwardedFor: customerIp,
  body: { phone: '+9647700000006' },
});
const customer = await request('/auth/verify-otp', {
  method: 'POST',
  forwardedFor: customerIp,
  body: { phone: '+9647700000006', code: challenge.dev_otp },
});
const token = customer.access_token;
const product = await request(
  '/products/40000000-0000-4000-8000-000000000001',
  {
    forwardedFor: customerIp,
  },
);
const variant = product.variants.find((item) => item.sku === 'SEED-001-STD');
assert.ok(variant, 'seeded cart variant must exist');
assertions += 1;

async function clearCart() {
  const cart = await request('/cart', { token, forwardedFor: customerIp });
  for (const item of cart.items) {
    await request(`/cart/items/${item.id}`, {
      token,
      method: 'DELETE',
      forwardedFor: customerIp,
      expected: 204,
    });
  }
}

const line = (quantity) => ({
  product_id: product.id,
  variant_id: variant.id,
  quantity,
});

await clearCart();
const doubleKey = `c5c-double-${Date.now()}`;
await request('/cart/items', {
  token,
  method: 'POST',
  forwardedFor: customerIp,
  idempotencyKey: doubleKey,
  body: line(2),
});
const repeatedAdd = await request('/cart/items', {
  token,
  method: 'POST',
  forwardedFor: customerIp,
  idempotencyKey: doubleKey,
  body: line(2),
});
check(
  repeatedAdd.items[0].quantity,
  2,
  'same add-to-cart idempotency key does not add the line twice',
);

await clearCart();
const mergeKey = `c5c-merge-${Date.now()}`;
const addKey = `c5c-concurrent-add-${Date.now()}`;
await Promise.all([
  request('/cart/merge', {
    token,
    method: 'POST',
    forwardedFor: customerIp,
    idempotencyKey: mergeKey,
    body: { items: [line(2)] },
  }),
  request('/cart/items', {
    token,
    method: 'POST',
    forwardedFor: customerIp,
    idempotencyKey: addKey,
    body: line(3),
  }),
]);
const concurrentResult = await request('/cart', {
  token,
  forwardedFor: customerIp,
});
check(
  concurrentResult.items[0].quantity,
  5,
  'atomic guest merge retains a concurrent signed-in add exactly once',
);

await request('/cart/merge', {
  token,
  method: 'POST',
  forwardedFor: customerIp,
  idempotencyKey: mergeKey,
  body: { items: [line(2)] },
});
const secondMergeReplay = await request('/cart/merge', {
  token,
  method: 'POST',
  forwardedFor: customerIp,
  idempotencyKey: mergeKey,
  body: { items: [line(2)] },
});
check(
  secondMergeReplay.items[0].quantity,
  5,
  'replaying a guest merge twice leaves the merged quantity unchanged',
);
const reused = await request('/cart/merge', {
  token,
  method: 'POST',
  forwardedFor: customerIp,
  idempotencyKey: mergeKey,
  body: { items: [line(4)] },
  expected: 409,
});
check(
  reused.code,
  'IDEMPOTENCY_KEY_REUSED',
  'a cart key cannot be reused for a different merge payload',
);

console.log(`C5c cart/rate-limit acceptance: ${assertions} assertions`);
