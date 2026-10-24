import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { businessDate } from '../dist/src/modules/finance/business-date.js';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error('M1 acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('M1 acceptance requires the runner-owned loopback API');
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
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
  check(response.status, expected, `${method} ${path}: ${text}`);
  return text ? JSON.parse(text) : undefined;
}
async function login(phone) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone },
  });
  return request('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: challenge.dev_otp },
  });
}
async function insertOrder(userId, status, suffix) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO orders
      (id,user_id,order_number,status,payment_method,subtotal,delivery_fee,discount,total,
       delivery_contact_phone,delivery_address_label,delivery_city,delivery_area,
       delivery_street,delivery_details,document_date,accounting_date)
     VALUES ($1,$2,$3,$4,'cod',1000,0,0,1000,$5,'Home','Baghdad','Karrada','42','Keep snapshot',$6,$6)`,
    [
      id,
      userId,
      `M1-${suffix}-${id.slice(0, 8)}`,
      status,
      '+9647700010101',
      businessDate(),
    ],
  );
  return id;
}

try {
  const blockedPhone = '+9647700088801';
  const blocked = await login(blockedPhone);
  const openOrder = await insertOrder(blocked.user.id, 'pending', 'OPEN');
  const returnOrder = await insertOrder(blocked.user.id, 'delivered', 'RETURN');
  const pendingReturn = randomUUID();
  await db.query(
    `INSERT INTO returns
      (id,document_number,order_id,user_id,created_by,status,document_date,accounting_date)
     VALUES ($1,$2,$3,$4,$4,'requested',$5,$5)`,
    [
      pendingReturn,
      `RET-M1-PENDING-${pendingReturn.slice(0, 8)}`,
      returnOrder,
      blocked.user.id,
      businessDate(),
    ],
  );
  const refundOrder = await insertOrder(blocked.user.id, 'delivered', 'REFUND');
  const completedReturn = randomUUID();
  await db.query(
    `INSERT INTO returns
      (id,document_number,order_id,user_id,created_by,status,document_date,accounting_date,completed_at)
     VALUES ($1,$2,$3,$4,$4,'completed',$5,$5,now())`,
    [
      completedReturn,
      `RET-M1-COMPLETE-${completedReturn.slice(0, 8)}`,
      refundOrder,
      blocked.user.id,
      businessDate(),
    ],
  );
  const adminId = (
    await db.query("SELECT id FROM users WHERE username='admin'")
  ).rows[0].id;
  await db.query(
    `INSERT INTO refund_ledger
      (order_id,return_id,amount,status,reason,created_by)
     VALUES ($1,$2,100,'obligation','M1 blocker',$3)`,
    [refundOrder, completedReturn, adminId],
  );
  const refused = await request('/me/account', {
    token: blocked.access_token,
    method: 'DELETE',
    expected: 409,
  });
  check(
    refused.code,
    'ACCOUNT_DELETION_BLOCKED',
    'deletion has a stable refusal code',
  );
  check(
    refused.errors.map((entry) => entry.code).sort(),
    ['OPEN_ORDERS', 'PENDING_RETURNS', 'UNSETTLED_AMOUNTS'],
    'deletion reports every blocker group',
  );
  check(
    refused.details,
    { open_orders: 1, pending_returns: 1, unsettled_amounts: 1 },
    'deletion reports machine-readable counts for every blocker group',
  );
  check(
    Number(
      (
        await db.query(
          'SELECT count(*)::int AS count FROM orders WHERE id=$1',
          [openOrder],
        )
      ).rows[0].count,
    ),
    1,
    'a refused deletion changes no order history',
  );

  const deletablePhone = '+9647700088802';
  const deletable = await login(deletablePhone);
  const baghdadGovernorate = (await request('/governorates')).find(
    (entry) => entry.code === 'baghdad',
  );
  assert.ok(baghdadGovernorate, 'Baghdad governorate must be seeded');
  assertions += 1;
  await request('/me', {
    token: deletable.access_token,
    method: 'PATCH',
    body: { name: 'Delete Me', email: 'delete-me@example.test' },
  });
  const address = await request('/addresses', {
    token: deletable.access_token,
    method: 'POST',
    expected: 201,
    body: {
      label: 'Private home',
      governorate_id: baghdadGovernorate.id,
      city: 'Baghdad',
      details: 'Private notes',
      contact_phone: deletablePhone,
    },
  });
  await request('/devices/token', {
    token: deletable.access_token,
    method: 'POST',
    expected: 201,
    body: { token: `m1-device-${randomUUID()}`, platform: 'android' },
  });
  const retainedOrder = await insertOrder(
    deletable.user.id,
    'cancelled',
    'RETAINED',
  );
  await db.query('UPDATE orders SET address_id=$1 WHERE id=$2', [
    address.id,
    retainedOrder,
  ]);
  await request('/me/account', {
    token: deletable.access_token,
    method: 'DELETE',
    expected: 204,
  });
  await request('/me', { token: deletable.access_token, expected: 401 });

  const oldUser = (
    await db.query(
      `SELECT name,phone,email,is_active,anonymized_at
       FROM users WHERE id=$1`,
      [deletable.user.id],
    )
  ).rows[0];
  check(
    {
      name: oldUser.name,
      phone: oldUser.phone,
      email: oldUser.email,
      active: oldUser.is_active,
      anonymized: Boolean(oldUser.anonymized_at),
    },
    { name: null, phone: null, email: null, active: false, anonymized: true },
    'successful deletion anonymizes and disables the retained user stub',
  );
  for (const [table, message] of [
    ['addresses', 'addresses are removed'],
    ['device_tokens', 'device tokens are removed'],
    ['refresh_tokens', 'refresh sessions are removed'],
  ]) {
    const count = Number(
      (
        await db.query(
          `SELECT count(*)::int AS count FROM ${table} WHERE user_id=$1`,
          [deletable.user.id],
        )
      ).rows[0].count,
    );
    check(count, 0, message);
  }
  const kept = (
    await db.query(
      `SELECT user_id,address_id,delivery_contact_phone,delivery_details
       FROM orders WHERE id=$1`,
      [retainedOrder],
    )
  ).rows[0];
  check(
    kept.user_id,
    deletable.user.id,
    'financial/order ownership key is retained',
  );
  check(kept.address_id, null, 'deleted address reference is cleared');
  check(
    kept.delivery_contact_phone,
    '+9647700010101',
    'shipping contact snapshot is immutable',
  );
  check(
    kept.delivery_details,
    'Keep snapshot',
    'shipping detail snapshot is immutable',
  );
  check(
    Number(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM audit_logs WHERE actor_id=$1 AND action='customer.account_delete'",
          [deletable.user.id],
        )
      ).rows[0].count,
    ),
    1,
    'account deletion is audited',
  );

  // Account deletion releases the identity but does not bypass the abuse
  // cooldown. The combined runner configures that production rule to one
  // second, so wait before proving that the phone can register anew.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const replacement = await login(deletablePhone);
  check(
    replacement.user.id === deletable.user.id,
    false,
    'the released phone registers as a new account',
  );

  console.log(`Mobile audit M1 acceptance: ${assertions} assertions passed`);
} finally {
  await db.end();
}
