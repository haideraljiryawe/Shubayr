import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(process.env.ACCEPTANCE_DATABASE_NAME ?? '')) {
  throw new Error('Wishlist acceptance requires the runner-owned disposable database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('Wishlist acceptance requires the loopback API');
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

async function request(path, { token, method = 'GET', body, expected = 200 } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const content = await response.text();
  const payload = content ? JSON.parse(content) : undefined;
  check(response.status, expected, `${method} ${path}: ${content}`);
  return payload;
}

async function login(phone) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST', expected: 201, body: { phone },
  });
  return (await request('/auth/verify-otp', {
    method: 'POST', expected: 201, body: { phone, code: challenge.dev_otp },
  })).access_token;
}

async function adminLogin() {
  return (await request('/admin/auth/login', {
    method: 'POST', expected: 201,
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
  })).access_token;
}

async function value(sql, args = []) {
  return (await db.query(sql, args)).rows[0]?.value;
}

try {
  const customer = await login('+9647700000006');
  const other = await login('+9647700099966');
  const admin = await adminLogin();
  const addedProductId = '40000000-0000-4000-8000-000000000004';
  const discountedProductId = '40000000-0000-4000-8000-000000000001';

  const initial = await request('/wishlist?per_page=100', { token: customer });
  check(initial.total, 3, 'seed contains three wishlist items');
  check(
    initial.data.some(({ product_id }) => product_id === discountedProductId),
    true,
    'seeded wishlist contains the discounted product',
  );

  const publicProduct = await request(`/products/${addedProductId}`);
  const added = await request('/wishlist', {
    token: customer,
    method: 'POST',
    expected: 201,
    body: { product_id: addedProductId },
  });
  check(added.product_id, addedProductId, 'add returns the requested product');
  check(Object.hasOwn(added, 'user_id'), false, 'response does not expose wishlist ownership internals');
  check(
    added.product.effective_price,
    publicProduct.effective_price,
    'add returns the catalog-computed effective price',
  );

  const duplicate = await request('/wishlist', {
    token: customer,
    method: 'POST',
    expected: 201,
    body: { product_id: addedProductId },
  });
  check(duplicate.id, added.id, 'duplicate add returns the existing item');
  check(
    Number(await value(
      'SELECT count(*)::int AS value FROM wishlist_items WHERE user_id=(SELECT id FROM users WHERE phone=$1) AND product_id=$2',
      ['+9647700000006', addedProductId],
    )),
    1,
    'database uniqueness prevents a duplicate row',
  );

  const firstPage = await request('/wishlist?page=1&per_page=2', { token: customer });
  const secondPage = await request('/wishlist?page=2&per_page=2', { token: customer });
  check(firstPage.total, 4, 'pagination total counts all visible wishlist items');
  check(firstPage.data.length, 2, 'first page respects per_page');
  check(secondPage.data.length, 2, 'second page contains the remaining items');
  check(
    new Set([...firstPage.data, ...secondPage.data].map(({ id }) => id)).size,
    4,
    'stable ordering does not repeat items across pages',
  );
  const discounted = [...firstPage.data, ...secondPage.data].find(
    ({ product_id }) => product_id === discountedProductId,
  );
  check(discounted.product.on_sale, true, 'list computes the active sale server-side');
  check(discounted.product.effective_price, 10.08, 'list applies the active discount');

  const otherList = await request('/wishlist?per_page=100', { token: other });
  check(otherList.total, 0, 'another customer cannot read the owner wishlist');
  await request(`/wishlist/${addedProductId}`, {
    token: other, method: 'DELETE', expected: 404,
  });
  check(
    Number(await value('SELECT count(*)::int AS value FROM wishlist_items WHERE id=$1', [added.id])),
    1,
    'another customer cannot remove the owner item',
  );
  await request('/wishlist', { token: admin, expected: 403 });

  const hiddenAncestorId = await value(
    `SELECT parent.id AS value
       FROM products product
       JOIN categories child ON child.id=product.category_id
       JOIN categories parent ON parent.id=child.parent_id
      WHERE product.id=$1`,
    [discountedProductId],
  );
  await db.query('UPDATE categories SET is_visible=false WHERE id=$1', [hiddenAncestorId]);
  const hidden = await request('/wishlist?per_page=100', { token: customer });
  check(hidden.total, 0, 'effectively hidden products are excluded from the total');
  check(
    hidden.data.some(({ product_id }) => product_id === discountedProductId),
    false,
    'a hidden ancestor excludes its descendant product',
  );
  await db.query('UPDATE categories SET is_visible=true WHERE id=$1', [hiddenAncestorId]);

  await request(`/wishlist/${addedProductId}`, {
    token: customer, method: 'DELETE', expected: 204,
  });
  await request(`/wishlist/${addedProductId}`, {
    token: customer, method: 'DELETE', expected: 404,
  });
  check((await request('/wishlist?per_page=100', { token: customer })).total, 3, 'remove updates the list');
  check(
    Number(await value(
      "SELECT count(*)::int AS value FROM audit_logs WHERE entity_id=$1 AND action IN ('wishlist_item.create','wishlist_item.delete')",
      [added.id],
    )),
    2,
    'add and remove are audited once each',
  );
  await request('/wishlist', {
    token: customer, method: 'POST', expected: 422, body: { product_id: 'invalid' },
  });
  console.log(`Wishlist acceptance: ${assertions} assertions passed (disposable database)`);
} finally {
  await db.end();
}
