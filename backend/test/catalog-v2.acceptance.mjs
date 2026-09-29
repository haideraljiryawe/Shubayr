import assert from 'node:assert/strict';
import pg from 'pg';

const { Client } = pg;
const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Catalog-v2 acceptance requires the disposable *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error(
    'Catalog-v2 acceptance requires the runner-owned loopback API',
  );
}

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

async function createCategory(token, suffix, name, parentId = null) {
  return request('/admin/categories', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      name_en: name,
      name_ar: name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
      ...(parentId ? { parent_id: parentId } : {}),
    },
  });
}

async function createBrand(token, suffix, name, visible = true) {
  return request('/admin/brands', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      name_en: name,
      name_ar: name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
      is_visible: visible,
      sort_order: 10,
    },
  });
}

async function createProduct(token, suffix, input, expected = 201) {
  return request('/admin/products', {
    token,
    method: 'POST',
    expected,
    body: {
      name_en: `Catalog ${suffix}`,
      name_ar: `Catalog ${suffix}`,
      price: 10000,
      tracks_expiry: false,
      ...input,
    },
  });
}

const adminLogin = await request('/admin/auth/login', {
  method: 'POST',
  expected: 201,
  body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
});
const admin = adminLogin.access_token;
const suffix = Date.now().toString(36);
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

