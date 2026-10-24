import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error('C22 acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('C22 acceptance requires the runner-owned loopback API');
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function ok(value, message) {
  assert.ok(value, message);
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

async function login(username, password) {
  return request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username, password },
  });
}

async function createProduct(token, categoryId, suffix) {
  return request('/admin/products', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      category_id: categoryId,
      name_ar: `منتج حذف ${suffix}`,
      name_en: `Delete product ${suffix}`,
      price: 10000,
      status: 'hidden',
      published: false,
      variants: [
        {
          sku: `C22-${suffix}`,
          base_unit: 'piece',
          whole_units_only: true,
          selling_price: 10000,
          low_stock_threshold: 2,
        },
      ],
    },
  });
}

try {
  const adminSession = await login('admin', 'Shubayr-Dev-Admin!2026');
  const admin = adminSession.access_token;
  const operations = (await login('operations', 'Shubayr-Dev-Staff!2026'))
    .access_token;

  const me = await request('/me', { token: admin });
  check(me.role, null, 'the Admin surface continues to hide app roles');
  check(me.presets.length, 1, 'the owner has one assigned preset');
  check(me.presets[0].name, 'super_admin', 'the stable preset name is kept');
  check(
    me.presets[0].name_ar,
    'صاحب المتجر',
    'the owner preset has its Arabic display name',
  );
  check(
    me.presets[0].name_en,
    'Store owner',
    'the owner preset has its English display name',
  );

  const suffix = Date.now().toString(36);
  const root = await request('/admin/categories', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      name_ar: `قسم C22 ${suffix}`,
      name_en: `C22 department ${suffix}`,
      slug: `c22-root-${suffix}`,
    },
  });
  const category = await request('/admin/categories', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      parent_id: root.id,
      name_ar: `فئة C22 ${suffix}`,
      name_en: `C22 category ${suffix}`,
      slug: `c22-category-${suffix}`,
    },
  });
  const removable = await createProduct(admin, category.id, `${suffix}-delete`);
  const referenced = await createProduct(
    admin,
    category.id,
    `${suffix}-archive`,
  );
  await db.query(
    `INSERT INTO inventory_batches
       (product_id,variant_id,purchase_cost,currency_code,qty_received,source_type,entry_date)
     VALUES ($1,$2,1000,'IQD',1,'c22_acceptance',now())`,
    [referenced.id, referenced.variants[0].id],
  );
  const missingId = randomUUID();

  await request(`/admin/products/${removable.id}/delete-preview`, {
    token: operations,
    expected: 403,
  });
  await request('/admin/products/bulk-delete', {
    token: operations,
    method: 'POST',
    expected: 403,
    body: {
      operation_id: `c22-denied-${suffix}`,
      ids: [removable.id],
    },
  });

  const singlePreview = await request(
    `/admin/products/${referenced.id}/delete-preview`,
    { token: admin },
  );
  check(singlePreview.outcome, 'archive', 'single preview predicts archival');
  ok(
    singlePreview.reasons.includes('inventory_history'),
    'single preview explains the stock-history reference',
  );

  const listPreview = await request('/admin/products/delete-preview', {
    token: admin,
    method: 'POST',
    body: { ids: [removable.id, referenced.id, missingId] },
  });
  check(
    listPreview.results.map(({ outcome }) => outcome),
    ['delete', 'archive', 'failed'],
    'list preview reports a mixed outcome in request order',
  );
  check(
    listPreview.results[2].reasons,
    ['product_not_found'],
    'list preview explains a missing product',
  );

  const operationId = `c22-delete-${suffix}`;
  const requestBody = {
    operation_id: operationId,
    ids: [removable.id, referenced.id, missingId],
  };
  const applied = await request('/admin/products/bulk-delete', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: requestBody,
  });
  check(
    applied.results.map(({ outcome }) => outcome),
    ['deleted', 'archived', 'failed'],
    'bulk delete applies the previewed mixed outcomes',
  );
  check(
    applied.results[1].reasons,
    singlePreview.reasons,
    'the archived result exactly matches its preview reasons',
  );
  await request(`/admin/products/${removable.id}`, {
    token: admin,
    expected: 404,
  });
  check(
    (await request(`/admin/products/${referenced.id}`, { token: admin }))
      .status,
    'archived',
    'the referenced product is archived rather than deleted',
  );
  const auditBeforeReplay = await db.query(
    `SELECT count(*)::int AS count FROM audit_logs
      WHERE entity_type = 'product' AND entity_id = ANY($1::uuid[])
        AND action IN ('catalog.product.delete_unreferenced','catalog.product.archive_referenced')`,
    [[removable.id, referenced.id]],
  );
  check(
    auditBeforeReplay.rows[0].count,
    2,
    'both applied outcomes are audited',
  );

  const replay = await request('/admin/products/bulk-delete', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: requestBody,
  });
  check(replay, applied, 'an idempotent retry returns the original result');
  const auditAfterReplay = await db.query(
    `SELECT count(*)::int AS count FROM audit_logs
      WHERE entity_type = 'product' AND entity_id = ANY($1::uuid[])
        AND action IN ('catalog.product.delete_unreferenced','catalog.product.archive_referenced')`,
    [[removable.id, referenced.id]],
  );
  check(
    auditAfterReplay.rows[0].count,
    auditBeforeReplay.rows[0].count,
    'an idempotent retry does not audit or mutate twice',
  );
} finally {
  await db.end();
}

console.log(`C22 Admin follow-ups acceptance assertions: ${assertions}`);
