import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { businessDate } from '../dist/src/modules/finance/business-date.js';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
assert.match(
  process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  /^shubayr_[a-f0-9]{16}_verify$/,
);
assert.equal(new URL(api).hostname, '127.0.0.1');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
}
function tokenFor(userId) {
  const base64 = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64({ alg: 'HS256', typ: 'JWT' })}.${base64({
    sub: userId,
    typ: 'access',
    surface: 'app',
    client: 'web_store',
    ver: 1,
    iat: now,
    exp: now + 900,
  })}`;
  const signature = createHmac('sha256', process.env.JWT_SECRET)
    .update(unsigned)
    .digest('base64url');
  return `${unsigned}.${signature}`;
}
async function call(path, token, method, body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
async function fixture(index) {
  const userId = randomUUID();
  const phone = `+964770${String(5000000 + index).padStart(7, '0')}`;
  await db.query(
    `INSERT INTO users(id,phone,role_id)
     SELECT $1,$2,id FROM roles WHERE name='customer'`,
    [userId, phone],
  );
  const addressId = (
    await db.query(
      `INSERT INTO addresses(user_id,city,contact_phone)
     VALUES ($1,'Baghdad',$2) RETURNING id`,
      [userId, phone],
    )
  ).rows[0].id;
  const orderId = randomUUID();
  await db.query(
    `INSERT INTO orders
      (id,user_id,address_id,order_number,status,payment_method,subtotal,delivery_fee,discount,total,
       delivery_contact_phone,delivery_city,document_date,accounting_date)
     VALUES ($1,$2,$3,$4,'pending','cod',1000,0,0,1000,$5,'Baghdad',$6,$6)`,
    [
      orderId,
      userId,
      addressId,
      `C26-${index}-${orderId.slice(0, 8)}`,
      phone,
      businessDate(),
    ],
  );
  return { userId, orderId, token: tokenFor(userId) };
}
async function verifyAnonymized(row) {
  const result = (
    await db.query(
      'SELECT is_active,anonymized_at,phone FROM users WHERE id=$1',
      [row.userId],
    )
  ).rows[0];
  check(result.is_active, false, 'deleted user is inactive');
  check(result.phone, null, 'phone is released');
  check(Boolean(result.anonymized_at), true, 'user is anonymized');
  const order = (
    await db.query('SELECT status,address_id FROM orders WHERE id=$1', [
      row.orderId,
    ])
  ).rows[0];
  check(order.status, 'cancelled', 'cancelled order is retained');
  check(order.address_id, null, 'saved address is removed');
}

try {
  const fixtures = await Promise.all(
    Array.from({ length: 52 }, (_, index) => fixture(index)),
  );
  const first = fixtures[0];
  const blocked = await call('/me/account', first.token, 'DELETE');
  check(blocked.status, 409, 'open order blocks deletion');
  check(
    blocked.data.code,
    'ACCOUNT_DELETION_BLOCKED',
    'existing code is retained',
  );

  // Repeated immediate cancellation/deletion, including concurrent customers.
  for (let offset = 0; offset < fixtures.length; offset += 8) {
    await Promise.all(
      fixtures.slice(offset, offset + 8).map(async (row, index) => {
        if (index % 4 === 0) {
          const cancelling = call(
            `/orders/${row.orderId}/cancel`,
            row.token,
            'POST',
            { version: 1 },
          );
          const deleting = call('/me/account', row.token, 'DELETE');
          const [cancelled, raced] = await Promise.all([cancelling, deleting]);
          check(cancelled.status, 200, 'in-flight cancellation completes');
          check(
            [204, 409].includes(raced.status),
            true,
            'in-flight deletion is success or declared block',
          );
          if (raced.status === 409) {
            check(
              raced.data.code,
              'ACCOUNT_DELETION_BLOCKED',
              'race returns declared code',
            );
            const retried = await call('/me/account', row.token, 'DELETE');
            check(
              retried.status,
              204,
              `retry after cancellation succeeds: ${JSON.stringify(retried.data)}`,
            );
          }
        } else {
          const cancelled = await call(
            `/orders/${row.orderId}/cancel`,
            row.token,
            'POST',
            { version: 1 },
          );
          check(cancelled.status, 200, 'order cancellation completes');
          const deleted = await call('/me/account', row.token, 'DELETE');
          check(
            deleted.status,
            204,
            `immediate deletion succeeds: ${JSON.stringify(deleted.data)}`,
          );
        }
        await verifyAnonymized(row);
      }),
    );
  }
  const duplicate = await fixture(52);
  const cancelled = await call(
    `/orders/${duplicate.orderId}/cancel`,
    duplicate.token,
    'POST',
    { version: 1 },
  );
  check(cancelled.status, 200, 'duplicate fixture cancels');
  const duplicates = await Promise.all([
    call('/me/account', duplicate.token, 'DELETE'),
    call('/me/account', duplicate.token, 'DELETE'),
  ]);
  check(
    duplicates.some((response) => response.status === 204),
    true,
    'one duplicate deletes',
  );
  check(
    duplicates.every((response) => [204, 401].includes(response.status)),
    true,
    'duplicate never fails',
  );
  await verifyAnonymized(duplicate);
  const revoked = await call('/me/account', duplicate.token, 'DELETE');
  check(revoked.status, 401, 'a later request uses a revoked session');
  console.log(`C26 account deletion race: ${assertions} assertions`);
} finally {
  await db.end();
}
