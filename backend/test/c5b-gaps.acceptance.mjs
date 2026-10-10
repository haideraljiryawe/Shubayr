import assert from 'node:assert/strict';
import pg from 'pg';
import { businessDateText } from '../dist/src/modules/finance/business-date.js';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'C5b acceptance requires the runner-owned disposable database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1' || !new URL(api).port) {
  throw new Error('C5b acceptance requires the runner-owned loopback API');
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
  const payload = text ? JSON.parse(text) : undefined;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}

async function staffSession(adminToken, suffix, role, permissionKeys) {
  const temporary = 'Temporary-C5b!2026';
  const permanent = 'Permanent-C5b!2026';
  const username = `c5b_${role}_${suffix}`;
  const staff = await request('/admin/staff', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    body: {
      username,
      name: `C5b ${role}`,
      password: temporary,
      permission_keys: permissionKeys,
      reason: 'C5b acceptance permissions',
    },
  });
  const login = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username, password: temporary },
  });
  const changed = await request('/admin/auth/change-password', {
    token: login.access_token,
    method: 'POST',
    expected: 201,
    body: { current_password: temporary, new_password: permanent },
  });
  return { staff, token: changed.access_token };
}

async function waitForNotification(userId, type, entityId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await db.query(
      `SELECT e.id, l.status
       FROM notification_events e
       LEFT JOIN notification_logs l ON l.event_id=e.id AND l.channel='push'
       WHERE e.user_id=$1 AND e.type=$2 AND e.entity_id=$3
       ORDER BY e.created_at DESC, l.created_at DESC
       LIMIT 1`,
      [userId, type, entityId],
    );
    if (result.rows[0]?.status === 'sent') return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${type} push delivery`);
}

try {
  const adminLogin = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
  });
  const admin = adminLogin.access_token;
  const suffix = Date.now().toString(36);
  const proposer = await staffSession(admin, suffix, 'proposer', [
    'catalog.products',
    'prices.change',
    'deliveries.manage',
  ]);
  const approver = await staffSession(admin, suffix, 'approver', [
    'catalog.products',
    'cost.view',
    'sell_below_cost.approve',
  ]);

  await request('/devices/token', {
    token: proposer.token,
    method: 'POST',
    expected: 201,
    body: { token: `C5B-PROPOSER-${suffix}`, platform: 'web', locale: 'en' },
  });
  await request('/devices/token', {
    token: approver.token,
    method: 'POST',
    expected: 201,
    body: { token: `C5B-APPROVER-${suffix}`, platform: 'web', locale: 'en' },
  });

  // A delivery manager without cost.view sees custody quantities/cash but no goods value.
  const privateParties = await request('/admin/delivery-parties?per_page=100', {
    token: proposer.token,
  });
  check(
    privateParties.data.every(
      (party) => !('goods_value_iqd' in party.custody_summary),
    ),
    true,
    'delivery-party list hides goods value without cost.view',
  );
  const privateOverview = await request(
    '/admin/delivery-parties/custody-overview?sort_by=orders_held&sort_direction=desc&per_page=2',
    { token: proposer.token },
  );
  check(privateOverview.data.length <= 2, true, 'custody overview paginates');
  check(
    privateOverview.data.every(
      (party) => !('goods_value_iqd' in party.custody_summary),
    ),
    true,
    'custody overview hides goods value without cost.view',
  );
  const forbiddenCostSort = await request(
    '/admin/delivery-parties/custody-overview?sort_by=goods_value_iqd',
    { token: proposer.token, expected: 403 },
  );
  check(
    forbiddenCostSort.code,
    'COST_VIEW_REQUIRED',
    'cost sorting requires cost.view',
  );

  const category = (
    await db.query(
      `SELECT id FROM categories WHERE parent_id IS NOT NULL ORDER BY id LIMIT 1`,
    )
  ).rows[0];
  assert.ok(category, 'seeded child category is available');
  assertions += 1;
  const sku = `C5B-FIXED-${suffix}`.toUpperCase();
  const product = await request('/admin/products', {
    token: proposer.token,
    method: 'POST',
    expected: 201,
    body: {
      category_id: category.id,
      name_en: `C5b fixed ${suffix}`,
      name_ar: `C5b fixed ${suffix}`,
      price: 20000,
      tracks_expiry: false,
      status: 'hidden',
      published: false,
      variants: [
        { sku, base_unit: 'piece', pricing_mode: 'fixed', selling_price: null },
      ],
    },
  });
  const variant = product.variants[0];
  await db.query(
    `INSERT INTO sku_costs
       (variant_id, book_quantity, book_value_iqd, average_cost_iqd, last_landed_cost_iqd)
     VALUES ($1, 1, 10000, 10000, 10000)
     ON CONFLICT (variant_id) DO UPDATE
       SET book_quantity=1, book_value_iqd=10000,
           average_cost_iqd=10000, last_landed_cost_iqd=10000`,
    [variant.id],
  );

  const pendingSave = await request(`/admin/products/${product.id}`, {
    token: proposer.token,
    method: 'PATCH',
    body: {
      price: 5000,
      below_cost_override_reason: 'C5b fixed price proposal',
    },
  });
  check(
    pendingSave.price,
    20000,
    'pending fixed-price save leaves live price unchanged',
  );
  check(
    pendingSave.price_update_status,
    'pending_approval',
    'fixed price becomes pending',
  );
  const firstId = pendingSave.price_approval_request_id;
  check(
    typeof firstId,
    'string',
    'pending fixed-price save returns its request id',
  );

  const day = businessDateText(new Date());
  const ownList = await request(
    `/admin/price-publish-approvals?status=pending&proposer_id=${proposer.staff.id}&sku=${encodeURIComponent(sku)}&from=${day}&to=${day}&page=1&per_page=1`,
    { token: proposer.token },
  );
  check(
    ownList.total,
    1,
    'approval list combines status, proposer, SKU and date filters',
  );
  check(
    ownList.data[0].id,
    firstId,
    'approval list returns the fixed-price request',
  );
  check(
    Boolean(ownList.data[0].proposed_by_name),
    true,
    'approval list returns the proposer display name',
  );
  check(
    'cost' in ownList.data[0].breaches[0],
    false,
    'approval discovery redacts cost',
  );
  const ownDetail = await request(`/admin/price-publish-approvals/${firstId}`, {
    token: proposer.token,
  });
  check(
    ownDetail.fixed_proposal.proposed_product_price,
    5000,
    'single approval shows proposed fixed price',
  );

  await waitForNotification(
    approver.staff.id,
    'price_approval_requested',
    firstId,
  );
  const approvalInbox = await request(
    '/me/notifications?type=price_approval_requested&per_page=100',
    { token: approver.token },
  );
  check(
    approvalInbox.data.some((event) => event.entity_id === firstId),
    true,
    'approver receives the pending request in the inbox',
  );

  // Grant the proposer approval authority after creation: the current session
  // picks it up, but separation of duties still rejects their own decision.
  await request(`/admin/staff/${proposer.staff.id}/access`, {
    token: admin,
    method: 'PUT',
    body: {
      preset_ids: [],
      permission_keys: [
        'catalog.products',
        'prices.change',
        'deliveries.manage',
        'cost.view',
        'sell_below_cost.approve',
      ],
      reason: 'C5b self-approval verification',
    },
  });
  const selfDecision = await request(
    `/admin/price-publish-approvals/${firstId}/decision`,
    {
      token: proposer.token,
      method: 'POST',
      expected: 403,
      body: { decision: 'approve', reason: 'Attempt own approval' },
    },
  );
  check(
    selfDecision.code,
    'SELF_APPROVAL_FORBIDDEN',
    'the proposer cannot approve their own fixed price',
  );

  const approved = await request(
    `/admin/price-publish-approvals/${firstId}/decision`,
    {
      token: approver.token,
      method: 'POST',
      expected: 201,
      body: { decision: 'approve', reason: 'Approved by second user' },
    },
  );
  check(approved.status, 'approved', 'second user approves the fixed price');
  check(
    approved.decided_by,
    approver.staff.id,
    'approval records the decision maker',
  );
  check(
    Boolean(approved.decided_by_name),
    true,
    'approval returns the decision maker display name',
  );
  const liveAfterApproval = await request(`/admin/products/${product.id}`, {
    token: proposer.token,
  });
  check(liveAfterApproval.price, 5000, 'approval applies the fixed price');
  await waitForNotification(
    proposer.staff.id,
    'price_approval_approved',
    firstId,
  );

  const secondPending = await request(`/admin/products/${product.id}`, {
    token: proposer.token,
    method: 'PATCH',
    body: { price: 4000, below_cost_override_reason: 'C5b rejected proposal' },
  });
  const secondId = secondPending.price_approval_request_id;
  const rejected = await request(
    `/admin/price-publish-approvals/${secondId}/decision`,
    {
      token: approver.token,
      method: 'POST',
      expected: 201,
      body: { decision: 'reject', reason: 'Keep the current live price' },
    },
  );
  check(
    rejected.status,
    'rejected',
    'second user rejects a fixed-price proposal',
  );
  const liveAfterRejection = await request(`/admin/products/${product.id}`, {
    token: proposer.token,
  });
  check(
    liveAfterRejection.price,
    5000,
    'rejection leaves the live price unchanged',
  );
  await waitForNotification(
    proposer.staff.id,
    'price_approval_rejected',
    secondId,
  );
  const proposerInbox = await request('/me/notifications?per_page=100', {
    token: proposer.token,
  });
  check(
    ['price_approval_approved', 'price_approval_rejected'].every((type) =>
      proposerInbox.data.some((event) => event.type === type),
    ),
    true,
    'proposer receives both approval decisions in the inbox',
  );

  const audit = await db.query(
    `SELECT action FROM audit_logs
     WHERE entity_type='price_publish_approval' AND entity_id IN ($1, $2)`,
    [firstId, secondId],
  );
  for (const action of [
    'prices.fixed.approval_requested',
    'prices.fixed.approval_approved',
    'prices.fixed.approval_rejected',
  ]) {
    check(
      audit.rows.some((row) => row.action === action),
      true,
      `${action} is audited`,
    );
  }

  // Linked-price previews identify exactly which SKU needs a second approver.
  const linkedSku = `C5B-LINKED-${suffix}`.toUpperCase();
  const linked = await request('/admin/products', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      category_id: category.id,
      name_en: `C5b linked ${suffix}`,
      name_ar: `C5b linked ${suffix}`,
      price: 10000,
      tracks_expiry: false,
      status: 'hidden',
      published: false,
      variants: [
        {
          sku: linkedSku,
          base_unit: 'piece',
          pricing_mode: 'linked',
          reference_currency_code: 'USD',
          reference_price: 10,
        },
      ],
    },
  });
  await db.query(
    `INSERT INTO sku_costs
       (variant_id, book_quantity, book_value_iqd, average_cost_iqd, last_landed_cost_iqd)
     VALUES ($1, 1, 20000, 20000, 20000)
     ON CONFLICT (variant_id) DO UPDATE
       SET book_quantity=1, book_value_iqd=20000,
           average_cost_iqd=20000, last_landed_cost_iqd=20000`,
    [linked.variants[0].id],
  );
  const preview = await request('/admin/exchange-rates/linked-price-preview', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      currency_code: 'USD',
      rate: 100,
      basis: 1,
      effective_at: new Date().toISOString(),
      reason: 'C5b preview below cost',
    },
  });
  const linkedItem = preview.items.find((item) => item.sku === linkedSku);
  assert.ok(linkedItem, 'linked preview includes the created SKU');
  assertions += 1;
  check(
    linkedItem.requires_below_cost_approval,
    true,
    'linked preview flags the below-cost SKU before publish',
  );

  console.log(`C5b acceptance passed (${assertions} assertions).`);
} finally {
  await db.end();
}
