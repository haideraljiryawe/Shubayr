import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';

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
    expected: 200,
  });
  return (
    await request('/auth/verify-otp', {
      method: 'POST',
      body: { phone, code: challenge.dev_otp },
      expected: 200,
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

async function openStream(ticket, { since, lastEventId, signal } = {}) {
  const url = new URL(`${api}/notifications/stream`);
  url.searchParams.set('ticket', ticket);
  if (since !== undefined) url.searchParams.set('since', String(since));
  const response = await fetch(url, {
    signal,
    headers:
      lastEventId === undefined ? {} : { 'last-event-id': String(lastEventId) },
  });
  if (response.status !== 200) {
    check(response.status, 200, `SSE open: ${await response.text()}`);
  } else {
    check(response.status, 200, 'SSE open');
  }
  return { reader: response.body.getReader(), buffer: '' };
}

async function nextEvent(stream, wanted, timeout = 4000) {
  const read = async () => {
    while (true) {
      const boundary = stream.buffer.indexOf('\n\n');
      if (boundary >= 0) {
        const frame = stream.buffer.slice(0, boundary);
        stream.buffer = stream.buffer.slice(boundary + 2);
        if (frame.startsWith(':')) continue;
        const fields = Object.fromEntries(
          frame.split('\n').map((line) => {
            const separator = line.indexOf(':');
            return [
              line.slice(0, separator),
              line.slice(separator + 1).trimStart(),
            ];
          }),
        );
        if (!wanted || fields.event === wanted) {
          return {
            id: fields.id,
            event: fields.event,
            data: JSON.parse(fields.data),
          };
        }
        continue;
      }
      const { done, value } = await stream.reader.read();
      if (done) throw new Error('SSE stream closed before the expected event');
      stream.buffer += new TextDecoder().decode(value);
    }
  };
  return Promise.race([
    read(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out waiting for SSE ${wanted}`)),
        timeout,
      ),
    ),
  ]);
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
  check(defaults.preferences.length, 28, 'all type/channel pairs returned');
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
  check(
    enabled(defaults, 'order_rejected', 'push'),
    true,
    'rejected-order push defaults on',
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
    `INSERT INTO notification_events
      (event_key,user_id,type,target_role,entity_type,entity_id,title_ar,body_ar,title_en,body_en,deep_link)
    VALUES ($1,$2,'promo','customer','order',$3,'عرض','عرض جديد','Offer','New offer',$4)`,
    [`verify-promo:${promoId}`, bId, promoId, `/orders/${promoId}`],
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
    `INSERT INTO notification_events
      (event_key,user_id,type,target_role,entity_type,entity_id,title_ar,body_ar,title_en,body_en,deep_link)
    VALUES ($1,$2,'order_confirmed','customer','order',$3,'تأكيد الطلب','تم التأكيد','Order confirmed','Confirmed',$4)`,
    [`verify-confirm:${confirmId}`, bId, confirmId, `/orders/${confirmId}`],
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
        item.entity_id === bOrder.deliveryId && item.type === 'delivered',
    ),
    true,
    'own inbox includes saved delivered event despite push opt-out',
  );
  check(
    historyB.data.find(
      (item) =>
        item.entity_id === bOrder.deliveryId && item.type === 'delivered',
    )?.deep_link,
    `/orders/${bOrder.orderId}`,
    'customer delivery update links to the owned order',
  );
  check(
    historyB.data.some(
      (item) => item.entity_id === confirmId && item.type === 'order_confirmed',
    ),
    true,
    'own inbox includes confirmation event',
  );
  const unreadBefore = await request('/me/notifications/unread-count', {
    token: b,
  });
  const unreadItems = historyB.data.filter((item) => item.read_at === null);
  check(unreadItems.length >= 2, true, 'inbox has independent unread rows');
  check(
    Boolean(
      unreadItems[0].title_ar &&
      unreadItems[0].title_en &&
      unreadItems[0].deep_link,
    ),
    true,
    'saved notification contains bilingual fixed text and a deep link',
  );

  const cursor = await row(
    'SELECT coalesce(max(sequence),0)::text AS sequence FROM notification_stream_events WHERE user_id=$1',
    [bId],
  );
  const liveTicket = await request('/notifications/stream-ticket', {
    token: b,
    method: 'POST',
    expected: 201,
  });
  const live = await openStream(liveTicket.ticket, { since: cursor.sequence });
  await Promise.all([
    request(`/me/notifications/${unreadItems[0].id}/read`, {
      token: b,
      method: 'PATCH',
    }),
    request(`/me/notifications/${unreadItems[0].id}/read`, {
      token: b,
      method: 'PATCH',
    }),
  ]);
  const liveRead = await nextEvent(live, 'notification.read');
  check(
    liveRead.data.notification_ids,
    [unreadItems[0].id],
    'read state reaches another live session',
  );
  check(
    (
      await row(
        "SELECT count(*)::int AS count FROM notification_stream_events WHERE notification_id=$1 AND event='notification.read'",
        [unreadItems[0].id],
      )
    ).count,
    1,
    'concurrent mark-read requests emit one state transition',
  );
  await live.reader.cancel();

  const unreadAfterOne = await request(
    '/me/notifications?unread=true&per_page=100',
    { token: b },
  );
  check(
    unreadAfterOne.total,
    unreadBefore.unread_count - 1,
    'reading one decrements unread count once',
  );
  check(
    unreadAfterOne.data.some((item) => item.id === unreadItems[1].id),
    true,
    'reading one leaves other notifications unread',
  );
  await request(`/me/notifications/${unreadItems[0].id}/read`, {
    token: a,
    method: 'PATCH',
    expected: 404,
  });

  const replayCursor = await row(
    'SELECT coalesce(max(sequence),0)::text AS sequence FROM notification_stream_events WHERE user_id=$1',
    [bId],
  );
  await request(`/me/notifications/${unreadItems[1].id}/read`, {
    token: b,
    method: 'PATCH',
  });
  const replayTicket = await request('/notifications/stream-ticket', {
    token: b,
    method: 'POST',
    expected: 201,
  });
  const replay = await openStream(replayTicket.ticket, {
    lastEventId: replayCursor.sequence,
  });
  const replayedRead = await nextEvent(replay, 'notification.read');
  check(
    replayedRead.data.notification_ids,
    [unreadItems[1].id],
    'Last-Event-ID replays a missed event',
  );
  await replay.reader.cancel();

  const singleUseTicket = await request('/notifications/stream-ticket', {
    token: b,
    method: 'POST',
    expected: 201,
  });
  const firstUse = await openStream(singleUseTicket.ticket, {
    since: '999999999999',
  });
  await firstUse.reader.cancel();
  await request(
    `/notifications/stream?ticket=${encodeURIComponent(singleUseTicket.ticket)}`,
    {
      expected: 401,
    },
  );

  const expiringTicket = await request('/notifications/stream-ticket', {
    token: b,
    method: 'POST',
    expected: 201,
  });
  const database = new URL(process.env.DATABASE_URL).pathname;
  const prefix = `shubayr:notify:${createHash('sha256').update(database).digest('hex').slice(0, 16)}`;
  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  await redis.pexpire(`${prefix}:ticket:${expiringTicket.ticket}`, 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await request(
    `/notifications/stream?ticket=${encodeURIComponent(expiringTicket.ticket)}`,
    {
      expected: 401,
    },
  );
  await redis.quit();

  const totalBeforeAllRead = historyB.total;
  const isolationCursor = await row(
    'SELECT coalesce(max(sequence),0)::text AS sequence FROM notification_stream_events',
  );
  const isolationTicket = await request('/notifications/stream-ticket', {
    token: a,
    method: 'POST',
    expected: 201,
  });
  const isolationAbort = new AbortController();
  const isolated = await openStream(isolationTicket.ticket, {
    since: isolationCursor.sequence,
    signal: isolationAbort.signal,
  });
  await request('/me/notifications/read-all', { token: b, method: 'PATCH' });
  const leaked = await Promise.race([
    isolated.reader
      .read()
      .then(({ value }) => Boolean(value))
      .catch(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), 750)),
  ]);
  isolationAbort.abort();
  check(leaked, false, 'another recipient receives no read-state SSE event');
  check(
    (await request('/me/notifications/unread-count', { token: b }))
      .unread_count,
    0,
    'mark-all clears only unread state',
  );
  check(
    (await request('/me/notifications?per_page=100', { token: b })).total,
    totalBeforeAllRead,
    'mark-all never deletes notifications',
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
