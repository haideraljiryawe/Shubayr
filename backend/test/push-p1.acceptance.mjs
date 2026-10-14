import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error('P1 acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('P1 acceptance requires the runner-owned loopback API');
}
if (
  process.env.NOTIFICATION_PROVIDER &&
  process.env.NOTIFICATION_PROVIDER !== 'dev'
) {
  throw new Error('P1 acceptance requires the network-free dev provider');
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
async function register(accessToken, token, platform = 'ios') {
  return request('/devices/token', {
    token: accessToken,
    method: 'POST',
    expected: 201,
    body: { token, platform, locale: 'en' },
  });
}
async function notification(userId, { paused = false } = {}) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO notification_events
       (id,event_key,user_id,type,target_role,entity_type,entity_id,title_ar,
        body_ar,title_en,body_en,deep_link,enqueued_at)
     VALUES ($1,$2,$3,'order_placed','customer','order',$4,'اختبار','اختبار',
             'Test','Test','/notifications',${paused ? 'NOW()' : 'NULL'})`,
    [id, `p1:${id}`, userId, randomUUID()],
  );
  return id;
}
async function row(sql, args = []) {
  return (await db.query(sql, args)).rows[0];
}
async function waitFor(sql, args, predicate, description) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await row(sql, args);
    if (predicate(result)) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

try {
  const phone = '+9647700099101';
  const firstSession = await login(phone);
  const secondSession = await login(phone);
  const firstToken = `P1-IOS-${randomUUID()}`;
  const secondToken = `P1-ANDROID-${randomUUID()}`;
  const firstDevice = await register(firstSession.access_token, firstToken);
  const secondDevice = await register(
    secondSession.access_token,
    secondToken,
    'android',
  );
  const bindings = await db.query(
    `SELECT token, session_id FROM device_tokens WHERE id = ANY($1::uuid[])
     ORDER BY token`,
    [[firstDevice.id, secondDevice.id]],
  );
  check(bindings.rows.length, 2, 'two sessions retain two registrations');
  check(
    new Set(bindings.rows.map((item) => item.session_id)).size,
    2,
    'independent devices have independent session bindings',
  );

  const beforeRotation = (
    await row('SELECT session_id FROM device_tokens WHERE id=$1', [
      firstDevice.id,
    ])
  ).session_id;
  const rotated = await request('/auth/refresh', {
    method: 'POST',
    body: { refresh_token: firstSession.refresh_token },
  });
  await register(rotated.access_token, firstToken);
  check(
    (
      await row('SELECT session_id FROM device_tokens WHERE id=$1', [
        firstDevice.id,
      ])
    ).session_id,
    beforeRotation,
    'refresh rotation preserves push session lineage',
  );

  await request('/auth/logout', {
    method: 'POST',
    expected: 201,
    body: { refresh_token: rotated.refresh_token },
  });
  const afterLogout = await db.query(
    'SELECT id,is_active FROM device_tokens WHERE id = ANY($1::uuid[])',
    [[firstDevice.id, secondDevice.id]],
  );
  check(
    afterLogout.rows.find((item) => item.id === firstDevice.id).is_active,
    false,
    'logout deactivates its bound device',
  );
  check(
    afterLogout.rows.find((item) => item.id === secondDevice.id).is_active,
    true,
    'logout preserves the other device session',
  );

  const userId = (
    await row('SELECT id FROM users WHERE phone=$1', [phone])
  ).id;
  const logoutEvent = await notification(userId);
  await waitFor(
    'SELECT processed_at FROM notification_events WHERE id=$1',
    [logoutEvent],
    (result) => Boolean(result?.processed_at),
    'post-logout notification dispatch',
  );
  check(
    Number(
      (
        await row(
          `SELECT count(*)::int AS count FROM notification_logs
           WHERE event_id=$1 AND delivery_key=$2`,
          [logoutEvent, `${logoutEvent}:push:${firstDevice.id}`],
        )
      ).count,
    ),
    0,
    'revoked session is excluded from fan-out',
  );
  check(
    (
      await row(
        `SELECT status FROM notification_logs
         WHERE event_id=$1 AND delivery_key=$2`,
        [logoutEvent, `${logoutEvent}:push:${secondDevice.id}`],
      )
    ).status,
    'sent',
    'independent active session still receives',
  );

  await db.query(
    'UPDATE refresh_tokens SET expires_at=NOW()-INTERVAL \'1 second\' WHERE session_id=(SELECT session_id FROM device_tokens WHERE id=$1)',
    [secondDevice.id],
  );
  const expiredEvent = await notification(userId);
  await waitFor(
    'SELECT processed_at FROM notification_events WHERE id=$1',
    [expiredEvent],
    (result) => Boolean(result?.processed_at),
    'expired-session notification dispatch',
  );
  check(
    Number(
      (
        await row(
          `SELECT count(*)::int AS count FROM notification_logs
           WHERE event_id=$1 AND delivery_key=$2`,
          [expiredEvent, `${expiredEvent}:push:${secondDevice.id}`],
        )
      ).count,
    ),
    0,
    'expired refresh session is excluded',
  );

  const staleSession = await login('+9647700099105');
  const staleDevice = await register(
    staleSession.access_token,
    `P1-STALE-${randomUUID()}`,
  );
  const staleUserId = (
    await row('SELECT id FROM users WHERE phone=$1', ['+9647700099105'])
  ).id;
  await db.query(
    "UPDATE device_tokens SET last_seen_at=NOW()-INTERVAL '100 days' WHERE id=$1",
    [staleDevice.id],
  );
  const staleEvent = await notification(staleUserId);
  await waitFor(
    'SELECT processed_at FROM notification_events WHERE id=$1',
    [staleEvent],
    (result) => Boolean(result?.processed_at),
    'stale-device notification dispatch',
  );
  check(
    Number(
      (
        await row(
          `SELECT count(*)::int AS count FROM notification_logs
           WHERE event_id=$1 AND delivery_key=$2`,
          [staleEvent, `${staleEvent}:push:${staleDevice.id}`],
        )
      ).count,
    ),
    0,
    'stale device registration is excluded',
  );

  const ownerA = await login('+9647700099102');
  const ownerB = await login('+9647700099103');
  const sharedToken = `P1-SWITCH-${randomUUID()}`;
  const sharedDevice = await register(ownerA.access_token, sharedToken);
  const ownerAId = (
    await row('SELECT id FROM users WHERE phone=$1', ['+9647700099102'])
  ).id;
  const pausedEvent = await notification(ownerAId, { paused: true });
  const moved = await register(ownerB.access_token, sharedToken, 'android');
  check(moved.id, sharedDevice.id, 'account switch reuses the unique token row');
  check(moved.user_id === ownerAId, false, 'account switch changes ownership');
  await db.query(
    'UPDATE notification_events SET enqueued_at=NULL WHERE id=$1',
    [pausedEvent],
  );
  await waitFor(
    'SELECT processed_at FROM notification_events WHERE id=$1',
    [pausedEvent],
    (result) => Boolean(result?.processed_at),
    'post-switch dispatch',
  );
  check(
    Number(
      (
        await row(
          `SELECT count(*)::int AS count FROM notification_logs
           WHERE event_id=$1 AND delivery_key=$2`,
          [pausedEvent, `${pausedEvent}:push:${sharedDevice.id}`],
        )
      ).count,
    ),
    0,
    'queued old-owner event cannot follow a reassigned registration',
  );

  const deleteSession = await login('+9647700099104');
  const deleteToken = `P1-DELETE-${randomUUID()}`;
  const deleteDevice = await register(deleteSession.access_token, deleteToken);
  const deleteUserId = (
    await row('SELECT id FROM users WHERE phone=$1', ['+9647700099104'])
  ).id;
  const deleteEvent = await notification(deleteUserId, { paused: true });
  await request('/me/account', {
    token: deleteSession.access_token,
    method: 'DELETE',
    expected: 204,
  });
  check(
    Number(
      (
        await row('SELECT count(*)::int AS count FROM device_tokens WHERE id=$1', [
          deleteDevice.id,
        ])
      ).count,
    ),
    0,
    'account deletion removes device tokens',
  );
  check(
    Number(
      (
        await row(
          'SELECT count(*)::int AS count FROM refresh_tokens WHERE user_id=$1',
          [deleteUserId],
        )
      ).count,
    ),
    0,
    'account deletion removes refresh sessions',
  );
  check(
    Boolean(
      (
        await row('SELECT processed_at FROM notification_events WHERE id=$1', [
          deleteEvent,
        ])
      ).processed_at,
    ),
    true,
    'account deletion drops a queued notification',
  );
  check(
    Number(
      (
        await row(
          'SELECT count(*)::int AS count FROM notification_logs WHERE event_id=$1',
          [deleteEvent],
        )
      ).count,
    ),
    0,
    'dropped account notification never reaches a provider',
  );

  console.log(`P1 push acceptance assertions: ${assertions}`);
} finally {
  await db.end();
}
