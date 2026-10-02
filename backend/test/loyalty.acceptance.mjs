import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(process.env.ACCEPTANCE_DATABASE_NAME ?? '')) {
  throw new Error('Loyalty acceptance requires a disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') throw new Error('Loyalty acceptance requires the loopback API');
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
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}
async function login(phone) {
  const challenge = await request('/auth/request-otp', { method: 'POST', body: { phone }, expected: 200 });
  return (await request('/auth/verify-otp', { method: 'POST', body: { phone, code: challenge.dev_otp }, expected: 200 })).access_token;
}
async function adminLogin() {
  return (await request('/admin/auth/login', { method: 'POST', body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' }, expected: 201 })).access_token;
}
async function value(sql, values = []) {
  return (await db.query(sql, values)).rows[0]?.value;
}

try {
  const customer = await login('+9647700000006');
  const admin = await adminLogin();
  const agent = await login('+9647700000005');
  const other = await login('+9647700099988');
  const userId = await value("SELECT id AS value FROM users WHERE phone='+9647700000006'");
  const orders = (await request('/orders?per_page=100', { token: customer })).data;
  const undelivered = orders.find((order) => order.order_number === 'DEV-ORDER-3');
  const seededDelivered = orders.find((order) => order.order_number === 'DEV-ORDER-4');
  assert.ok(undelivered?.delivery_id && seededDelivered?.id, 'seeded order fixtures exist'); assertions++;
  const before = await request('/loyalty?per_page=1', { token: customer });
  check(before.ledger.length, 1, 'loyalty history is paginated');
  check(before.ledger.some((entry) => entry.order_id === undelivered.id), false, 'undelivered order has not earned');
  check(Number(await value("SELECT count(*)::int AS value FROM loyalty_ledger WHERE order_id=$1 AND type='earn'", [undelivered.id])), 0, 'undelivered order has no DB earn');
  check(Number(await value("SELECT count(*)::int AS value FROM loyalty_ledger WHERE order_id=$1 AND type='earn'", [seededDelivered.id])), 1, 'seeded delivered order earned once');
  check(Number(await value("SELECT count(*)::int AS value FROM loyalty_ledger WHERE account_id=(SELECT id FROM loyalty_accounts WHERE user_id=$1) AND type='redeem'", [userId])) >= 1, true, 'seeded customer has a redemption');
  const allBefore = await request('/loyalty?per_page=100', { token: customer });
  check(allBefore.points_balance, allBefore.ledger.reduce((sum, entry) => sum + entry.points, 0), 'balance is ledger sum');

  await request(`/deliveries/${undelivered.delivery_id}`, {
    token: agent, method: 'PATCH', body: { status: 'delivered', order_version: undelivered.version },
  });
  await request(`/deliveries/${undelivered.delivery_id}`, {
    token: agent, method: 'PATCH', body: { status: 'delivered', order_version: undelivered.version }, expected: 409,
  });
  check(Number(await value("SELECT count(*)::int AS value FROM loyalty_ledger WHERE order_id=$1 AND type='earn'", [undelivered.id])), 1, 'delivered order credits exactly once');
  const expectedEarn = Number(await value('SELECT floor(greatest(subtotal-discount,0))::int AS value FROM orders WHERE id=$1', [undelivered.id]));
  check(Number(await value("SELECT points AS value FROM loyalty_ledger WHERE order_id=$1 AND type='earn'", [undelivered.id])), expectedEarn, 'earn rate uses order snapshot, excluding delivery fee');
  check(Number(await value("SELECT count(*)::int AS value FROM audit_logs WHERE action='loyalty.earn' AND entity_id=(SELECT id FROM loyalty_ledger WHERE order_id=$1 AND type='earn')", [undelivered.id])), 1, 'earn writes audit record');

  const afterEarn = await request('/loyalty?per_page=100', { token: customer });
  check(afterEarn.points_balance, allBefore.points_balance + expectedEarn, 'delivery increases balance by earned points');
  const otherBalance = await request('/loyalty', { token: other });
  check(otherBalance.points_balance, 0, 'other customer sees only own balance');
  await request(`/admin/loyalty/${userId}`, { token: other, expected: 403 });
  await request(`/admin/loyalty/${userId}/adjust`, { token: other, method: 'POST', body: { points: 5, reason: 'spoof' }, expected: 403 });
  await request('/loyalty/redeem', { token: other, method: 'POST', body: { user_id: userId, points: 1 }, expected: 422 });
  await request('/loyalty/redeem', { token: customer, method: 'POST', body: { points: 0 }, expected: 422 });
  await request('/loyalty/redeem', { token: customer, method: 'POST', body: { points: -1 }, expected: 422 });
  await request('/loyalty/redeem', { token: customer, method: 'POST', body: { points: afterEarn.points_balance + 1 }, expected: 409 });
  const redeemed = await request('/loyalty/redeem', { token: customer, method: 'POST', expected: 201, body: { points: 1, note: 'Acceptance spend' } });
  check(redeemed.entry.points, -1, 'redeem writes a negative delta');
  check(redeemed.points_balance, afterEarn.points_balance - 1, 'redeem lowers balance');
  check(redeemed.redemption_value, 1, 'server computes whole-IQD redemption value');
  const staffRead = await request(`/admin/loyalty/${userId}?per_page=100`, { token: admin });
  check(staffRead.points_balance, redeemed.points_balance, 'staff sees customer ledger balance');
  await request(`/admin/loyalty/${userId}/adjust`, { token: admin, method: 'POST', body: { points: -(redeemed.points_balance + 1), reason: 'Too large' }, expected: 409 });
  await request(`/admin/loyalty/${userId}/adjust`, { token: admin, method: 'POST', body: { points: 0, reason: 'Zero' }, expected: 422 });
  await request(`/admin/loyalty/${userId}/adjust`, { token: admin, method: 'POST', body: { points: 1, reason: '   ' }, expected: 422 });
  const raised = await request(`/admin/loyalty/${userId}/adjust`, { token: admin, method: 'POST', expected: 201, body: { points: 5, reason: 'Service recovery' } });
  check(raised.entry.type, 'adjust', 'staff adjustment uses ledger type');
  check(raised.points_balance, redeemed.points_balance + 5, 'positive adjustment increases balance');
  const lowered = await request(`/admin/loyalty/${userId}/adjust`, { token: admin, method: 'POST', expected: 201, body: { points: -2, reason: 'Correction' } });
  check(lowered.points_balance, raised.points_balance - 2, 'negative adjustment decreases balance');
  check(Number(await value('SELECT count(*)::int AS value FROM audit_logs WHERE entity_id=$1 AND action=$2', [lowered.entry.id, 'loyalty.adjust'])), 1, 'staff adjustment is audited');
  const final = await request('/loyalty?per_page=100', { token: customer });
  const ledgerSum = Number(await value('SELECT coalesce(sum(points),0)::int AS value FROM loyalty_ledger WHERE account_id=(SELECT id FROM loyalty_accounts WHERE user_id=$1)', [userId]));
  check(final.points_balance, ledgerSum, 'balance equals DB ledger sum after earn, redeem, adjust');
  check(final.points_balance, final.ledger.reduce((sum, entry) => sum + entry.points, 0), 'API history sums to balance');
  check(Number(await value("SELECT count(*)::int AS value FROM information_schema.columns WHERE table_name='loyalty_accounts' AND column_name='points_balance'")), 0, 'no mutable cached balance column remains');
  await assert.rejects(db.query('UPDATE loyalty_ledger SET points=999 WHERE id=$1', [lowered.entry.id]), /append-only/); assertions++;
  await assert.rejects(db.query('DELETE FROM loyalty_ledger WHERE id=$1', [lowered.entry.id]), /append-only/); assertions++;

  const productId = '40000000-0000-4000-8000-000000000003';
  const product = await request(`/admin/products/${productId}`, { token: admin });
  check(Object.hasOwn(product, 'is_negotiable'), false, 'negotiation flag is removed');
  check(Object.hasOwn(product, 'points_price'), false, 'negotiation points cost is removed');
  check(Object.hasOwn(product, 'floor_price'), false, 'negotiation floor is removed');
  await request(`/admin/products/${productId}`, { token: admin, method: 'PATCH', body: { floor_price: product.price + 1 }, expected: 422 });
  await request(`/admin/products/${productId}`, { token: admin, method: 'PATCH', body: { points_price: -1 }, expected: 422 });
  check(Number(await value("SELECT count(*)::int AS value FROM information_schema.columns WHERE table_name='products' AND column_name IN ('is_negotiable','floor_price','points_price')")), 0, 'negotiation columns are removed from storage');
  console.log(`Loyalty acceptance: ${assertions} assertions passed (disposable database)`);
} finally {
  await db.end();
}
