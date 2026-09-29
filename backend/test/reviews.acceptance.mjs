import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(process.env.ACCEPTANCE_DATABASE_NAME ?? '')) {
  throw new Error('Reviews acceptance requires the runner-owned disposable database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') throw new Error('Reviews acceptance requires the loopback API');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions++; }
async function request(path, { token, method = 'GET', body, expected = 200 } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const content = await response.text();
  const payload = content ? JSON.parse(content) : undefined;
  check(response.status, expected, `${method} ${path}: ${content}`);
  return payload;
}
async function login(phone) {
  const challenge = await request('/auth/request-otp', { method: 'POST', expected: 200, body: { phone } });
  return (await request('/auth/verify-otp', { method: 'POST', expected: 200, body: { phone, code: challenge.dev_otp } })).access_token;
}
async function adminLogin() {
  return (await request('/admin/auth/login', { method: 'POST', expected: 201, body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' } })).access_token;
}
async function value(sql, args = []) { return (await db.query(sql, args)).rows[0]?.value; }

try {
  const customer = await login('+9647700000006');
  const admin = await adminLogin();
  const other = await login('+9647700099966');
  const customerId = await value("SELECT id AS value FROM users WHERE phone='+9647700000006'");
  const otherId = await value("SELECT id AS value FROM users WHERE phone='+9647700099966'");
  const productId = '40000000-0000-4000-8000-000000000004';
  const anotherProduct = '40000000-0000-4000-8000-000000000005';
  const otherReviewId = randomUUID();
  await db.query(`INSERT INTO product_reviews (id,product_id,user_id,rating,comment,status)
    VALUES ($1,$2,$3,2,'Another customer rejected review','rejected')`, [otherReviewId, anotherProduct, otherId]);
  const initialMine = await request('/me/reviews?per_page=100', { token: customer });
  check(initialMine.total, 2, 'caller starts with seeded pending and published reviews');
  check(
    new Set(initialMine.data.map(({ status }) => status)),
    new Set(['pending', 'published']),
    'own review history includes every seeded moderation state',
  );
  check(initialMine.data.some(({ id }) => id === otherReviewId), false, 'own history excludes another customer');
  check(
    initialMine.data.every(({ user_id }) => user_id === customerId),
    true,
    'every returned review belongs to the caller',
  );
  check(
    initialMine.data.every(({ product }) => product.id && product.name_en && product.name_ar),
    true,
    'own history includes current product identity and names',
  );
  const minePageOne = await request('/me/reviews?page=1&per_page=1', { token: customer });
  const minePageTwo = await request('/me/reviews?page=2&per_page=1', { token: customer });
  check(minePageOne.total, 2, 'own review pagination reports the full total');
  check(minePageOne.data[0].id === minePageTwo.data[0].id, false, 'stable paging does not repeat reviews');
  await request('/me/reviews', { token: admin, expected: 403 });
  const product = await request(`/products/${productId}`);
  check(product.rating_avg, 5, 'seeded approved review sets average');
  check(product.rating_count, 1, 'seeded approved review sets count');
  const initialPublic = await request(`/products/${productId}/reviews`);
  check(initialPublic.total, 1, 'public sees only seeded approved review');
  check(initialPublic.data[0].verified_purchase, true, 'published seed carries verified badge');
  const queue = await request('/admin/reviews', { token: admin });
  check(queue.data.some((review) => review.comment === 'Seeded pending verified review'), true, 'seed has a pending moderation item');
  await request('/admin/reviews', { token: customer, expected: 403 });

  const orders = (await request('/orders?per_page=100', { token: customer })).data;
  const undelivered = orders.find((order) => order.order_number === 'DEV-ORDER-5');
  await request(`/products/${undelivered.items[0].product_id}/reviews`, {
    token: customer, method: 'POST', expected: 409,
    body: { order_item_id: undelivered.items[0].id, rating: 4 },
  });

  const orderId = randomUUID();
  const lineId = randomUUID();
  const deliveryId = randomUUID();
  await db.query('BEGIN');
  try {
    await db.query(`INSERT INTO orders (id,user_id,order_number,status,payment_method,subtotal,delivery_fee,discount,total,delivery_contact_phone,delivery_city)
      VALUES ($1,$2,$3,'delivered','cod',10,0,0,10,'+9647700090006','Baghdad')`, [orderId, customerId, `VERIFY-REVIEW-${orderId.slice(0, 8)}`]);
    await db.query(`INSERT INTO order_items (id,order_id,product_id,variant_id,product_name_ar,product_name_en,quantity,unit_price,line_total)
      VALUES ($1,$2,$3,$4,'Review product','Review product',1,10,10)`, [lineId, orderId, productId, '50000000-0000-4000-8000-000000000007']);
    await db.query("INSERT INTO deliveries (id,order_id,status,delivery_fee,dispatched_at,delivered_at) VALUES ($1,$2,'delivered',0,now(),now())", [deliveryId, orderId]);
    await db.query('UPDATE orders SET delivery_id=$1 WHERE id=$2', [deliveryId, orderId]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  const create = (product, rating, token = customer, expected = 201) => request(`/products/${product}/reviews`, {
    token, method: 'POST', expected,
    body: { order_item_id: lineId, rating, comment: 'Acceptance verified purchase' },
  });
  await create(anotherProduct, 4, customer, 404);
  await create(productId, 4, other, 404);
  await create(productId, 0, customer, 422);
  await create(productId, 6, customer, 422);
  const review = await create(productId, 1);
  check(review.status, 'pending', 'new review awaits moderation');
  check(review.verified_purchase, true, 'review is verified purchase');
  check(await value('SELECT reviewed AS value FROM order_items WHERE id=$1', [lineId]), true, 'order item reviewed flag flips true');
  check((await request(`/orders/${orderId}`, { token: customer })).items[0].reviewed, true, 'order API reflects reviewed flag');
  await create(productId, 5, customer, 409);
  await assert.rejects(db.query(`INSERT INTO product_reviews (product_id,user_id,order_item_id,rating,status)
    VALUES ($1,$2,$3,4,'pending')`, [productId, otherId, lineId]), /product_reviews_order_item_id_key/); assertions++;
  await request(`/reviews/${review.id}`, { token: other, method: 'PATCH', expected: 404, body: { rating: 5 } });
  await request(`/reviews/${review.id}`, { token: other, method: 'DELETE', expected: 404 });
  await request(`/admin/reviews/${review.id}/moderate`, { token: customer, method: 'POST', expected: 403, body: { decision: 'publish', reason: 'Valid' } });

  const rejected = await request(`/admin/reviews/${review.id}/moderate`, {
    token: admin, method: 'POST', body: { decision: 'reject', reason: 'Needs revision' },
  });
  check(rejected.status, 'rejected', 'staff can hide review');
  const allMine = await request('/me/reviews?per_page=100', { token: customer });
  check(allMine.total, 3, 'own history includes the newly rejected review');
  check(
    new Set(allMine.data.map(({ status }) => status)),
    new Set(['pending', 'published', 'rejected']),
    'own history returns pending, published, and rejected reviews',
  );
  check(
    allMine.data.find(({ id }) => id === review.id).order_item_id,
    lineId,
    'own history preserves the order-item link',
  );
  check((await request(`/products/${productId}/reviews`)).total, 1, 'rejected review stays hidden');
  check((await request(`/products/${productId}`)).rating_count, 1, 'rejected review does not count');
  check(Number(await value("SELECT count(*)::int AS value FROM audit_logs WHERE action='product_review.moderate' AND entity_id=$1", [review.id])), 1, 'rejection is audited');

  const published = await request(`/admin/reviews/${review.id}/moderate`, {
    token: admin, method: 'POST', body: { decision: 'publish', reason: 'Revised and valid' },
  });
  check(published.status, 'published', 'staff can publish rejected review');
  check((await request(`/products/${productId}/reviews`)).total, 2, 'approved review becomes public');
  const two = await request(`/products/${productId}`);
  check(two.rating_count, 2, 'approved review enters count');
  check(two.rating_avg, 3, 'average of published 5 and 1 is 3');
  const edited = await request(`/reviews/${review.id}`, { token: customer, method: 'PATCH', body: { rating: 3 } });
  check(edited.status, 'pending', 'edited published review returns to pending');
  check(edited.moderated_by, null, 'edit clears prior moderation');
  check((await request(`/products/${productId}/reviews`)).total, 1, 'edited review leaves public reads');
  check((await request(`/products/${productId}`)).rating_avg, 5, 'editing reconciles aggregate');
  await request(`/admin/reviews/${review.id}/moderate`, {
    token: admin, method: 'POST', body: { decision: 'publish', reason: 'Edit approved' },
  });
  const republished = await request(`/products/${productId}`);
  check(republished.rating_count, 2, 'republished review returns to count');
  check(republished.rating_avg, 4, 'average of published 5 and 3 is 4');
  await request(`/reviews/${review.id}`, { token: customer, method: 'DELETE', expected: 204 });
  check(await value('SELECT reviewed AS value FROM order_items WHERE id=$1', [lineId]), false, 'delete clears reviewed flag');
  check((await request(`/orders/${orderId}`, { token: customer })).items[0].reviewed, false, 'order API reflects deletion');
  check((await request(`/products/${productId}/reviews`)).total, 1, 'deleted review leaves public reads');
  const afterDelete = await request(`/products/${productId}`);
  check(afterDelete.rating_count, 1, 'delete reconciles count');
  check(afterDelete.rating_avg, 5, 'delete reconciles average');
  check(Number(await value("SELECT count(*)::int AS value FROM audit_logs WHERE action='product_review.moderate' AND entity_id=$1", [review.id])), 3, 'every moderation decision is audited');
  console.log(`Product review acceptance: ${assertions} assertions passed (disposable database)`);
} finally {
  await db.end();
}
