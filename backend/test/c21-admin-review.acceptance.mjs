import assert from 'node:assert/strict';
import JSZip from 'jszip';
import pg from 'pg';
import sharp from 'sharp';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error('C21 acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('C21 acceptance requires the runner-owned loopback API');
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
  { token, method = 'GET', body, form, expected = 200 } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body:
      form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString('utf8');
  check(response.status, expected, `${method} ${path}: ${text}`);
  return text && contentType.includes('json') ? JSON.parse(text) : bytes;
}

async function createProduct(token, categoryId, suffix, overrides = {}) {
  return request('/admin/products', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      category_id: categoryId,
      name_ar: `\u0623\u062c\u0647\u0632\u0629 \u0645\u064f\u0646\u0632\u0644\u064a\u0629 ${suffix}`,
      name_en: `Home Appliances ${suffix}`,
      price: 10000,
      status: 'hidden',
      published: false,
      variants: [
        {
          sku: `C21-${suffix}`,
          base_unit: 'piece',
          whole_units_only: true,
          selling_price: 10000,
          low_stock_threshold: 2,
        },
      ],
      ...overrides,
    },
  });
}

try {
  const version = await request('/version');
  check(version.release, 'development', 'local acceptance exposes its build release');
  check(version.commit, 'unknown', 'local acceptance exposes its build commit');

  const settings = await request('/settings');
  check(
    settings.timezone,
    'Asia/Baghdad',
    'public settings expose the authoritative store timezone',
  );

  const login = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
  });
  const admin = login.access_token;
  check(
    login.user.preferred_ui_language,
    'ar',
    'existing staff default to Arabic',
  );
  const english = await request('/me', {
    token: admin,
    method: 'PATCH',
    body: { preferred_ui_language: 'en' },
  });
  check(english.preferred_ui_language, 'en', 'staff can save English');
  check(
    (await request('/me', { token: admin })).preferred_ui_language,
    'en',
    'the preference survives a separate read',
  );
  await request('/me', {
    token: admin,
    method: 'PATCH',
    body: { preferred_ui_language: 'ar' },
  });

  const permissions = await request('/admin/permissions', { token: admin });
  ok(permissions.length > 90, 'the complete permission registry is returned');
  ok(
    permissions.every(
      (item) =>
        item.key &&
        item.name_ar &&
        item.name_en &&
        item.description_ar &&
        item.description_en,
    ),
    'every permission has complete Arabic and English presentation metadata',
  );
  const permissionSearch = await request(
    `/admin/permissions?q=${encodeURIComponent('\u0642\u0628\u0648\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062a')}`,
    { token: admin },
  );
  ok(
    permissionSearch.some((item) => item.key === 'orders.accept'),
    'Arabic permission metadata is searchable',
  );

  const suffix = Date.now().toString(36);
  const root = await request('/admin/categories', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      name_ar: `\u0642\u0633\u0645 ${suffix}`,
      name_en: `C21 Department ${suffix}`,
      slug: `c21-root-${suffix}`,
    },
  });
  const category = await request('/admin/categories', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      parent_id: root.id,
      name_ar: `\u0641\u0626\u0629 ${suffix}`,
      name_en: `C21 Category ${suffix}`,
      slug: `c21-category-${suffix}`,
    },
  });

  const searchable = await createProduct(admin, category.id, `${suffix}-search`);
  const normalizedArabic = await request(
    `/admin/products?q=${encodeURIComponent(`  \u0627\u062c\u0647\u0632\u0647   \u0645\u0646\u0632\u0644\u064a\u0647 ${suffix}-search`)}`,
    { token: admin },
  );
  ok(
    normalizedArabic.data.some((item) => item.id === searchable.id),
    'Arabic search ignores diacritics, spacing, hamza and agreed letter forms',
  );
  const englishSearch = await request(
    `/admin/products?q=${encodeURIComponent(`Home Appliances ${suffix}-search`)}`,
    { token: admin },
  );
  ok(
    englishSearch.data.some((item) => item.id === searchable.id),
    'English product names remain searchable',
  );
  const skuSearch = await request(
    `/admin/products?q=${encodeURIComponent(`C21-${suffix}-search`)}`,
    { token: admin },
  );
  ok(
    skuSearch.data.some((item) => item.id === searchable.id),
    'variant SKU search remains available to shared Admin pickers',
  );

  const hard = await createProduct(admin, category.id, `${suffix}-hard`);
  const hardResult = await request(`/admin/products/${hard.id}/delete`, {
    token: admin,
    method: 'POST',
    expected: 201,
  });
  check(hardResult, { outcome: 'deleted', reasons: [] }, 'unreferenced product is hard-deleted');
  await request(`/admin/products/${hard.id}`, { token: admin, expected: 404 });

  const referenced = await createProduct(admin, category.id, `${suffix}-archive`);
  await db.query(
    `INSERT INTO inventory_batches
       (product_id,variant_id,purchase_cost,currency_code,qty_received,source_type,entry_date)
     VALUES ($1,$2,1000,'IQD',1,'c21_acceptance',now())`,
    [referenced.id, referenced.variants[0].id],
  );
  const archiveResult = await request(
    `/admin/products/${referenced.id}/delete`,
    { token: admin, method: 'POST', expected: 201 },
  );
  check(archiveResult.outcome, 'archived', 'referenced product is archived');
  ok(
    archiveResult.reasons.includes('inventory_history'),
    'archive response explains the durable stock reference',
  );
  const defaultList = await request(
    `/admin/products?q=${encodeURIComponent(`C21-${suffix}-archive`)}`,
    { token: admin },
  );
  check(defaultList.total, 0, 'archived products are excluded by default');
  const archivedList = await request(
    `/admin/products?q=${encodeURIComponent(`C21-${suffix}-archive`)}&status=archived`,
    { token: admin },
  );
  ok(
    archivedList.data.some((item) => item.id === referenced.id),
    'explicit archived filtering returns the archived product',
  );

  const imageProduct = await createProduct(admin, category.id, `${suffix}-image`);
  const sku = imageProduct.variants[0].sku;
  const rectangle = await sharp({
    create: {
      width: 120,
      height: 60,
      channels: 3,
      background: { r: 180, g: 30, b: 20 },
    },
  })
    .png()
    .toBuffer();
  const zip = new JSZip();
  zip.file(`${sku}.png`, rectangle);
  zip.file(`${sku}-2.png`, Buffer.from('not an image'));
  zip.file(`C21-UNMATCHED-${suffix}.png`, rectangle);
  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  const form = new FormData();
  form.set('file', new Blob([archive], { type: 'application/zip' }), `c21-${suffix}.zip`);
  const imageResult = await request(
    `/admin/catalog-images/bulk?operation_id=c21-images-${suffix}`,
    { token: admin, method: 'POST', expected: 201, form },
  );
  check(imageResult.matched.length, 1, 'the valid image is attached once');
  check(imageResult.failed.length, 1, 'the invalid matched image is reported');
  check(
    imageResult.failed[0].code,
    'CATALOG_IMAGE_PROCESSING_FAILED',
    'per-file processing failures have a stable code',
  );
  ok(
    imageResult.unmatched.includes(`C21-UNMATCHED-${suffix}.png`),
    'unmatched files remain distinct from processing failures',
  );
  const storedResponse = await fetch(imageResult.matched[0].url);
  check(storedResponse.status, 200, 'the transformed image is downloadable');
  const storedMetadata = await sharp(
    Buffer.from(await storedResponse.arrayBuffer()),
  ).metadata();
  check(storedMetadata.width, 60, 'landscape input is center-cropped to its short side');
  check(storedMetadata.height, 60, 'the stored image is a real 1:1 square');

  console.log(`C21 Admin review acceptance passed (${assertions} assertions).`);
} finally {
  await db.end();
}
