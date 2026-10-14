import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import pg from 'pg';
import sharp from 'sharp';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error('D2 acceptance requires a disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('D2 acceptance requires the runner-owned loopback API');
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function present(value, message) {
  assert.ok(value, message);
  assertions += 1;
  return value;
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

async function multipart(path, token, bytes, filename, expected = 201) {
  const form = new FormData();
  form.append('file', new Blob([bytes]), filename);
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  check(response.status, expected, `POST ${path}: ${text}`);
  return payload;
}

async function workbookBuffer(template, productRows, stockRows = []) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const templateProducts = workbook.getWorksheet('Products+Variants');
  const templateStock = workbook.getWorksheet('Stock');
  const productHeaders = templateProducts.getRow(1).values;
  const stockHeaders = templateStock.getRow(1).values;
  workbook.removeWorksheet(templateProducts.id);
  workbook.removeWorksheet(templateStock.id);
  const products = workbook.addWorksheet('Products+Variants');
  const stock = workbook.addWorksheet('Stock');
  products.getRow(1).values = productHeaders;
  stock.getRow(1).values = stockHeaders;
  for (const row of productRows) products.addRow(row);
  for (const row of stockRows) stock.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function productRow({
  root,
  leaf,
  brand = '',
  name,
  sku,
  price = 10_000,
  status = 'hidden',
}) {
  return [
    root,
    leaf,
    brand,
    `${name} AR`,
    name,
    `${name} description AR`,
    `${name} description`,
    sku,
    'color=black;size=standard',
    'piece',
    'yes',
    price,
    '',
    '',
    2,
    '',
    status,
    '',
    '',
    '',
  ];
}

async function waitForReady(importId, token, timeoutMs = 60_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const value = await request(`/admin/catalog-imports/${importId}`, {
      token,
    });
    if (!['queued', 'validating'].includes(value.status)) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Catalog import ${importId} did not finish validation`);
}

const login = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
});
const token = login.access_token;
const actorId = login.user.id;
const suffix = Date.now().toString(36);

try {
  const templateResponse = await fetch(
    `${api}/admin/catalog-imports/template`,
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  check(templateResponse.status, 200, 'template downloads');
  check(
    templateResponse.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'template has the XLSX media type',
  );
  const template = Buffer.from(await templateResponse.arrayBuffer());
  const templateBook = new ExcelJS.Workbook();
  await templateBook.xlsx.load(template);
  check(
    templateBook.worksheets.map(({ name }) => name),
    ['Instructions - التعليمات', 'Products+Variants', 'Stock'],
    'template contains bilingual instructions and both data sheets',
  );

  const root = await request('/admin/categories', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      name_en: `D2 Root ${suffix}`,
      name_ar: `D2 Root ${suffix}`,
      slug: `d2-root-${suffix}`,
    },
  });
  const leaf = await request('/admin/categories', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      parent_id: root.id,
      name_en: `D2 Leaf ${suffix}`,
      name_ar: `D2 Leaf ${suffix}`,
      slug: `d2-leaf-${suffix}`,
    },
  });
  const brand = await request('/admin/brands', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      name_en: `D2 Brand ${suffix}`,
      name_ar: `D2 Brand ${suffix}`,
      slug: `d2-brand-${suffix}`,
      is_visible: false,
      sort_order: 0,
    },
  });
  const existingSku = `D2-UPDATE-${suffix}`;
  const newSku = `D2-NEW-${suffix}`;
  const existing = await request('/admin/products', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      category_id: leaf.id,
      brand_id: brand.id,
      name_en: 'D2 Before',
      name_ar: 'D2 Before',
      price: 9_000,
      status: 'hidden',
      variants: [
        { sku: existingSku, base_unit: 'piece', whole_units_only: true },
      ],
    },
  });
  const locationResult = await db.query(
    `SELECT wl.code
       FROM warehouse_locations wl
       JOIN warehouses w ON w.id=wl.warehouse_id
      WHERE wl.is_active=true AND w.is_active=true
      GROUP BY wl.code HAVING COUNT(*)=1 ORDER BY wl.code LIMIT 1`,
  );
  const locationCode = present(
    locationResult.rows[0]?.code,
    'one unambiguous active location is seeded',
  );

  const validFile = await workbookBuffer(
    template,
    [
      productRow({
        root: root.name_en,
        leaf: leaf.name_en,
        brand: brand.name_en,
        name: 'D2 Updated',
        sku: existingSku,
        price: 11_000,
      }),
      productRow({
        root: root.name_en,
        leaf: leaf.name_en,
        brand: brand.name_en,
        name: 'D2 New',
        sku: newSku,
        price: 12_000,
      }),
    ],
    [[newSku, locationCode, 5, 7_000, '']],
  );
  const beforePreview = await db.query(
    `SELECT (SELECT COUNT(*) FROM products)::int AS products,
            (SELECT COUNT(*) FROM inventory_openings)::int AS openings`,
  );
  const validPreview = await multipart(
    '/admin/catalog-imports/preview?create_missing=false',
    token,
    validFile,
    'valid.xlsx',
  );
  check(
    validPreview.status,
    'ready',
    'small valid file is previewed synchronously',
  );
  check(validPreview.preview.counts.update, 1, 'existing SKU is an update');
  check(
    validPreview.preview.counts.error,
    0,
    `valid preview has no errors: ${JSON.stringify(validPreview.preview.rows)}`,
  );
  const afterPreview = await db.query(
    `SELECT (SELECT COUNT(*) FROM products)::int AS products,
            (SELECT COUNT(*) FROM inventory_openings)::int AS openings`,
  );
  check(
    afterPreview.rows[0],
    beforePreview.rows[0],
    'preview writes no product or inventory document',
  );
  const operationId = `d2-import-${randomUUID()}`;
  const committed = await request(
    `/admin/catalog-imports/${validPreview.id}/commit`,
    {
      token,
      method: 'POST',
      expected: 201,
      body: { operation_id: operationId },
    },
  );
  present(committed.opening_id, 'Stock rows produce an opening document');
  const replay = await request(
    `/admin/catalog-imports/${validPreview.id}/commit`,
    {
      token,
      method: 'POST',
      expected: 201,
      body: { operation_id: operationId },
    },
  );
  check(replay, committed, 'duplicate commit returns the original result');
  const committedRows = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM product_variants WHERE sku=$1) AS new_skus,
       (SELECT COUNT(*)::int FROM inventory_openings WHERE id=$2) AS openings,
       (SELECT COUNT(*)::int FROM inventory_opening_lines WHERE opening_id=$2) AS opening_lines,
       (SELECT name_en FROM products WHERE id=$3) AS updated_name`,
    [newSku, committed.opening_id, existing.id],
  );
  check(committedRows.rows[0].new_skus, 1, 'new SKU is created exactly once');
  check(committedRows.rows[0].openings, 1, 'opening is created exactly once');
  check(
    committedRows.rows[0].opening_lines,
    1,
    'all Stock rows share one opening',
  );
  check(
    committedRows.rows[0].updated_name,
    'D2 Updated',
    'SKU match updates its existing product',
  );

  const mixedFile = await workbookBuffer(template, [
    productRow({
      root: root.name_en,
      leaf: leaf.name_en,
      name: 'D2 Error',
      sku: '',
    }),
    productRow({
      root: 'Missing Root',
      leaf: 'Missing Leaf',
      name: 'D2 Missing',
      sku: `D2-MIXED-${suffix}`,
    }),
  ]);
  const mixedBefore = Number(
    (await db.query('SELECT COUNT(*) AS count FROM products')).rows[0].count,
  );
  const mixed = await multipart(
    '/admin/catalog-imports/preview?create_missing=false',
    token,
    mixedFile,
    'mixed.xlsx',
  );
  check(mixed.preview.counts.error, 2, 'mixed preview lists every invalid row');
  check(
    mixed.preview.rows[0].issues.some(
      (issue) => issue.cell === 'Products+Variants!H2',
    ),
    true,
    'mixed preview reports an exact cell',
  );
  check(
    Number(
      (await db.query('SELECT COUNT(*) AS count FROM products')).rows[0].count,
    ),
    mixedBefore,
    'mixed preview writes no product',
  );
  const errorReport = await fetch(
    `${api}/admin/catalog-imports/${mixed.id}/error-report`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  check(errorReport.status, 200, 'error report downloads');
  check(
    (await errorReport.text()).includes('Products+Variants!H2'),
    true,
    'error report contains exact cell references',
  );

  const missingRoot = `D2 Created Root ${suffix}`;
  const missingLeaf = `D2 Created Leaf ${suffix}`;
  const missingBrand = `D2 Created Brand ${suffix}`;
  const missingSku = `D2-CREATE-MISSING-${suffix}`;
  const missingFile = await workbookBuffer(template, [
    productRow({
      root: missingRoot,
      leaf: missingLeaf,
      brand: missingBrand,
      name: 'D2 Create Missing',
      sku: missingSku,
    }),
  ]);
  const refusedMissing = await multipart(
    '/admin/catalog-imports/preview?create_missing=false',
    token,
    missingFile,
    'missing-refused.xlsx',
  );
  check(
    refusedMissing.preview.counts.error,
    1,
    'missing taxonomy is refused by default',
  );
  const allowedMissing = await multipart(
    '/admin/catalog-imports/preview?create_missing=true',
    token,
    missingFile,
    'missing-created.xlsx',
  );
  check(
    allowedMissing.preview.counts.error,
    0,
    'create-missing allows the row',
  );
  await request(`/admin/catalog-imports/${allowedMissing.id}/commit`, {
    token,
    method: 'POST',
    expected: 201,
    body: { operation_id: `d2-missing-${randomUUID()}` },
  });
  const taxonomy = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM categories WHERE name_en=$1 AND parent_id IS NULL) AS roots,
       (SELECT COUNT(*)::int FROM categories child JOIN categories root ON root.id=child.parent_id WHERE child.name_en=$2 AND root.name_en=$1) AS leaves,
       (SELECT COUNT(*)::int FROM brands WHERE name_en=$3) AS brands`,
    [missingRoot, missingLeaf, missingBrand],
  );
  check(
    taxonomy.rows[0],
    { roots: 1, leaves: 1, brands: 1 },
    'create-missing enforces exactly two category levels and one brand',
  );

  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#336699' },
  })
    .png()
    .toBuffer();
  const zip = new JSZip();
  zip.file(`${newSku}.jpg`, png);
  zip.file(`${newSku}-2.png`, png);
  zip.file(`UNMATCHED-${suffix}.jpg`, png);
  const imageResult = await multipart(
    `/admin/catalog-images/bulk?operation_id=${encodeURIComponent(`d2-images-${randomUUID()}`)}`,
    token,
    await zip.generateAsync({ type: 'nodebuffer' }),
    'images.zip',
  );
  check(imageResult.matched.length, 2, 'two SKU images are attached');
  check(
    imageResult.unmatched,
    [`UNMATCHED-${suffix}.jpg`],
    'unmatched image is reported',
  );
  const storedImages = await db.query(
    `SELECT pi.sort_order, mo.mime_type
       FROM product_images pi JOIN media_objects mo ON mo.public_url=pi.url
       JOIN products p ON p.id=pi.product_id
       JOIN product_variants pv ON pv.product_id=p.id
      WHERE pv.sku=$1 ORDER BY pi.sort_order`,
    [newSku],
  );
  check(
    storedImages.rows.map((row) => row.sort_order),
    [0, 1],
    'ZIP image order is contiguous',
  );
  check(
    storedImages.rows.every((row) => row.mime_type === 'image/webp'),
    true,
    'ZIP images are compressed to WebP',
  );

  const largeRows = Array.from({ length: 5_000 }, (_, index) =>
    productRow({
      root: root.name_en,
      leaf: leaf.name_en,
      brand: brand.name_en,
      name: `D2 Large ${index}`,
      sku: `D2-LARGE-${suffix}-${index}`,
    }),
  );
  const largeFile = await workbookBuffer(template, largeRows);
  const largeStarted = performance.now();
  const queued = await multipart(
    '/admin/catalog-imports/preview?create_missing=false',
    token,
    largeFile,
    'large-5000.xlsx',
  );
  check(queued.status, 'queued', '5,000-row preview runs as a background job');
  const largeReady = await waitForReady(queued.id, token);
  const largeMs = performance.now() - largeStarted;
  check(largeReady.status, 'ready', '5,000-row preview completes');
  check(largeReady.row_count, 5_000, '5,000-row count is retained');
  check(largeReady.preview.counts.error, 0, '5,000 valid rows stay valid');
  check(
    largeMs < 30_000,
    true,
    `5,000-row preview completes in 30 seconds (${largeMs.toFixed(1)} ms)`,
  );

  await db.query(
    'CREATE TEMP TABLE d2_perf_products (n int PRIMARY KEY, id uuid NOT NULL)',
  );
  await db.query(
    `INSERT INTO d2_perf_products(n,id)
     SELECT n, gen_random_uuid() FROM generate_series(1,10000) n`,
  );
  await db.query(
    `INSERT INTO products
       (id, category_id, name_en, name_ar, price, status, price_approved_at,
        price_proposed_by, created_at, updated_at)
     SELECT id, $1, 'D2 Perf Product ' || n, 'D2 Perf Product ' || n,
            10000+n, 'hidden', now(), $2, now(), now()
       FROM d2_perf_products`,
    [leaf.id, actorId],
  );
  await db.query(
    `INSERT INTO product_variants
       (product_id, sku, base_unit, whole_units_only, selling_price,
        price_approved_at, price_proposed_by, updated_at)
     SELECT id, 'D2-PERF-' || lpad(n::text,5,'0'), 'piece', true,
            10000+n, now(), $1, now()
       FROM d2_perf_products`,
    [actorId],
  );
  const performancePath =
    '/admin/products?q=D2-PERF-09999&status=hidden&availability=out_of_stock&has_image=false&sort=sku_asc&page=1&per_page=20';
  await request(performancePath, { token });
  const measurements = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const started = performance.now();
    const page = await request(performancePath, { token });
    measurements.push(performance.now() - started);
    check(page.total, 1, 'SKU search returns the one matching row');
    check(
      page.data[0].variants[0].sku,
      'D2-PERF-09999',
      'SKU search result is exact',
    );
  }
  const maxListMs = Math.max(...measurements);
  check(
    maxListMs < 300,
    true,
    `10,000-product filtered list stays under 300 ms (${maxListMs.toFixed(1)} ms)`,
  );
  const audit = await db.query(
    `SELECT COUNT(*)::int AS count FROM audit_logs
      WHERE actor_id=$1 AND action IN ('catalog.import.commit','catalog.images.bulk_upload')`,
    [actorId],
  );
  check(audit.rows[0].count >= 3, true, 'imports and bulk images are audited');

  console.log(
    `D2 catalog import acceptance: ${assertions} assertions; ` +
      `5,000-row validation ${largeMs.toFixed(1)} ms; ` +
      `10,000-product max ${maxListMs.toFixed(1)} ms`,
  );
} finally {
  await db.end();
}
