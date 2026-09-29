/**
 * Pre-mobile-integration QA fixes, proven against a disposable database.
 *
 * Covers the five backend issues from the team's review:
 *   1. effective (inherited) category visibility on public reads
 *   2. stable product variant ids across an update
 *   3. PATCH null handling and merged stored+incoming validation
 *   4. contact_phone trimming and rejection of blank/invalid values
 *   5. schema.prisma <-> migrations <-> database foreign-key agreement
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (!/^shubayr_[a-f0-9]{16}_verify$/.test(process.env.ACCEPTANCE_DATABASE_NAME ?? '')) {
  throw new Error('QA fix acceptance requires the runner-owned disposable database');
}
if (!api || new URL(api).hostname !== '127.0.0.1') throw new Error('QA fix acceptance requires the loopback API');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions++; }
async function request(path, { token, method = 'GET', body, expected = 200 } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const content = await response.text();
  const payload = content ? JSON.parse(content) : undefined;
  check(response.status, expected, `${method} ${path}: ${content}`);
  return payload;
}
async function login(phone) {
  const challenge = await request('/auth/request-otp', { method: 'POST', expected: 200, body: { phone } });
  return (await request('/auth/verify-otp', { method: 'POST', expected: 200, body: { phone, code: challenge.dev_otp } })).access_token;
}
async function adminLogin() {
  return (await request('/admin/auth/login', { method: 'POST', expected: 201, body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' } })).access_token;
}
async function row(sql, args = []) { return (await db.query(sql, args)).rows[0]; }
const tag = randomUUID().slice(0, 8);

try {
  const admin = await adminLogin();
  const customer = await login('+9647700000006');

  // ---------------------------------------------------------------- issue 1
  // Effective visibility: a hidden ancestor hides its whole subtree publicly.
  const parent = await request('/admin/categories', { token: admin, method: 'POST', expected: 201,
    body: { name_en: `QA Parent ${tag}`, name_ar: `QA Parent ${tag}`, slug: `qa-parent-${tag}` } });
  const child = await request('/admin/categories', { token: admin, method: 'POST', expected: 201,
    body: { name_en: `QA Child ${tag}`, name_ar: `QA Child ${tag}`, slug: `qa-child-${tag}`, parent_id: parent.id } });
  const product = await request('/admin/products', { token: admin, method: 'POST', expected: 201,
    body: {
      category_id: child.id,
      name_en: `QA Product ${tag}`,
      name_ar: `QA Product ${tag}`,
      price: 100,
      status: 'active',
      variants: [{ sku: `QA-${tag}-PUBLIC`, base_unit: 'piece', whole_units_only: true }],
    } });

  const listsProduct = async (token) =>
    (await request(`/products?category_id=${child.id}&per_page=100`, token ? { token } : {}))
      .data.some(({ id }) => id === product.id);

  check(await listsProduct(), true, 'visible child under visible parent is listed publicly');
  check(await request(`/products/${product.id}`).then(({ id }) => id), product.id, 'visible product readable publicly');

  // Hide only the PARENT: the child stays is_visible=true, so anything that
  // fails to walk the ancestor chain still returns the product.
  await request(`/admin/categories/${parent.id}`, { token: admin, method: 'PATCH', body: { is_visible: false } });
  check((await row('SELECT is_visible FROM categories WHERE id=$1', [child.id])).is_visible, true, 'child itself stays visible');
  check(await listsProduct(), false, 'product under a hidden PARENT is excluded from ?category_id=');
  check((await request('/products?per_page=100')).data.some(({ id }) => id === product.id), false,
    'product under a hidden parent is excluded from the unfiltered public list');
  await request(`/products/${product.id}`, { expected: 404 });
  check((await request(`/admin/products?category_id=${child.id}&per_page=100`, { token: admin }))
    .data.some(({ id }) => id === product.id), true, 'admin read still sees the hidden subtree');

  // Direct hidden category, visible parent.
  await request(`/admin/categories/${parent.id}`, { token: admin, method: 'PATCH', body: { is_visible: true } });
  await request(`/admin/categories/${child.id}`, { token: admin, method: 'PATCH', body: { is_visible: false } });
  check(await listsProduct(), false, 'product in a directly hidden category is excluded');
  await request(`/admin/categories/${child.id}`, { token: admin, method: 'PATCH', body: { is_visible: true } });
  check(await listsProduct(), true, 'restoring visibility restores the public listing');

  // ---------------------------------------------------------------- issue 2
  // Variant identity survives an update instead of being delete+recreated.
  const withVariants = await request('/admin/products', { token: admin, method: 'POST', expected: 201,
    body: { category_id: child.id, name_en: `QA Variants ${tag}`, name_ar: `QA Variants ${tag}`, price: 50,
      variants: [{ sku: `QA-${tag}-A`, price_delta: 0 }, { sku: `QA-${tag}-B`, price_delta: 5 }] } });
  const idOf = (entity, sku) => entity.variants.find((variant) => variant.sku === sku).id;
  const firstA = idOf(withVariants, `QA-${tag}-A`);
  const firstB = idOf(withVariants, `QA-${tag}-B`);

  const renamed = await request(`/admin/products/${withVariants.id}`, { token: admin, method: 'PATCH',
    body: { name_en: `QA Variants ${tag} v2`,
      variants: [{ sku: `QA-${tag}-A`, price_delta: 0 }, { sku: `QA-${tag}-B`, price_delta: 7 }] } });
  check(idOf(renamed, `QA-${tag}-A`), firstA, 'update keeps the first variant id');
  check(idOf(renamed, `QA-${tag}-B`), firstB, 'update keeps the second variant id');
  check(Number(renamed.variants.find((variant) => variant.sku === `QA-${tag}-B`).price_delta), 7, 'variant edited in place');

  // Reference variant A from inventory: the old delete+recreate hit an
  // ON DELETE NO ACTION foreign key and surfaced as a 500.
  await db.query(
    `INSERT INTO inventory_batches (id, product_id, variant_id, purchase_cost, qty_received)
     VALUES ($1, $2, $3, 10, 5)`,
    [randomUUID(), withVariants.id, firstA],
  );
  const afterBatch = await request(`/admin/products/${withVariants.id}`, { token: admin, method: 'PATCH',
    body: { name_en: `QA Variants ${tag} v3`,
      variants: [{ sku: `QA-${tag}-A`, price_delta: 1 }, { sku: `QA-${tag}-B`, price_delta: 7 }] } });
  check(idOf(afterBatch, `QA-${tag}-A`), firstA, 'inventory-referenced variant survives an update with its id');
  check(Number(afterBatch.variants.find((variant) => variant.sku === `QA-${tag}-A`).price_delta), 1,
    'inventory-referenced variant is edited in place');

  // Adding and removing.
  const added = await request(`/admin/products/${withVariants.id}`, { token: admin, method: 'PATCH',
    body: { variants: [{ sku: `QA-${tag}-A`, price_delta: 1 }, { sku: `QA-${tag}-B`, price_delta: 7 }, { sku: `QA-${tag}-C`, price_delta: 3 }] } });
  check(added.variants.length, 3, 'a new variant is added');
  check(idOf(added, `QA-${tag}-A`), firstA, 'adding a variant does not disturb existing ids');
  const firstC = idOf(added, `QA-${tag}-C`);

  const removed = await request(`/admin/products/${withVariants.id}`, { token: admin, method: 'PATCH',
    body: { variants: [{ sku: `QA-${tag}-A`, price_delta: 1 }, { sku: `QA-${tag}-B`, price_delta: 7 }] } });
  check(removed.variants.length, 2, 'an unreferenced variant is removed');
  check((await row('SELECT count(*)::int AS count FROM product_variants WHERE id=$1', [firstC])).count, 0,
    'removed variant row is gone');

  // Removing the inventory-referenced variant is refused with the unified 422.
  const refusal = await request(`/admin/products/${withVariants.id}`, { token: admin, method: 'PATCH', expected: 422,
    body: { variants: [{ sku: `QA-${tag}-B`, price_delta: 7 }] } });
  check(refusal.code, 'VALIDATION_FAILED', 'removing a referenced variant is a 422, never a 500');
  check((await row('SELECT count(*)::int AS count FROM product_variants WHERE id=$1', [firstA])).count, 1,
    'the referenced variant is still intact after the refusal');

  // An explicit id renames a SKU without losing identity.
  const byId = await request(`/admin/products/${withVariants.id}`, { token: admin, method: 'PATCH',
    body: { variants: [{ id: firstA, sku: `QA-${tag}-A2`, price_delta: 1 }, { sku: `QA-${tag}-B`, price_delta: 7 }] } });
  check(idOf(byId, `QA-${tag}-A2`), firstA, 'a variant matched by id keeps its id across a SKU rename');

  // ---------------------------------------------------------------- issue 3
  // PATCH: invalid nulls are 422, omitted fields are preserved, and validation
  // runs against the MERGED stored+incoming state.
  const patchTarget = await request('/admin/products', { token: admin, method: 'POST', expected: 201,
    body: { category_id: child.id, name_en: `QA Patch ${tag}`, name_ar: `QA Patch AR ${tag}`, price: 100,
      description: 'original', status: 'active',
      variants: [{ sku: `QA-${tag}-PATCH`, base_unit: 'piece', whole_units_only: true }] } });

  for (const field of ['category_id', 'price', 'name_en', 'name_ar', 'status', 'is_negotiable', 'tracks_expiry']) {
    const rejected = await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH', expected: 422,
      body: { [field]: null } });
    check(rejected.code, 'VALIDATION_FAILED', `null ${field} is rejected with 422 rather than a 500`);
  }

  const partial = await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH',
    body: { name_en: `QA Patch ${tag} renamed` } });
  check(partial.name_ar, `QA Patch AR ${tag}`, 'omitted name_ar preserved');
  check(partial.description, 'original', 'omitted description preserved');
  check(Number(partial.price), 100, 'omitted price preserved');

  // The headline case: an amount discount with no price in the payload. The
  // stored price is what the rule must be checked against.
  const amount = await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH',
    body: { discount_type: 'amount', discount_value: 25 } });
  check(amount.discount_type, 'amount', 'amount discount accepted without resending price');
  check(amount.effective_price, 75, 'amount discount applied against the stored price');

  // Merged-state validation still rejects a discount larger than the stored price.
  const tooBig = await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH', expected: 422,
    body: { discount_type: 'amount', discount_value: 500 } });
  check(tooBig.code, 'VALIDATION_FAILED', 'amount discount above the stored price is rejected on merged state');
  await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH', expected: 422,
    body: { discount_type: 'percentage', discount_value: 150 } });
  await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH', expected: 422,
    body: { discount_type: null, discount_value: 5 } });
  const percentage = await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH',
    body: { discount_type: 'percentage', discount_value: 10 } });
  check(percentage.effective_price, 90, 'percentage discount still validated and applied on merged state');
  // Nullable fields still accept an explicit null.
  const cleared = await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH',
    body: { discount_type: null, description: null } });
  check(cleared.discount_type, null, 'discount_type=null clears the discount definition');
  check(cleared.description, null, 'a genuinely nullable field still accepts null');

  // Remaining PATCH regressions: invalid inputs must fail before services.
  for (const [path, body] of [
    [`/admin/categories/${child.id}`, { name_en: null }],
    [`/admin/categories/${child.id}`, { is_visible: null }],
    ['/me', { name: null }],
    [`/admin/categories/${child.id}`, {}],
    [`/admin/products/${patchTarget.id}`, {}],
    [`/admin/products/${patchTarget.id}`, { media_operations: null }],
  ]) {
    const rejected = await request(path, { token: admin, method: 'PATCH', expected: 422, body });
    check(rejected.code, 'VALIDATION_FAILED', 'invalid PATCH uses the unified validation envelope');
  }
  check((await row('SELECT name_en, is_visible FROM categories WHERE id=$1', [child.id])),
    { name_en: child.name_en, is_visible: true }, 'rejected category patches leave the row intact');

  const schedule = {
    discount_starts_at: '2020-01-01T00:00:00.000Z',
    discount_ends_at: '2030-01-01T00:00:00.000Z',
  };
  await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH',
    body: { discount_type: 'percentage', discount_value: 20, ...schedule } });
  const renamedScheduled = await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH',
    body: { name_en: 'Scheduled product renamed' } });
  check([renamedScheduled.discount_type, renamedScheduled.discount_value,
    renamedScheduled.discount_starts_at, renamedScheduled.discount_ends_at],
    ['percentage', 20, schedule.discount_starts_at, schedule.discount_ends_at],
    'unrelated PATCH preserves the entire scheduled definition');
  const scheduledAmount = await request(`/admin/products/${patchTarget.id}`, { token: admin, method: 'PATCH',
    body: { discount_type: 'amount', discount_value: 25 } });
  check(scheduledAmount.effective_price, 75, 'partial amount still uses the stored price');
  check([scheduledAmount.discount_starts_at, scheduledAmount.discount_ends_at],
    [schedule.discount_starts_at, schedule.discount_ends_at], 'partial amount keeps both schedule bounds');

  // ---------------------------------------------------------------- issue 4
  // contact_phone is trimmed and validated on create and on PATCH.
  await request('/addresses', { token: customer, method: 'POST', expected: 422,
    body: { city: 'Baghdad', contact_phone: '   ' } });
  await request('/addresses', { token: customer, method: 'POST', expected: 422,
    body: { city: 'Baghdad', contact_phone: '' } });
  await request('/addresses', { token: customer, method: 'POST', expected: 422,
    body: { city: 'Baghdad', contact_phone: 'not-a-phone' } });
  const created = await request('/addresses', { token: customer, method: 'POST', expected: 201,
    body: { city: 'Baghdad', contact_phone: '  +9647701234567  ' } });
  check(created.contact_phone, '+9647701234567', 'surrounding whitespace trimmed in the response');
  check((await row('SELECT contact_phone FROM addresses WHERE id=$1', [created.id])).contact_phone,
    '+9647701234567', 'trimmed value is what gets stored');

  await request(`/addresses/${created.id}`, { token: customer, method: 'PATCH', expected: 422,
    body: { contact_phone: '   ' } });
  await request(`/addresses/${created.id}`, { token: customer, method: 'PATCH', expected: 422,
    body: { contact_phone: 'still-not-a-phone' } });
  const patched = await request(`/addresses/${created.id}`, { token: customer, method: 'PATCH',
    body: { contact_phone: ' +9647709876543 ' } });
  check(patched.contact_phone, '+9647709876543', 'PATCH normalises the phone too');
  check((await row('SELECT contact_phone FROM addresses WHERE id=$1', [created.id])).contact_phone,
    '+9647709876543', 'PATCH stores the trimmed value');
  check((await row(
    "SELECT count(*)::int AS count FROM addresses WHERE contact_phone <> btrim(contact_phone) OR btrim(contact_phone) = ''",
  )).count, 0, 'no whitespace-only or untrimmed contact_phone exists in the database');

  // ---------------------------------------------------------------- issue 5
  // schema.prisma, the migrations and the migrated database agree on ON UPDATE.
  // (CI additionally gates this with `npm run prisma:drift-check`.)
  const drifted = [
    'order_status_events_order_id_fkey',
    'simple_stock_holds_order_id_fkey',
    'simple_stock_holds_order_item_id_fkey',
    'simple_stock_holds_product_id_fkey',
    'simple_stock_holds_variant_id_fkey',
    'notification_channel_preferences_user_id_fkey',
    'notification_events_user_id_fkey',
    'notification_logs_event_id_fkey',
    'notification_logs_user_id_fkey',
  ];
  const foreignKeys = (await db.query(
    `SELECT c.conname,
            CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT'
                               WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update
     FROM pg_constraint c
     WHERE c.contype = 'f' AND c.conname = ANY($1::text[])`,
    [drifted],
  )).rows;
  check(foreignKeys.length, drifted.length, 'all nine previously drifting foreign keys exist');
  for (const { conname, on_update } of foreignKeys) {
    check(on_update, 'NO ACTION', `${conname} keeps the project-wide ON UPDATE NO ACTION rule`);
  }
  check((await row(
    `SELECT count(*)::int AS count FROM pg_constraint
     WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND confupdtype <> 'a'`,
  )).count, 0, 'no foreign key in the database deviates from ON UPDATE NO ACTION');

  console.log(`QA fix acceptance: ${assertions} assertions passed (disposable database)`);
} finally {
  await db.end();
}
