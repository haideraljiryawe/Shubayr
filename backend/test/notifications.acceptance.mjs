import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Notification acceptance requires the runner-owned disposable database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1')
  throw new Error('Notification acceptance requires the loopback API');
if (
  process.env.NOTIFICATION_PROVIDER &&
  process.env.NOTIFICATION_PROVIDER !== 'dev'
) {
  throw new Error(
    'Notification acceptance requires the network-free dev provider',
  );
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
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
  const content = await response.text();
  check(response.status, expected, `${method} ${path}: ${content}`);
  return content ? JSON.parse(content) : undefined;
}
async function login(phone) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone },
    expected: 201,
  });
  return (
    await request('/auth/verify-otp', {
      method: 'POST',
      body: { phone, code: challenge.dev_otp },
      expected: 201,
    })
  ).access_token;
}
async function row(sql, args = []) {
  return (await db.query(sql, args)).rows[0];
}
async function waitFor(sql, args, predicate, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = await row(sql, args);
    if (predicate(result)) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

try {
  const a = await login('+9647700000006');
  const b = await login('+9647700088888');
  const agent = await login('+9647700000005');
  const aId = (await row("SELECT id FROM users WHERE phone='+9647700000006' "))
    .id;
  const bId = (await row("SELECT id FROM users WHERE phone='+9647700088888' "))
    .id;
  const agentId = (
    await row("SELECT id FROM users WHERE phone='+9647700000005' ")
  ).id;
  const tokenValue = `VERIFY-NOTIFICATION-${randomUUID()}`;

  const first = await request('/devices/token', {
    token: a,
    method: 'POST',
    expected: 201,
    body: { token: tokenValue, platform: 'android', locale: 'en' },
  });
  const again = await request('/devices/token', {
    token: a,
    method: 'POST',
    expected: 201,
    body: { token: tokenValue, platform: 'ios', locale: 'ar' },
  });
  check(again.id, first.id, 're-register keeps token identity');
  check(again.platform, 'ios', 're-register updates platform');
  check(
    (
      await row(
        'SELECT count(*)::int AS count FROM device_tokens WHERE token=$1',
        [tokenValue],
      )
    ).count,
    1,
    'global token uniqueness',
  );
  const moved = await request('/devices/token', {
    token: b,
    method: 'POST',
    expected: 201,
    body: { token: tokenValue, platform: 'web', locale: 'en' },
  });
  check(moved.id, first.id, 'account transfer retains one token row');
  check(moved.user_id, bId, 'token transferred to new owner');
  await request(`/devices/token?token=${encodeURIComponent(tokenValue)}`, {
    token: a,
    method: 'DELETE',
    expected: 403,
  });
  await request(`/devices/token?token=${encodeURIComponent(tokenValue)}`, {
    token: b,
    method: 'DELETE',
    expected: 204,
  });
  check(
    (
      await row('SELECT is_active FROM device_tokens WHERE token=$1', [
        tokenValue,
      ])
    ).is_active,
    false,
    'unregister deactivates',
  );
  const revived = await request('/devices/token', {
    token: b,
    method: 'POST',
    expected: 201,
    body: { token: tokenValue, platform: 'web', locale: 'en' },
  });
  check(revived.is_active, true, 're-register reactivates');

  const defaults = await request('/me/notification-preferences', { token: b });
  const enabled = (prefs, type, channel) =>
    prefs.preferences.find((p) => p.type === type && p.channel === channel)
      ?.enabled;
  check(defaults.preferences.length, 20, 'all type/channel pairs returned');
  check(
    enabled(defaults, 'delivered', 'push'),
    true,
    'transactional push defaults on',
  );
  check(enabled(defaults, 'promo', 'push'), false, 'marketing defaults off');
  check(
    enabled(defaults, 'order_confirmed', 'sms'),
    true,
    'critical SMS defaults on',
  );
  await request('/me/notification-preferences', {
    token: b,
    method: 'PATCH',
    expected: 422,
    body: {
      preferences: [{ type: 'unknown', channel: 'push', enabled: false }],
    },
  });
  await request('/me/notification-preferences', {
    token: b,
    method: 'PATCH',
    expected: 422,
    body: {
      preferences: [{ type: 'delivered', channel: 'email', enabled: false }],
    },
  });
  await request('/me/notification-preferences', {
    token: b,
    method: 'PATCH',
    expected: 422,
    body: {
      preferences: [
        { type: 'order_confirmed', channel: 'sms', enabled: false },
      ],
    },
  });
  const patched = await request('/me/notification-preferences', {
    token: b,
    method: 'PATCH',
    body: {
      preferences: [
        { type: 'delivered', channel: 'push', enabled: false },
        { type: 'order_confirmed', channel: 'push', enabled: false },
      ],
    },
  });
  check(
    enabled(patched, 'delivered', 'push'),
    false,
    'type/channel opt-out persists',
  );
  check(
    enabled(
      await request('/me/notification-preferences', { token: b }),
      'delivered',
      'push',
    ),
    false,
    'PATCH durable',
  );
  check(
    (
      await row(
        "SELECT count(*)::int AS count FROM audit_logs WHERE actor_id=$1 AND action='notification_preference.update'",
        [bId],
      )
    ).count,
    2,
    'preference updates audited',
  );

  async function fixture(userId) {
    const orderId = randomUUID();
    const deliveryId = randomUUID();
    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO orders (id,user_id,order_number,status,payment_method,subtotal,delivery_fee,discount,total,delivery_contact_phone,delivery_city)
        VALUES ($1,$2,$3,'ready_for_dispatch','cod',10,0,0,10,'+9647700000000','Baghdad')`,
        [orderId, userId, `VERIFY-NOTIFY-${orderId.slice(0, 8)}`],
      );
      await db.query(
        "INSERT INTO deliveries (id,order_id,agent_id,status,delivery_fee) VALUES ($1,$2,$3,'assigned',0)",
        [deliveryId, orderId, agentId],
      );
      await db.query('UPDATE orders SET delivery_id=$1 WHERE id=$2', [
        deliveryId,
        orderId,
      ]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    return { orderId, deliveryId };
  }
  const aOrder = await fixture(aId);
  const bOrder = await fixture(bId);
  for (const { deliveryId } of [aOrder, bOrder]) {
    await request(`/deliveries/${deliveryId}`, {
      token: agent,
      method: 'PATCH',
      body: { status: 'out_for_delivery' },
    });
    await request(`/deliveries/${deliveryId}`, {
      token: agent,
      method: 'PATCH',
      body: { status: 'delivered' },
    });
  }
  const aPush = await waitFor(
    "SELECT status,type,channel,entity_id,locale FROM notification_logs WHERE entity_id=$1 AND type='delivered' AND channel='push' AND status='sent' LIMIT 1",
    [aOrder.deliveryId],
    (result) => result?.status === 'sent',
    'opted-in delivered push',
  );
  check(aPush.entity_id, aOrder.deliveryId, 'log references delivery');
  check(aPush.locale, 'ar', 'seed Arabic locale used');
  const bPush = await waitFor(
    "SELECT status,type,channel,entity_id,locale FROM notification_logs WHERE entity_id=$1 AND type='delivered' AND channel='push' LIMIT 1",
    [bOrder.deliveryId],
    (result) => result?.status === 'skipped',
    'opted-out delivered push',
  );
  check(bPush.status, 'skipped', 'opted-out channel recorded as skipped');
  check(bPush.locale, 'en', 'token English locale used');
  const event = await row(
    "SELECT enqueued_at,processed_at FROM notification_events WHERE entity_id=$1 AND type='delivered'",
    [bOrder.deliveryId],
  );
  check(
    Boolean(event.enqueued_at && event.processed_at),
    true,
    'outbox event enqueued and worked',
  );

  const promoId = randomUUID();
  await db.query(
    `INSERT INTO notification_events (event_key,user_id,type,entity_type,entity_id)
    VALUES ($1,$2,'promo','order',$3)`,
    [`verify-promo:${promoId}`, bId, promoId],
  );
  const promo = await waitFor(
    "SELECT status FROM notification_logs WHERE entity_id=$1 AND type='promo' AND channel='push'",
    [promoId],
    (result) => result?.status === 'skipped',
    'marketing opt-out',
  );
  check(promo.status, 'skipped', 'promo opt-out recorded');

  const confirmId = randomUUID();
  await db.query(
    `INSERT INTO notification_events (event_key,user_id,type,entity_type,entity_id)
    VALUES ($1,$2,'order_confirmed','order',$3)`,
    [`verify-confirm:${confirmId}`, bId, confirmId],
  );
  const sms = await waitFor(
    "SELECT status FROM notification_logs WHERE entity_id=$1 AND type='order_confirmed' AND channel='sms'",
    [confirmId],
    (result) => result?.status === 'sent',
    'mandatory confirmation SMS',
  );
  check(sms.status, 'sent', 'critical transactional SMS sent by dev driver');
  const confirmationPush = await row(
    "SELECT status FROM notification_logs WHERE entity_id=$1 AND type='order_confirmed' AND channel='push'",
    [confirmId],
  );
  check(
    confirmationPush.status,
    'skipped',
    'same transactional type permits push opt-out',
  );

  const historyA = await request('/me/notifications?per_page=100', {
    token: a,
  });
  const historyB = await request('/me/notifications?per_page=100', {
    token: b,
  });
  check(
    historyA.data.some((item) => item.entity_id === bOrder.deliveryId),
    false,
    'customer cannot read another history',
  );
  check(
    historyB.data.some(
      (item) =>
        item.entity_id === bOrder.deliveryId && item.status === 'skipped',
    ),
    true,
    'own history includes skipped attempt',
  );
  check(
    historyB.data.some(
      (item) => item.entity_id === confirmId && item.channel === 'sms',
    ),
    true,
    'own history includes dev SMS',
  );
  check(
    (
      await row(
        "SELECT count(*)::int AS count FROM audit_logs WHERE actor_id=$1 AND action='device_token.register'",
        [bId],
      )
    ).count >= 2,
    true,
    'token transfer and reactivation audited',
  );
  console.log(`Notifications acceptance: ${assertions} assertions passed`);
} finally {
  await db.end();
}
