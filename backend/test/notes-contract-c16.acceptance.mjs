import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
const databaseName = process.env.ACCEPTANCE_DATABASE_NAME ?? '';
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(databaseName)) {
  throw new Error('C16 acceptance requires the disposable *_verify database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error('C16 acceptance requires the runner-owned loopback API');
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
  { token, method = 'GET', body, headers = {}, expected = 200 } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}

async function upload(token, fileName) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrP8AAAAASUVORK5CYII=',
    'base64',
  );
  const form = new FormData();
  form.set('file', new Blob([png], { type: 'image/png' }), fileName);
  const response = await fetch(`${api}/media/images`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = await response.json();
  check(response.status, 201, `media upload: ${JSON.stringify(payload)}`);
  return payload;
}

async function createProduct(token, suffix, categoryId, overrides = {}) {
  return request('/admin/products', {
    token,
    method: 'POST',
    expected: 201,
    body: {
      category_id: categoryId,
      name_ar: `منتج ${suffix}`,
      name_en: `Product ${suffix}`,
      price: 10000,
      status: 'active',
      published: true,
      variants: [
        {
          sku: `C16-${suffix}`,
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

async function stock(productId, variantId, quantity) {
  const location = (
    await db.query(
      `SELECT wl.id
       FROM warehouse_locations wl
       JOIN warehouses w ON w.id = wl.warehouse_id
       WHERE wl.is_active = TRUE AND wl.is_sellable = TRUE AND w.is_active = TRUE
       ORDER BY wl.id
       LIMIT 1`,
    )
  ).rows[0];
  assert.ok(location, 'a seeded sellable warehouse location is required');
  assertions += 1;
  const batch = (
    await db.query(
      `INSERT INTO inventory_batches
         (product_id, variant_id, purchase_cost, currency_code, qty_received,
          source_type, entry_date)
       VALUES ($1, $2, 1000, 'IQD', $3, 'c16_acceptance', now())
       RETURNING id`,
      [productId, variantId, quantity],
    )
  ).rows[0];
  await db.query(
    `INSERT INTO batch_stock (batch_id, location_id, quantity, reserved)
     VALUES ($1, $2, $3, 0)`,
    [batch.id, location.id, quantity],
  );
}

try {
  const adminLogin = await request('/admin/auth/login', {
    method: 'POST',
    expected: 201,
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
  });
  const admin = adminLogin.access_token;
  const suffix = Date.now().toString(36);

  const root = await request('/admin/categories', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      name_ar: `قسم ${suffix}`,
      name_en: `Department ${suffix}`,
      slug: `c16-root-${suffix}`,
    },
  });
  const category = await request('/admin/categories', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      parent_id: root.id,
      name_ar: `فئة ${suffix}`,
      name_en: `Category ${suffix}`,
      slug: `c16-category-${suffix}`,
      description_en: 'English description only',
    },
  });
  const adminCategories = await request(
    `/admin/categories?parent_id=${category.parent_id}`,
    { token: admin },
  );
  const publicCategories = await request(
    `/categories?parent_id=${category.parent_id}`,
  );
  const adminCategory = adminCategories.find(({ id }) => id === category.id);
  const publicCategory = publicCategories.find(({ id }) => id === category.id);
  check(adminCategory.description_ar, null, 'admin category keeps stored null');
  check(
    publicCategory.description_ar,
    'English description only',
    'public category applies the language fallback',
  );

  const hiddenTarget = await createProduct(
    admin,
    `${suffix}-hidden`,
    category.id,
    { status: 'hidden', published: false },
  );

  const referencedMedia = await upload(admin, `c16-banner-${suffix}.png`);
  const orphanMedia = await upload(admin, `c16-orphan-${suffix}.png`);
  await request(`/media/${orphanMedia.id}`, {
    token: admin,
    method: 'DELETE',
    expected: 204,
  });
  await request(`/media/${orphanMedia.id}`, { expected: 404 });

  // Keep the composition fixture independent from banners made by earlier packs.
  await db.query(`UPDATE banners SET is_active = FALSE`);
  const firstDefault = await request('/admin/banners', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      title: 'Legacy first default',
      internal_name: 'C16 default one',
      image_url: referencedMedia.public_url,
      link_url: 'https://example.test/legacy',
      is_default: true,
      default_priority: 1,
      show_text: false,
    },
  });
  check(firstDefault.action.type, 'url', 'legacy link_url maps to url action');
  check(
    firstDefault.action.url,
    'https://example.test/legacy',
    'legacy URL is retained',
  );
  const secondDefault = await request('/admin/banners', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      title: 'Second default',
      image_url: referencedMedia.public_url,
      action_type: 'none',
      is_default: true,
      default_priority: 2,
    },
  });
  let publicBanners = await request('/banners');
  check(
    publicBanners.map(({ id }) => id),
    [firstDefault.id, secondDefault.id],
    'zero eligible campaigns returns two managed defaults',
  );

  const missingTarget = await request('/admin/banners', {
    token: admin,
    method: 'POST',
    expected: 422,
    body: {
      title: 'Missing target',
      image_url: referencedMedia.public_url,
      action_type: 'product',
      action_target_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    },
  });
  check(
    missingTarget.code,
    'BANNER_ACTION_TARGET_NOT_FOUND',
    'structured action target existence is validated',
  );

  const regularProduct = await request('/admin/banners', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      title: 'Legacy campaign',
      title_ar: 'حملة عربية',
      subtitle_en: 'English subtitle',
      cta_text: 'Legacy CTA',
      show_text: false,
      image_url: referencedMedia.public_url,
      action_type: 'product',
      action_target_id: hiddenTarget.id,
    },
  });
  publicBanners = await request('/banners');
  check(publicBanners.length, 2, 'one campaign is supplemented by one default');
  const resolvedProduct = publicBanners.find(
    ({ id }) => id === regularProduct.id,
  );
  check(
    resolvedProduct.title_en,
    'حملة عربية',
    'English title falls back to Arabic',
  );
  check(
    resolvedProduct.subtitle_ar,
    'English subtitle',
    'Arabic subtitle falls back to English',
  );
  check(resolvedProduct.show_text, false, 'image-only flag is public');
  check(
    resolvedProduct.action.target.id,
    hiddenTarget.id,
    'product target resolves',
  );
  check(
    resolvedProduct.action.target.available,
    false,
    'hidden product target remains identifiable but unavailable',
  );
  const adminRegularProduct = await request(
    `/admin/banners/${regularProduct.id}`,
    { token: admin },
  );
  check(
    adminRegularProduct.title_en,
    null,
    'admin banner read returns the missing stored English title without fallback',
  );

  const regularCategory = await request('/admin/banners', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      title: 'Category campaign',
      title_en: 'Category campaign',
      image_url: referencedMedia.public_url,
      action_type: 'category',
      action_target_id: category.id,
    },
  });
  publicBanners = await request('/banners');
  check(
    publicBanners.map(({ id }) => id),
    [regularProduct.id, regularCategory.id],
    'two campaigns exclude defaults from the public feed',
  );
  check(
    publicBanners[1].action.target.slug,
    category.slug,
    'category action resolves its slug',
  );

  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const scheduled = await request('/admin/banners', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      title: 'Starts later',
      image_url: referencedMedia.public_url,
      starts_at: future,
    },
  });
  const expired = await request('/admin/banners', {
    token: admin,
    method: 'POST',
    expected: 201,
    body: {
      title: 'Ended already',
      image_url: referencedMedia.public_url,
      ends_at: past,
    },
  });
  check(
    scheduled.effective_status,
    'scheduled',
    'start-only schedule is allowed',
  );
  check(expired.effective_status, 'expired', 'end-only schedule is allowed');
  check(
    (await request('/banners')).some(({ id }) => id === expired.id),
    false,
    'expired campaigns are never silently revived',
  );

  const minimum = await request(`/admin/banners/${firstDefault.id}`, {
    token: admin,
    method: 'PATCH',
    expected: 409,
    body: { is_active: false },
  });
  check(
    minimum.code,
    'BANNER_DEFAULT_MINIMUM_REQUIRED',
    'two established usable defaults cannot be reduced below two',
  );
  const protectedDefault = await request(`/admin/banners/${firstDefault.id}`, {
    token: admin,
  });
  check(
    protectedDefault.removal,
    {
      allowed: false,
      reason_code: 'BANNER_DEFAULT_MINIMUM_REQUIRED',
    },
    'admin reads explain why a protected default cannot be removed',
  );
  const swappedDefaults = await request('/admin/banners/defaults/swap', {
    token: admin,
    method: 'POST',
    body: {
      outgoing_id: firstDefault.id,
      incoming_id: regularCategory.id,
    },
  });
  check(
    swappedDefaults.find(({ id }) => id === firstDefault.id).is_default,
    false,
    'default swap removes the outgoing banner atomically',
  );
  check(
    swappedDefaults.find(({ id }) => id === regularCategory.id).is_default,
    true,
    'default swap installs the usable replacement atomically',
  );
  await request(`/media/${referencedMedia.id}`, {
    token: admin,
    method: 'DELETE',
    expected: 409,
  });

  const beforeOrder = await request('/admin/banners?per_page=100', {
    token: admin,
  });
  const beforeIds = beforeOrder.data.map(({ id }) => id);
  await request('/admin/banners/order', {
    token: admin,
    method: 'PUT',
    expected: 422,
    body: { ids: beforeIds.slice(1) },
  });
  check(
    (await request('/admin/banners?per_page=100', { token: admin })).data.map(
      ({ id }) => id,
    ),
    beforeIds,
    'an invalid reorder writes no positions',
  );
  const reversedIds = [...beforeIds].reverse();
  const reordered = await request('/admin/banners/order', {
    token: admin,
    method: 'PUT',
    body: { ids: reversedIds },
  });
  check(
    reordered.map(({ id }) => id),
    reversedIds,
    'one atomic call replaces the full order',
  );

  await request('/admin/settings', {
    token: admin,
    method: 'PUT',
    body: {
      settings: {
        recently_added_enabled: 'true',
        recently_added_max_count: '2',
        recently_added_window_days: '30',
      },
    },
  });
  const publicSettings = await request('/settings');
  check(
    publicSettings.recently_added_enabled,
    true,
    'Recently Added is public',
  );
  check(
    publicSettings.recently_added_max_count,
    2,
    'public maximum is numeric',
  );
  check(
    publicSettings.recently_added_window_days,
    30,
    'public window is numeric',
  );

  // This pack creates products for the banner scenarios above. Move those
  // fixtures outside the rolling window so the Recently Added assertions only
  // measure the four purpose-built rows below.
  await db.query(`UPDATE products SET created_at = now() - interval '31 days'`);
  const recentLow = await createProduct(admin, `${suffix}-low`, category.id);
  const recentIn = await createProduct(admin, `${suffix}-in`, category.id);
  const recentOut = await createProduct(admin, `${suffix}-out`, category.id);
  const oldStocked = await createProduct(admin, `${suffix}-old`, category.id);
  await stock(recentLow.id, recentLow.variants[0].id, 1);
  await stock(recentIn.id, recentIn.variants[0].id, 10);
  await stock(oldStocked.id, oldStocked.variants[0].id, 10);
  await db.query(
    `UPDATE products
     SET created_at = CASE id
       WHEN $1::uuid THEN now() - interval '1 hour'
       WHEN $2::uuid THEN now() - interval '2 hours'
       WHEN $3::uuid THEN now() - interval '30 minutes'
       WHEN $4::uuid THEN now() - interval '31 days'
     END
     WHERE id = ANY($5::uuid[])`,
    [
      recentLow.id,
      recentIn.id,
      recentOut.id,
      oldStocked.id,
      [recentLow.id, recentIn.id, recentOut.id, oldStocked.id],
    ],
  );
  const recentlyPage1 = await request(
    '/products/recently-added?per_page=1&page=1',
  );
  const recentlyPage2 = await request(
    '/products/recently-added?per_page=1&page=2',
  );
  check(recentlyPage1.total, 2, 'max count caps the filtered total');
  check(
    recentlyPage1.data[0].id,
    recentLow.id,
    'positive low stock is eligible',
  );
  check(
    recentlyPage2.data[0].id,
    recentIn.id,
    'stable newest-first pagination',
  );
  check(
    [...recentlyPage1.data, ...recentlyPage2.data].some(
      ({ id }) => id === recentOut.id || id === oldStocked.id,
    ),
    false,
    'out-of-stock and outside-window products are filtered before limiting',
  );
  const createdBefore = (
    await db.query(`SELECT created_at FROM products WHERE id = $1`, [
      recentIn.id,
    ])
  ).rows[0].created_at.toISOString();
  await request(`/admin/products/${recentIn.id}`, {
    token: admin,
    method: 'PATCH',
    body: { name_en: `Republished ${suffix}`, published: true },
  });
  const createdAfter = (
    await db.query(`SELECT created_at FROM products WHERE id = $1`, [
      recentIn.id,
    ])
  ).rows[0].created_at.toISOString();
  check(
    createdAfter,
    createdBefore,
    'editing or republishing does not renew recency',
  );

  const limited = await createProduct(admin, `${suffix}-limited`, category.id, {
    purchase_limit_enabled: true,
    purchase_limit_max_quantity: 3,
    variants: [
      {
        sku: `C16-${suffix}-LIMIT-A`,
        base_unit: 'piece',
        whole_units_only: true,
        selling_price: 10000,
      },
      {
        sku: `C16-${suffix}-LIMIT-B`,
        base_unit: 'piece',
        whole_units_only: true,
        selling_price: 10000,
      },
    ],
  });
  await db.query(
    `UPDATE products SET created_at = now() - interval '31 days' WHERE id = $1`,
    [limited.id],
  );
  await stock(limited.id, limited.variants[0].id, 20);
  await stock(limited.id, limited.variants[1].id, 20);
  const publicLimited = await request(`/products/${limited.id}`);
  check(
    publicLimited.purchase_limit_enabled,
    true,
    'product reads expose limit state',
  );
  check(
    publicLimited.purchase_limit_max_quantity,
    3,
    'product reads expose maximum',
  );

  const otpRequest = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone: '+9647700090016' },
  });
  const customer = await request('/auth/verify-otp', {
    method: 'POST',
    body: { phone: '+9647700090016', code: otpRequest.dev_otp },
  });
  const customerToken = customer.access_token;
  const addBody = {
    product_id: limited.id,
    variant_id: limited.variants[0].id,
    quantity: 2,
  };
  const addHeaders = { 'Idempotency-Key': `c16-add-${suffix}` };
  await request('/cart/items', {
    token: customerToken,
    method: 'POST',
    body: addBody,
    headers: addHeaders,
  });
  const replayedCart = await request('/cart/items', {
    token: customerToken,
    method: 'POST',
    body: addBody,
    headers: addHeaders,
  });
  check(
    replayedCart.items[0].quantity,
    2,
    'cart idempotent replay does not double count',
  );
  const tooMany = await request('/cart/items', {
    token: customerToken,
    method: 'POST',
    expected: 409,
    body: {
      product_id: limited.id,
      variant_id: limited.variants[1].id,
      quantity: 2,
    },
  });
  check(
    tooMany.code,
    'PRODUCT_ORDER_LIMIT_EXCEEDED',
    'cross-variant sum is enforced',
  );
  check(
    tooMany.details,
    {
      product_id: limited.id,
      allowed_quantity: 3,
      requested_quantity: 4,
    },
    'limit refusal reports allowed and requested quantities',
  );
  const allowedCart = await request('/cart/items', {
    token: customerToken,
    method: 'POST',
    body: {
      product_id: limited.id,
      variant_id: limited.variants[1].id,
      quantity: 1,
    },
  });
  check(
    allowedCart.items.reduce((sum, item) => sum + item.quantity, 0),
    3,
    'different variants may reach the product maximum exactly',
  );

  const served = (await request('/governorates')).find(
    ({ is_served: isServed }) => isServed,
  );
  assert.ok(served, 'the D1 acceptance setup must leave a served governorate');
  assertions += 1;
  const address = await request('/addresses', {
    token: customerToken,
    method: 'POST',
    expected: 201,
    body: {
      label: 'C16 checkout',
      governorate_id: served.id,
      city: 'Baghdad',
      area: 'Karrada',
      contact_phone: '+9647700090016',
    },
  });
  const cartRow = (
    await db.query(`SELECT id FROM carts WHERE user_id = $1`, [
      customer.user.id,
    ])
  ).rows[0];
  await db.query(
    `UPDATE cart_items SET quantity = 2
     WHERE cart_id = $1 AND variant_id = $2`,
    [cartRow.id, limited.variants[1].id],
  );
  const checkoutOverLimit = await request('/orders', {
    token: customerToken,
    method: 'POST',
    expected: 409,
    headers: { 'Idempotency-Key': `c16-over-${suffix}` },
    body: { address_id: address.id, payment_method: 'cod' },
  });
  check(
    checkoutOverLimit.code,
    'PRODUCT_ORDER_LIMIT_EXCEEDED',
    'checkout revalidates a cart changed outside the cart API',
  );
  await db.query(
    `UPDATE cart_items SET quantity = 1
     WHERE cart_id = $1 AND variant_id = $2`,
    [cartRow.id, limited.variants[1].id],
  );
  const orderCountBefore = Number(
    (
      await db.query(`SELECT count(*) FROM orders WHERE user_id = $1`, [
        customer.user.id,
      ])
    ).rows[0].count,
  );
  const checkout = {
    token: customerToken,
    method: 'POST',
    expected: 201,
    headers: { 'Idempotency-Key': `c16-checkout-${suffix}` },
    body: { address_id: address.id, payment_method: 'cod' },
  };
  const [firstCheckout, concurrentReplay] = await Promise.all([
    request('/orders', checkout),
    request('/orders', checkout),
  ]);
  check(
    concurrentReplay.id,
    firstCheckout.id,
    'concurrent checkout replay returns the same order',
  );
  const orderCountAfter = Number(
    (
      await db.query(`SELECT count(*) FROM orders WHERE user_id = $1`, [
        customer.user.id,
      ])
    ).rows[0].count,
  );
  check(
    orderCountAfter,
    orderCountBefore + 1,
    'concurrent idempotent checkout creates exactly one order',
  );
  await request(`/orders/${firstCheckout.id}/cancel`, {
    token: customerToken,
    method: 'POST',
    body: { version: firstCheckout.version },
  });

  console.log(`C16 notes contract acceptance: ${assertions} assertions passed`);
} finally {
  await db.end();
}
