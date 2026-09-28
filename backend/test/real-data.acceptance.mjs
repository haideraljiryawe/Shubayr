import assert from 'node:assert/strict';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(process.env.ACCEPTANCE_DATABASE_NAME ?? '')) {
  throw new Error('Run acceptance through npm run test:acceptance (isolated *_verify database required)');
}
if (!api || new URL(api).hostname !== '127.0.0.1' || !new URL(api).port) {
  throw new Error('Acceptance requires the runner-owned loopback API URL');
}
const customerPhone = process.env.ACCEPTANCE_CUSTOMER_PHONE ?? '+9647700000006';
const expectedOtp = process.env.DEV_OTP ?? '000000';
let assertions = 0;

function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

async function json(
  path,
  { method = 'GET', token, body, expected = 200 } = {},
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

async function login(phone) {
  const requested = await json('/auth/request-otp', {
    method: 'POST',
    body: { phone },
    expected: 201,
  });
  check(
    requested.dev_otp,
    expectedOtp,
    'development OTP must be returned only in development',
  );
  return json('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: requested.dev_otp },
    expected: 201,
  });
}

function adminLogin(username = 'admin', password = 'Shubayr-Dev-Admin!2026') {
  return json('/admin/auth/login', {
    method: 'POST', body: { username, password }, expected: 201,
  });
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
  check(
    response.status,
    201,
    `media upload failed: ${JSON.stringify(payload)}`,
  );
  return payload;
}

const admin = await adminLogin();
check(admin.user.surface, 'admin', 'seeded admin receives an admin-surface session');
check(admin.user.role, null, 'admin sessions never carry an app role');
const suffix = Date.now().toString(36);
const [primaryMedia, secondaryMedia] = await Promise.all([
  upload(admin.access_token, `acceptance-primary-${suffix}.png`),
  upload(admin.access_token, `acceptance-secondary-${suffix}.png`),
]);

const mediaResponse = await fetch(primaryMedia.public_url);
check(mediaResponse.status, 200, 'stable media URL must be publicly readable');
check(
  mediaResponse.headers.get('content-type'),
  'image/png',
  'stable media URL must retain its MIME type',
);

const category = await json('/admin/categories', {
  method: 'POST',
  token: admin.access_token,
  expected: 201,
  body: {
    name_en: `Acceptance Department ${suffix}`,
    name_ar: `قسم القبول ${suffix}`,
    slug: `acceptance-${suffix}`,
    description_en: 'Created by the real-data acceptance test',
    description_ar: 'تم إنشاؤه بواسطة اختبار القبول',
    image_url: primaryMedia.public_url,
    icon_key: 'acceptance_catalog',
    sort_order: 90,
    is_visible: true,
  },
});

const editedCategory = await json(`/admin/categories/${category.id}`, {
  method: 'PATCH',
  token: admin.access_token,
  body: { description_en: 'Persisted category edit', sort_order: 91 },
});
check(
  editedCategory.description_en,
  'Persisted category edit',
  'category edit must persist',
);

const starts = new Date(Date.now() - 60_000).toISOString();
const ends = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const product = await json('/admin/products', {
  method: 'POST',
  token: admin.access_token,
  expected: 201,
  body: {
    category_id: category.id,
    name_en: `Acceptance Product ${suffix}`,
    name_ar: `منتج القبول ${suffix}`,
    description: 'Created through the protected HTTP API',
    price: 20.15,
    discount_type: 'percentage',
    discount_value: 25,
    discount_starts_at: starts,
    discount_ends_at: ends,
    status: 'active',
    images: [
      { url: primaryMedia.public_url },
      { url: secondaryMedia.public_url },
    ],
    variants: [
      {
        sku: `ACC-${suffix}-STD`,
        attributes: { size: 'standard' },
        price_delta: 0,
      },
    ],
  },
});
check(
  product.images[0].url,
  primaryMedia.public_url,
  'first ordered image must be primary',
);

const editedProduct = await json(`/admin/products/${product.id}`, {
  method: 'PATCH',
  token: admin.access_token,
  body: {
    name_en: `Acceptance Product Edited ${suffix}`,
    discount_type: 'percentage',
    discount_value: 50,
    discount_starts_at: starts,
    discount_ends_at: ends,
    media_operations: [
      { op: 'move', image_id: product.images[1].id, position: 0 },
    ],
  },
});
check(
  editedProduct.images[0].id,
  product.images[1].id,
  'media reorder must persist',
);
check(editedProduct.effective_price, 10.08, '20.15 at 50% must round to 10.08');
check(
  editedProduct.on_sale,
  true,
  'active server-time discount must be on sale',
);

const publicCategories = await json('/categories');
const publicCategory = publicCategories.find((item) => item.id === category.id);
check(
  publicCategory?.description_en,
  'Persisted category edit',
  'guest must see the same persisted category',
);
check(
  publicCategory?.image_url,
  primaryMedia.public_url,
  'guest must see the same durable category media',
);

const publicProduct = await json(`/products/${product.id}`);
check(
  publicProduct.name_en,
  `Acceptance Product Edited ${suffix}`,
  'guest must see the same product edit',
);
check(
  publicProduct.images[0].id,
  product.images[1].id,
  'guest must see the same media ordering',
);
check(
  publicProduct.effective_price,
  10.08,
  'guest must receive server-computed effective price',
);

const publicSearch = await json(`/products?q=${encodeURIComponent(suffix)}`);
check(
  publicSearch.data.some((item) => item.id === product.id),
  true,
  'guest search must read the persisted PostgreSQL row',
);

const customer = await login(customerPhone);
check(
  customer.user.role,
  'customer',
  'seeded customer must retain the customer role',
);
const customerProduct = await json(`/products/${product.id}`, {
  token: customer.access_token,
});
check(
  customerProduct.id,
  product.id,
  'customer must see the same public product',
);

await json('/admin/categories', {
  method: 'POST',
  token: customer.access_token,
  expected: 403,
  body: { name_en: 'Denied', name_ar: 'مرفوض' },
});
await json('/admin/categories', {
  method: 'POST',
  expected: 401,
  body: { name_en: 'Denied guest', name_ar: 'ضيف مرفوض' },
});

console.log(`Real-data acceptance passed (${assertions} assertions).`);
