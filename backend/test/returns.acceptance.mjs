import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(process.env.ACCEPTANCE_DATABASE_NAME ?? '')) {
  throw new Error('Returns acceptance requires the runner-owned disposable database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') throw new Error('Returns acceptance requires the loopback API');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
}
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
  const challenge = await request('/auth/request-otp', { method: 'POST', body: { phone }, expected: 201 });
  const session = await request('/auth/verify-otp', { method: 'POST', body: { phone, code: challenge.dev_otp }, expected: 201 });
  return session.access_token;
}
async function scalar(sql, values = []) {
  const result = await db.query(sql, values);
  return result.rows[0]?.value;
}

try {
  const customer = await login('+9647700000006');
  const admin = await login('+9647700000001');
  const other = await login('+9647700099977');
  const customerId = await scalar("SELECT id AS value FROM users WHERE phone = '+9647700000006'");
  const [seedDemo, ownOrders] = await Promise.all([
    request('/returns', { token: customer }),
    request('/orders?per_page=100', { token: customer }),
  ]);
  const seeded = seedDemo.data.find((entry) => entry.status === 'completed' && entry.reason === 'Seeded partial return');
  assert.ok(seeded, 'seeded completed return is visible to owner'); assertions++;
  check(seeded.items.find((entry) => entry.condition === 'sellable')?.restock, true, 'seed sellable line restocks');
  check(seeded.items.find((entry) => entry.condition === 'damaged')?.restock, false, 'seed damaged line does not restock');
  check(seeded.refund.status, 'obligation', 'seed COD obligation');
  check(Number(await scalar('SELECT count(*)::int AS value FROM stock_movements WHERE return_item_id = $1', [seeded.items.find((entry) => entry.condition === 'sellable').id])), 1, 'seed movement is linked to return line');
  await request('/returns/queue', { token: customer, expected: 403 });
  const queue = await request('/returns/queue', { token: admin });
  check(queue.data.some((entry) => entry.id === seeded.id), true, 'staff queue contains seed return');

  const orderId = randomUUID();
  const firstId = randomUUID();
  const secondId = randomUUID();
  const deliveryId = randomUUID();
  const productA = '40000000-0000-4000-8000-000000000001';
  const productB = '40000000-0000-4000-8000-000000000002';
  const variantA = '50000000-0000-4000-8000-000000000001';
  const variantB = '50000000-0000-4000-8000-000000000003';
  const batchA = '70000000-0000-4000-8000-000000000001';
  const location = '90000000-0000-4000-8000-000000000002';
  await db.query('BEGIN');
  try {
    await db.query(`INSERT INTO orders (id,user_id,order_number,status,payment_method,subtotal,delivery_fee,discount,total,delivery_contact_phone,delivery_city)
      VALUES ($1,$2,$3,'delivered','cod',35.79,0,0,35.79,'+9647700090006','Baghdad')`, [orderId, customerId, `VERIFY-RETURN-${orderId.slice(0, 8)}`]);
    await db.query(`INSERT INTO order_items (id,order_id,product_id,variant_id,product_name_ar,product_name_en,quantity,unit_price,line_total)
      VALUES ($1,$2,$3,$4,'Test product A','Test product A',3,10.08,30.24),($5,$2,$6,$7,'Test product B','Test product B',1,5.55,5.55)`, [firstId, orderId, productA, variantA, secondId, productB, variantB]);
    await db.query("INSERT INTO deliveries (id,order_id,status,delivery_fee,dispatched_at,delivered_at) VALUES ($1,$2,'delivered',0,now(),now())", [deliveryId, orderId]);
    await db.query('UPDATE orders SET delivery_id=$1 WHERE id=$2', [deliveryId, orderId]);
    await db.query("INSERT INTO stock_reservations (order_id,order_item_id,batch_id,location_id,quantity,status) VALUES ($1,$2,$3,$4,3,'consumed')", [orderId, firstId, batchA, location]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  const stockBefore = Number(await scalar('SELECT quantity AS value FROM batch_stock WHERE batch_id=$1 AND location_id=$2', [batchA, location]));
  const line = (order_item_id, quantity, reason = 'Not needed') => ({ order_item_id, quantity, reason });
  const open = (items, expected = 201, order_id = orderId, token = customer) => request('/returns', { method: 'POST', token, expected, body: { order_id, items } });
  await open([], 422);
  await open([line(firstId, 1)], 409, ownOrders.data.find((order) => order.order_number === 'DEV-ORDER-3').id);
  await open([line(firstId, 1)], 404, orderId, other);
  await open([line(firstId, 4)], 422);
  const first = await open([line(firstId, 1), line(secondId, 1, 'Damaged in transit')]);
  check(first.status, 'requested', 'return begins requested');
  check(first.expected_refund, 15.63, 'expected refund uses snapshot cents');
  await request(`/returns/${first.id}/inspect`, { token: customer, method: 'POST', expected: 403, body: { decision: 'reject' } });
  const firstA = first.items.find((entry) => entry.order_item_id === firstId);
  const firstB = first.items.find((entry) => entry.order_item_id === secondId);
  const reviewed = await request(`/returns/${first.id}/inspect`, { token: admin, method: 'POST', body: {
    decision: 'approve', items: [
      { return_item_id: firstA.id, approved_quantity: 1, condition: 'sellable' },
      { return_item_id: firstB.id, approved_quantity: 1, condition: 'damaged' },
    ],
  } });
  check(reviewed.status, 'approved', 'all requested units approved');
  check(reviewed.refund_amount, 15.63, 'approved refund uses immutable snapshots');
  check(reviewed.refund.amount, 15.63, 'ledger amount matches approved units');
  check(reviewed.refund.status, 'obligation', 'COD refund stays an obligation');
  check(Number(await scalar('SELECT quantity AS value FROM batch_stock WHERE batch_id=$1 AND location_id=$2', [batchA, location])), stockBefore + 1, 'sellable return increases batch stock');
  check(Number(await scalar('SELECT count(*)::int AS value FROM stock_movements WHERE return_item_id=$1', [firstA.id])), 1, 'sellable line has one movement');
  check(Number(await scalar('SELECT count(*)::int AS value FROM stock_movements WHERE return_item_id=$1', [firstB.id])), 0, 'damaged line has no movement');
  check(await scalar('SELECT batch_id AS value FROM stock_movements WHERE return_item_id=$1', [firstA.id]), batchA, 'originating batch receives stock');
  await request(`/returns/${first.id}/inspect`, { token: admin, method: 'POST', expected: 409, body: { decision: 'reject' } });
  check((await request(`/returns/${first.id}/complete`, { token: admin, method: 'POST' })).status, 'completed', 'staff completes review');
  check(await scalar('SELECT status AS value FROM orders WHERE id=$1', [orderId]), 'delivered', 'partial return leaves order delivered');

  await open([line(firstId, 3)], 422);
  const second = await open([line(firstId, 2)]);
  await open([line(firstId, 1)], 422);
  const partially = await request(`/returns/${second.id}/inspect`, { token: admin, method: 'POST', body: {
    decision: 'approve', items: [{ return_item_id: second.items[0].id, approved_quantity: 1, condition: 'opened' }],
  } });
  check(partially.status, 'partially_approved', 'line can be partly approved');
  check(partially.refund_amount, 10.08, 'refund excludes rejected unit');
  check(Number(await scalar('SELECT count(*)::int AS value FROM stock_movements WHERE return_item_id=$1', [second.items[0].id])), 0, 'opened line does not restock');
  await request(`/returns/${second.id}/complete`, { token: admin, method: 'POST' });
  await open([line(firstId, 2)], 422);
  const rejected = await open([line(firstId, 1)]);
  const beforeRejected = Number(await scalar('SELECT count(*)::int AS value FROM refund_ledger WHERE order_id=$1', [orderId]));
  const no = await request(`/returns/${rejected.id}/inspect`, { token: admin, method: 'POST', body: { decision: 'reject' } });
  check(no.status, 'rejected', 'whole request rejected');
  check(no.refund, null, 'rejected return has no ledger');
  check(Number(await scalar('SELECT count(*)::int AS value FROM refund_ledger WHERE order_id=$1', [orderId])), beforeRejected, 'rejection creates no refund');
  check(Number(await scalar('SELECT count(*)::int AS value FROM stock_movements WHERE return_item_id=$1', [rejected.items[0].id])), 0, 'rejection creates no stock movement');
  await request(`/returns/${rejected.id}/complete`, { token: admin, method: 'POST' });
  const final = await open([line(firstId, 1)]);
  await request(`/returns/${final.id}/inspect`, { token: admin, method: 'POST', body: {
    decision: 'approve', items: [{ return_item_id: final.items[0].id, approved_quantity: 1, condition: 'sellable' }],
  } });
  await request(`/returns/${final.id}/complete`, { token: admin, method: 'POST' });
  check(await scalar('SELECT status AS value FROM orders WHERE id=$1', [orderId]), 'returned', 'all returned units advance order');
  check(await scalar('SELECT status AS value FROM deliveries WHERE id=$1', [deliveryId]), 'returned', 'delivery follows fully returned order');
  check(Number(await scalar("SELECT count(*)::int AS value FROM audit_logs WHERE action='refund.obligation' AND entity_id IN (SELECT id FROM refund_ledger WHERE order_id=$1)", [orderId])), 3, 'every approved refund is audited');
  check(Number(await scalar("SELECT count(*)::int AS value FROM audit_logs WHERE action='return.restock' AND entity_id IN (SELECT id FROM stock_movements WHERE return_item_id IN (SELECT id FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE order_id=$1)))", [orderId])), 2, 'every restock movement is audited');
  console.log(`Returns acceptance: ${assertions} assertions passed (disposable database)`);
} finally {
  await db.end();
}