try {
  const rootA = await createCategory(admin, suffix, 'Depth Root A');
  const childA = await createCategory(admin, suffix, 'Depth Child A', rootA.id);
  const grandchild = await request('/admin/categories', {
    token: admin,
    method: 'POST',
    expected: 422,
    body: {
      name_en: 'Too Deep',
      name_ar: 'Too Deep',
      slug: `too-deep-${suffix}`,
      parent_id: childA.id,
    },
  });
  check(
    grandchild.code,
    'CATEGORY_MAX_DEPTH',
    'create depth rejection has a stable code',
  );

  const rootB = await createCategory(admin, suffix, 'Depth Root B');
  const childB = await createCategory(admin, suffix, 'Depth Child B', rootB.id);
  const reparent = await request(`/admin/categories/${rootA.id}`, {
    token: admin,
    method: 'PATCH',
    expected: 422,
    body: { parent_id: childB.id },
  });
  check(
    reparent.code,
    'CATEGORY_MAX_DEPTH',
    'reparenting a parent below a subcategory is rejected',
  );

  const brandA = await createBrand(admin, suffix, 'Acceptance Brand A');
  const brandB = await createBrand(admin, suffix, 'Acceptance Brand B');
  const hiddenBrand = await createBrand(
    admin,
    suffix,
    'Acceptance Hidden Brand',
    false,
  );
  const publicBrands = await request(
    `/brands?q=Acceptance&page=1&per_page=100`,
  );
  check(
    publicBrands.data.some((brand) => brand.id === brandA.id),
    true,
    'visible brand is public',
  );
  check(
    publicBrands.data.some((brand) => brand.id === hiddenBrand.id),
    false,
    'hidden brand is not public',
  );
  const adminBrands = await request(`/admin/brands?q=Hidden&page=1`, {
    token: admin,
  });
  check(
    adminBrands.data[0].id,
    hiddenBrand.id,
    'admin brand search includes hidden rows',
  );

  const sourceRoot = await createCategory(admin, suffix, 'Conversion Root');
  const source = await createCategory(
    admin,
    suffix,
    'Conversion Source',
    sourceRoot.id,
  );
  const conversionProduct = await createProduct(admin, `${suffix}-convert`, {
    category_id: source.id,
    variants: [{ sku: `CONVERT-${suffix}`, base_unit: 'piece' }],
  });
  const converted = await request(
    `/admin/categories/${source.id}/convert-to-brand`,
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        target_category_id: childB.id,
        name_en: 'Converted Brand',
        name_ar: 'Converted Brand',
        slug: `converted-brand-${suffix}`,
        is_visible: true,
      },
    },
  );
  check(converted.moved_products, 1, 'conversion reports moved product count');
  const moved = await request(`/admin/products/${conversionProduct.id}`, {
    token: admin,
  });
  check(
    moved.category_id,
    childB.id,
    'conversion moves products to the selected subcategory',
  );
  check(
    moved.brand_id,
    converted.brand.id,
    'conversion assigns the new independent brand',
  );
  await request(`/admin/categories/${source.id}`, {
    token: admin,
    method: 'PATCH',
    expected: 404,
    body: { name_en: 'gone' },
  });

  const stocked = await createProduct(admin, `${suffix}-stocked`, {
    category_id: childB.id,
    brand_id: brandA.id,
    status: 'active',
    published: true,
    variants: [
      {
        sku: `PIECE-${suffix}`,
        base_unit: 'piece',
        whole_units_only: true,
        selling_price: 10000,
        low_stock_threshold: 2,
      },
      {
        sku: `WEIGHT-${suffix}`,
        base_unit: 'kg',
        whole_units_only: false,
        selling_price: 12000,
        low_stock_threshold: 1,
      },
    ],
  });
  const other = await createProduct(admin, `${suffix}-other`, {
    category_id: childB.id,
    brand_id: brandB.id,
    status: 'active',
    published: true,
    price: 30000,
    variants: [{ sku: `OTHER-${suffix}`, selling_price: 32000 }],
  });
  check(
    stocked.variants[0].effective_price !== stocked.variants[1].effective_price,
    true,
    'two SKUs expose different effective prices',
  );
  check(
    stocked.variants[0].low_stock_threshold !==
      stocked.variants[1].low_stock_threshold,
    true,
    'two SKUs expose different thresholds',
  );

  const filtered = await request(
    `/products?category_id=${childB.id}&brand_id=${brandA.id}&max_price=20000&per_page=100`,
  );
  check(
    filtered.data.some((product) => product.id === stocked.id),
    true,
    'brand filter combines with category and price',
  );
  check(
    filtered.data.some((product) => product.id === other.id),
    false,
    'combined filters exclude the other brand',
  );
  check(
    filtered.facets.brands.some(
      (facet) => facet.brand_id === brandA.id && facet.count >= 1,
    ),
    true,
    'brand facets respect non-brand filters',
  );
  const multiBrand = await request(
    `/products?category_id=${childB.id}&brand_id=${brandA.id},${brandB.id}&per_page=100`,
  );
  check(
    multiBrand.data.some((product) => product.id === other.id),
    true,
    'comma-separated multi-brand selection is supported',
  );

  const location = await db.query(
    'SELECT id FROM warehouse_locations ORDER BY id LIMIT 1',
  );
  const locationId = location.rows[0].id;
  for (const variant of stocked.variants) {
    const quantity = variant.sku.startsWith('WEIGHT-') ? 3 : 10;
    const batch = await db.query(
      `INSERT INTO inventory_batches (product_id, variant_id, purchase_cost, qty_received)
       VALUES ($1, $2, 1, $3) RETURNING id`,
      [stocked.id, variant.id, quantity],
    );
    await db.query(
      'INSERT INTO batch_stock (batch_id, location_id, quantity) VALUES ($1, $2, $3)',
      [batch.rows[0].id, locationId, quantity],
    );
  }
  const availability = await request(`/products/${stocked.id}/availability`);
  const weight = availability.variants.find((variant) =>
    variant.sku.startsWith('WEIGHT-'),
  );
  const piece = availability.variants.find((variant) =>
    variant.sku.startsWith('PIECE-'),
  );
  check(weight.base_unit, 'kg', 'availability carries the SKU base unit');
  check(
    piece.availability,
    'in_stock',
    'piece stock above its threshold is in stock',
  );

  const otp = await request('/auth/request-otp', {
    method: 'POST',
    expected: 200,
    body: { phone: '+9647700000006' },
  });
  const customer = await request('/auth/verify-otp', {
    method: 'POST',
    expected: 200,
    body: { phone: '+9647700000006', code: otp.dev_otp },
  });
  await request('/cart/items', {
    token: customer.access_token,
    method: 'POST',
    expected: 422,
    body: {
      product_id: stocked.id,
      variant_id: piece.variant_id,
      quantity: 2.5,
    },
  });
  const weightedCart = await request('/cart/items', {
    token: customer.access_token,
    method: 'POST',
    body: {
      product_id: stocked.id,
      variant_id: weight.variant_id,
      quantity: 2.5,
    },
  });
  check(
    weightedCart.items.find((item) => item.variant_id === weight.variant_id)
      .quantity,
    2.5,
    'weight SKU accepts 2.5 as a JSON number',
  );

  await db.query(
    `UPDATE batch_stock SET quantity = 0.5
     WHERE batch_id IN (SELECT id FROM inventory_batches WHERE variant_id = $1)`,
    [weight.variant_id],
  );
  const low = await request(`/products/${stocked.id}/availability`);
  const lowWeight = low.variants.find(
    (variant) => variant.variant_id === weight.variant_id,
  );
  check(
    lowWeight.available_qty,
    0.5,
    'fractional sellable stock stays exact in JSON',
  );
  check(lowWeight.availability, 'low_stock', '0.5 is low stock at threshold 1');
  check(
    low.availability,
    'in_stock',
    'product summary uses the best SKU state',
  );

  const hiddenProduct = await createProduct(admin, `${suffix}-hidden`, {
    category_id: childB.id,
    variants: [{ sku: `HIDDEN-${suffix}`, selling_price: 7000 }],
  });
  const hiddenBatch = await db.query(
    `INSERT INTO inventory_batches (product_id, variant_id, purchase_cost, qty_received)
     VALUES ($1, $2, 1, 5) RETURNING id`,
    [hiddenProduct.id, hiddenProduct.variants[0].id],
  );
  await db.query(
    'INSERT INTO batch_stock (batch_id, location_id, quantity) VALUES ($1, $2, 5)',
    [hiddenBatch.rows[0].id, locationId],
  );
  await request(`/products/${hiddenProduct.id}`, { expected: 404 });
  await db.query('UPDATE products SET price_approved_at = NULL WHERE id = $1', [
    hiddenProduct.id,
  ]);
  const notReady = await request(`/admin/products/${hiddenProduct.id}`, {
    token: admin,
    method: 'PATCH',
    expected: 422,
    body: { published: true },
  });
  check(
    notReady.code,
    'PRODUCT_NOT_READY',
    'stock alone cannot publish an unapproved product',
  );

  await db.query(
    `INSERT INTO currencies (code, name_ar, name_en, symbol, display_precision, is_base, enabled)
     VALUES ('EUR', 'Euro', 'Euro', 'EUR', 2, false, true) ON CONFLICT (code) DO NOTHING`,
  );
  const noRate = await createProduct(
    admin,
    `${suffix}-no-rate`,
    {
      category_id: childB.id,
      variants: [
        {
          sku: `NO-RATE-${suffix}`,
          pricing_mode: 'linked',
          reference_currency_code: 'EUR',
          reference_price: 10,
        },
      ],
    },
    422,
  );
  check(
    noRate.code,
    'PRICING_RATE_REQUIRED',
    'linked pricing never invents an implicit rate',
  );

  await request('/admin/settings', {
    token: admin,
    method: 'PUT',
    body: { settings: { sale_rounding_multiple: '0' } },
  });
  const linked = await createProduct(admin, `${suffix}-linked`, {
    category_id: childB.id,
    brand_id: brandA.id,
    status: 'active',
    published: true,
    price: 10000,
    variants: [
      {
        sku: `LINKED-${suffix}`,
        base_unit: 'piece',
        pricing_mode: 'linked',
        reference_currency_code: 'USD',
        reference_price: 12,
      },
    ],
  });
  const effectiveAt = new Date(Date.now() + 1_000).toISOString();
  const firstPreview = await request(
    '/admin/exchange-rates/linked-price-preview',
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        currency_code: 'USD',
        rate: 1500,
        basis: 1,
        effective_at: effectiveAt,
        reason: 'catalog v2 1500 preview',
      },
    },
  );
  const linkedFirst = firstPreview.items.find(
    (item) => item.variant_id === linked.variants[0].id,
  );
  check(
    linkedFirst.new_price,
    18000,
    '12 USD at 1,500 recomputes to 18,000 IQD',
  );
  const firstPublish = await request(
    '/admin/exchange-rates/publish-linked-prices',
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: { preview_token: firstPreview.preview_token },
    },
  );
  check(
    typeof firstPublish.price_version_id,
    'string',
    'atomic publish records one price version',
  );

  await request('/admin/settings', {
    token: admin,
    method: 'PUT',
    body: { settings: { sale_rounding_multiple: '250' } },
  });
  const roundedPreview = await request(
    '/admin/exchange-rates/linked-price-preview',
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        currency_code: 'USD',
        rate: 1550,
        basis: 1,
        effective_at: new Date(Date.now() + 2_000).toISOString(),
        reason: 'catalog v2 rounded preview',
      },
    },
  );
  const roundedItem = roundedPreview.items.find(
    (item) => item.variant_id === linked.variants[0].id,
  );
  check(
    roundedItem.new_price,
    18750,
    '18,600 rounds upward to the configured 250 multiple',
  );
  await request('/admin/exchange-rates/publish-linked-prices', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { preview_token: roundedPreview.preview_token },
  });

  const rateOnlyPreview = await request(
    '/admin/exchange-rates/linked-price-preview',
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        currency_code: 'USD',
        rate: 1600,
        basis: 1,
        effective_at: new Date(Date.now() + 3_000).toISOString(),
        reason: 'save rate without publishing',
      },
    },
  );
  const rateOnly = await request('/admin/exchange-rates/save-rate-only', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: { preview_token: rateOnlyPreview.preview_token },
  });
  check(rateOnly.mode, 'rate_only', 'rate-only action is explicit');
  const afterRateOnly = await request(`/admin/products/${linked.id}`, {
    token: admin,
  });
  check(
    afterRateOnly.variants[0].published_price,
    18750,
    'rate-only save leaves the published SKU price unchanged',
  );
  check(
    typeof afterRateOnly.variants[0].awaiting_rate_id,
    'string',
    'rate-only save marks the SKU awaiting the new rate',
  );

  const stalePreview = await request(
    '/admin/exchange-rates/linked-price-preview',
    {
      token: admin,
      method: 'POST',
      expected: 201,
      body: {
        currency_code: 'USD',
        rate: 1650,
        basis: 1,
        effective_at: new Date(Date.now() + 4_000).toISOString(),
        reason: 'preview made stale',
      },
    },
  );
  await request('/admin/exchange-rates', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      currency_code: 'USD',
      rate: '1700',
      basis: 1,
      effective_at: new Date(Date.now() + 5_000).toISOString(),
      reason: 'invalidate catalog preview',
    },
  });
  const stale = await request('/admin/exchange-rates/publish-linked-prices', {
    token: admin,
    method: 'POST',
    expected: 409,
    body: { preview_token: stalePreview.preview_token },
  });
  check(
    stale.code,
    'STALE_PRICE_PREVIEW',
    'changed rate invalidates an older preview',
  );

  const decrease = await request('/admin/exchange-rates/linked-price-preview', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      currency_code: 'USD',
      rate: 1400,
      basis: 1,
      effective_at: new Date(Date.now() + 6_000).toISOString(),
      reason: 'decrease preview',
    },
  });
  check(
    decrease.items.find((item) => item.variant_id === linked.variants[0].id)
      .percent_change < 0,
    true,
    'preview reports decreases as negative percentages',
  );

  const removed = await request(`/products/${stocked.id}/negotiations`, {
    method: 'POST',
    expected: 410,
    body: { amount: 1 },
  });
  check(
    removed.code,
    'NEGOTIATION_REMOVED',
    'negotiation creation is explicitly refused',
  );
  const publicProduct = await request(`/products/${stocked.id}`);
  for (const field of ['is_negotiable', 'floor_price', 'points_price']) {
    check(
      Object.hasOwn(publicProduct, field),
      false,
      `${field} is gone from product responses`,
    );
  }
} finally {
  await db.end();
}

console.log(`Catalog-v2 acceptance assertions: ${assertions}`);
