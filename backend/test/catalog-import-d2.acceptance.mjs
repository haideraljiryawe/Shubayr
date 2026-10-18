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
  barcode = '',
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
    barcode,
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

async function waitForCommit(
  importId,
  token,
  timeoutMs = 300_000,
  pollMs = 250,
) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const value = await request(`/admin/catalog-imports/${importId}`, {
      token,
    });
    if (!['committing'].includes(value.status)) return value;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Catalog import ${importId} did not finish committing`);
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
  check(committed.status, 'committing', 'commit is queued for the worker');
  const replay = await request(
    `/admin/catalog-imports/${validPreview.id}/commit`,
    {
      token,
      method: 'POST',
      expected: 201,
      body: { operation_id: operationId },
    },
  );
  check(
    replay.operation_id,
    committed.operation_id,
    'duplicate commit keeps the original operation',
  );
  check(
    Number(
      (
        await db.query(
          'SELECT commit_attempt FROM catalog_imports WHERE id=$1',
          [validPreview.id],
        )
      ).rows[0].commit_attempt,
    ),
    1,
    'duplicate commit does not start a second attempt',
  );
  const completed = await waitForCommit(validPreview.id, token);
  check(completed.status, 'completed', 'background commit completes');
  present(completed.opening_id, 'Stock rows produce an opening document');
  const committedRows = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM product_variants WHERE sku=$1) AS new_skus,
       (SELECT COUNT(*)::int FROM inventory_openings WHERE id=$2) AS openings,
       (SELECT COUNT(*)::int FROM inventory_opening_lines WHERE opening_id=$2) AS opening_lines,
       (SELECT name_en FROM products WHERE id=$3) AS updated_name`,
    [newSku, completed.opening_id, existing.id],
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
    'منتجات-جديدة.xlsx',
  );
  check(
    mixed.file_name,
    'منتجات-جديدة.xlsx',
    'Arabic multipart file names remain UTF-8',
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
  const errorReportBytes = Buffer.from(await errorReport.arrayBuffer());
  check(
    [...errorReportBytes.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
    'error report starts with a UTF-8 BOM for Excel',
  );
  check(
    errorReportBytes.toString('utf8').includes('Products+Variants!H2'),
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
  check(
    (await waitForCommit(allowedMissing.id, token)).status,
    'completed',
    'create-missing import completes in the worker',
  );
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
    imageResult.matched.every(
      (item) => item.product_name_ar && item.product_name_en,
    ),
    true,
    'matched image results include both product names',
  );
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

  const failingBarcode = `D2FAIL${suffix}`.slice(0, 30);
  const failingRows = Array.from({ length: 750 }, (_, index) =>
    productRow({
      root: root.name_en,
      leaf: leaf.name_en,
      brand: brand.name_en,
      name: `D2 Batch Failure ${index}`,
      sku: `D2-FAIL-${suffix}-${index}`,
      barcode: index === 500 ? failingBarcode : '',
    }),
  );
  const failingUpload = await multipart(
    '/admin/catalog-imports/preview?create_missing=false',
    token,
    await workbookBuffer(template, failingRows),
    'batch-failure.xlsx',
  );
  const failingReady = await waitForReady(failingUpload.id, token);
  check(failingReady.status, 'ready', 'batch-failure fixture validates');
  await db.query('UPDATE product_variants SET barcode=$1 WHERE sku=$2', [
    failingBarcode,
    existingSku,
  ]);
  const failingOperationId = `d2-failing-${randomUUID()}`;
  await request(`/admin/catalog-imports/${failingReady.id}/commit`, {
    token,
    method: 'POST',
    expected: 201,
    body: { operation_id: failingOperationId },
  });
  const failedImport = await waitForCommit(failingReady.id, token);
  check(
    failedImport.status,
    'failed',
    'a failure in batch three stops the import',
  );
  check(
    failedImport.applied_count,
    500,
    'the first two batches stay committed',
  );
  check(
    [failedImport.commit_batches_done, failedImport.commit_batches_total],
    [2, 3],
    'failed commit reports completed and total batches',
  );
  check(
    failedImport.preview.rows.find((item) => item.row === 502).commit_status,
    'failed',
    'the exact failed workbook row is reported',
  );
  check(
    failedImport.preview.rows.find((item) => item.row === 502).commit_error
      .code,
    'CATALOG_IMPORT_UNIQUE_CONFLICT',
    'the failed row has a clear error code',
  );
  const failedProgress = await request(
    `/admin/catalog-imports/${failingReady.id}/progress`,
    { token },
  );
  check(
    failedProgress,
    {
      id: failingReady.id,
      status: 'failed',
      batches_done: 2,
      batches_total: 3,
      rows_applied: 500,
      rows_failed: 1,
      last_error: {
        code: 'CATALOG_IMPORT_UNIQUE_CONFLICT',
        message: failedProgress.last_error.message,
        sheet: 'Products+Variants',
        row_number: 502,
      },
    },
    'lightweight progress reports the retained batches and last failure',
  );
  check(
    Object.hasOwn(failedProgress, 'preview') ||
      Object.hasOwn(failedProgress, 'rows'),
    false,
    'lightweight progress contains no preview row data',
  );
  check(
    Number(
      (
        await db.query(
          `SELECT COUNT(*) AS count FROM product_variants WHERE sku LIKE $1`,
          [`D2-FAIL-${suffix}-%`],
        )
      ).rows[0].count,
    ),
    500,
    'failed batch is rolled back while prior batches remain',
  );
  await db.query('UPDATE product_variants SET barcode=NULL WHERE sku=$1', [
    existingSku,
  ]);
  await request(`/admin/catalog-imports/${failingReady.id}/commit`, {
    token,
    method: 'POST',
    expected: 201,
    body: { operation_id: failingOperationId },
  });
  const resumedImport = await waitForCommit(failingReady.id, token);
  check(resumedImport.status, 'completed', 'retry resumes the failed import');
  check(
    resumedImport.applied_count,
    750,
    'retry completes all durable row checkpoints',
  );
  check(
    Number(
      (
        await db.query(
          `SELECT COUNT(*) AS count FROM product_variants WHERE sku LIKE $1`,
          [`D2-FAIL-${suffix}-%`],
        )
      ).rows[0].count,
    ),
    750,
    'resume does not duplicate either committed batch',
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
  const largeCommitStarted = performance.now();
  const largeQueued = await request(
    `/admin/catalog-imports/${largeReady.id}/commit`,
    {
      token,
      method: 'POST',
      expected: 201,
      body: { operation_id: `d2-large-${randomUUID()}` },
    },
  );
  check(largeQueued.status, 'committing', '5,000-row commit is queued');
  check(
    [largeQueued.commit_batches_done, largeQueued.commit_batches_total],
    [0, 20],
    'queued 5,000-row commit exposes poll-friendly batch progress',
  );
  const largeCompleted = await waitForCommit(
    largeReady.id,
    token,
    300_000,
    1_000,
  );
  const largeCommitMs = performance.now() - largeCommitStarted;
  check(largeCompleted.status, 'completed', '5,000-row commit succeeds');
  check(largeCompleted.applied_count, 5_000, 'all 5,000 rows are checkpointed');
  check(
    [largeCompleted.commit_batches_done, largeCompleted.commit_batches_total],
    [20, 20],
    'completed 5,000-row commit reports every batch done',
  );
  check(
    Number(
      (
        await db.query(
          `SELECT COUNT(*) AS count FROM product_variants WHERE sku LIKE $1`,
          [`D2-LARGE-${suffix}-%`],
        )
      ).rows[0].count,
    ),
    5_000,
    '5,000-row commit creates every SKU exactly once',
  );

  const historyResponse = await fetch(
    `${api}/admin/catalog-imports?page=1&per_page=20`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const historyText = await historyResponse.text();
  check(historyResponse.status, 200, 'import history loads');
  const history = JSON.parse(historyText);
  check(
    history.data.every((item) => !Object.hasOwn(item, 'preview')),
    true,
    'import history omits full previews',
  );
  check(
    history.data.every((item) => Boolean(item.created_by_name)),
    true,
    'import history includes creator display names',
  );
  check(
    historyText.length < 30_000,
    true,
    'import history payload stays small',
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
  const skuDescending = await request(
    '/admin/products?q=D2-PERF-&status=hidden&sort=sku_desc&page=1&per_page=2',
    { token },
  );
  check(
    skuDescending.data.map((item) => item.variants[0].sku),
    ['D2-PERF-10000', 'D2-PERF-09999'],
    'descending SKU sort is stable',
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
      `5,000-row commit ${largeCommitMs.toFixed(1)} ms; ` +
      `10,000-product max ${maxListMs.toFixed(1)} ms`,
  );
} finally {
  await db.end();
}
