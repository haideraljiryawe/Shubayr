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
  throw new Error(
    'Phase 2 monitoring acceptance requires the disposable *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1')
  throw new Error('Acceptance API must be loopback');
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
    expected: 200,
    body: { phone },
  });
  return (
    await request('/auth/verify-otp', {
      method: 'POST',
      expected: 200,
      body: { phone, code: challenge.dev_otp },
    })
  ).access_token;
}

try {
  const monitor = await login('+9647700000008');
  const monitorCount = Number(
    (
      await db.query(`
    SELECT count(*)::int AS count FROM users u
    JOIN work_profiles w ON w.user_id=u.id
    WHERE u.is_active=true AND w.is_active=true AND w.app_role='order_monitor'`)
    ).rows[0].count,
  );
  for (const type of ['new_order', 'order_cancelled', 'delivery_failed']) {
    const monitorEntityType = type === 'delivery_failed' ? 'order' : null;
    const result = await db.query(
      `SELECT count(*)::int AS count,
              count(*) FILTER (WHERE target_role <> 'order_monitor')::int AS leaked
       FROM notification_events
       WHERE type=$1 AND ($2::text IS NULL OR entity_type=$2)`,
      [type, monitorEntityType],
    );
    check(
      result.rows[0].count > 0,
      true,
      `${type} fires in its real lifecycle path`,
    );
    check(result.rows[0].leaked, 0, `${type} never leaks to another audience`);
    const incomplete = await db.query(
      `SELECT event_key FROM notification_events
       WHERE type=$1 AND target_role='order_monitor' AND ($2::text IS NULL OR entity_type=$2)
       GROUP BY event_key HAVING count(*) <> $3`,
      [type, monitorEntityType, monitorCount],
    );
    check(
      incomplete.rowCount,
      0,
      `${type} creates exactly one row per active monitor`,
    );
  }

  const customerId = randomUUID();
  const roleId = (await db.query("SELECT id FROM roles WHERE name='customer'"))
    .rows[0].id;
  await db.query(
    `INSERT INTO users (id,role_id,name,phone) VALUES ($1,$2,$3,$4)`,
    [
      customerId,
      roleId,
      'إبراهيم MonitorPhase',
      `+96479${Date.now().toString().slice(-8)}`,
    ],
  );
  const ids = [
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
  ];
  const fixtures = [
    [ids[0], 'MON-AR-A', 'pending', '2026-09-27T20:30:00.000Z'],
    [ids[1], 'MON-AR-B', 'confirmed', '2026-09-27T21:00:00.000Z'],
    [ids[2], 'MON-AR-C', 'confirmed', '2026-09-27T20:30:00.000Z'],
  ];
  for (const [id, number, status, placedAt] of fixtures) {
    await db.query(
      `INSERT INTO orders
       (id,user_id,order_number,status,payment_method,subtotal,delivery_fee,discount,total,
        delivery_contact_phone,delivery_address_label,delivery_city,delivery_area,delivery_street,delivery_details,placed_at,document_date,accounting_date)
       VALUES ($1,$2,$3,$4,'cod',10,2,1,11,'+9647701111111','Home','Baghdad','Karrada','42','snapshot',$5,$6,$6)`,
      [
        id,
        customerId,
        number,
        status,
        placedAt,
        businessDate(new Date(placedAt)),
      ],
    );
  }
  await db.query(
    `INSERT INTO order_items
     (id,order_id,product_id,variant_id,product_name_ar,product_name_en,image_url,quantity,unit_price,line_total)
     VALUES ($1,$2,$3,$4,'دواء تجريبي','Monitor item','https://example.test/secret.jpg',2,5,10)`,
    [
      randomUUID(),
      ids[0],
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
    ],
  );

  const searched = await request(
    '/monitor/orders?q=%D8%A7%D8%A8%D8%B1%D8%A7%D9%87%D9%8A%D9%85&per_page=100',
    { token: monitor },
  );
  check(
    ids.every((id) => searched.data.some((item) => item.id === id)),
    true,
    'Arabic alef normalization matches customer name',
  );
  const orderSearch = await request('/monitor/orders?q=ar-c&per_page=100', {
    token: monitor,
  });
  check(
    orderSearch.data.some((item) => item.id === ids[2]),
    true,
    'partial case-insensitive order-number search works',
  );

  const baghdad27 = await request(
    '/monitor/orders?q=MonitorPhase&date_from=2026-09-27&date_to=2026-09-27&per_page=100',
    { token: monitor },
  );
  check(
    baghdad27.data.some((item) => item.id === ids[0]),
    true,
    'Baghdad day includes 23:30 local order',
  );
  check(
    baghdad27.data.some((item) => item.id === ids[1]),
    false,
    'Baghdad day excludes next day at 00:00',
  );

  const combined = await request(
    '/monitor/orders?q=MonitorPhase&date_from=2026-09-27&date_to=2026-09-27&status=pending&per_page=1',
    { token: monitor },
  );
  check(
    combined.total,
    1,
    'status, q and date filters combine before pagination',
  );
  check(
    combined.status_counts.pending,
    1,
    'chip pending count respects q and dates',
  );
  check(
    combined.status_counts.confirmed,
    1,
    'chip counts exclude selected status',
  );
  check(combined.status_counts.all, 2, 'all chip count respects q and dates');

  const expectedOrder = (
    await db.query(
      `SELECT id FROM orders WHERE user_id=$1 ORDER BY placed_at DESC,id DESC`,
      [customerId],
    )
  ).rows.map((row) => row.id);
  const pages = [];
  for (let page = 1; page <= 3; page += 1) {
    const result = await request(
      `/monitor/orders?q=MonitorPhase&page=${page}&per_page=1`,
      { token: monitor },
    );
    check(
      result.total,
      3,
      'pagination total is computed over all filtered rows',
    );
    pages.push(result.data[0].id);
  }
  check(
    pages,
    expectedOrder,
    'pagination order is newest-first with stable id tiebreak',
  );

  const detail = await request(`/monitor/orders/${ids[0]}`, { token: monitor });
  check(
    detail.items[0].quantity,
    2,
    'detail returns item snapshot and quantity',
  );
  check(
    JSON.stringify(detail).includes('image_url'),
    false,
    'monitor detail contains no product image field',
  );
  check(
    detail.customer.name,
    'إبراهيم MonitorPhase',
    'detail returns customer name',
  );
  await request(`/orders/${ids[0]}/cancel`, {
    token: monitor,
    method: 'POST',
    expected: 403,
  });
  await request(`/admin/orders/${ids[0]}/cancel`, {
    token: monitor,
    method: 'POST',
    expected: 403,
    body: { reason: 'forbidden' },
  });

  console.log(`Phase 2 monitoring acceptance: ${assertions} assertions passed`);
} finally {
  await db.end();
}
