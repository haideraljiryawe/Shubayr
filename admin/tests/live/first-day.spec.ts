import { deflateSync } from "node:zlib";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { API, adminApiToken, bearer, createStaff, requireLiveApi, uiLogin } from "./helpers";
import { choose, selectedValue } from "./controls";

/**
 * The shop owner's first day, end to end, in Arabic, at tablet width, through
 * the BFF against a real API — the launch acceptance for the catalog upload:
 *
 *   first sign-in → forced password change → a department and subcategory →
 *   a brand → a product with three variants and four pictures (uploaded,
 *   shrunk in the browser, reordered, main chosen) → published → opening
 *   stock prefilled from the product → visible and in stock in the store.
 *
 * Then the big-catalog tools: status and stock filters, bulk publish / hide /
 * move / brand, and duplicating a product.
 *
 * Every name is unique to the run, so the suite can repeat on one database.
 */

test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const TABLET = { width: 820, height: 1180 };

test.beforeEach(async ({ request, page }) => {
  await requireLiveApi(request);
  await page.setViewportSize(TABLET);
  // A local run uses the dev server, whose tools badge sits in a bottom
  // corner — over the form's end-aligned buttons at tablet width. (CI serves
  // the production build, which has no badge.)
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.documentElement.appendChild(style);
  });
});

async function api(
  request: APIRequestContext,
  method: "GET" | "POST" | "PATCH",
  path: string,
  data?: unknown,
) {
  const response = await request.fetch(`${API}${path}`, {
    method,
    headers: bearer(await adminApiToken(request)),
    data,
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

/* ------------------------------------------------------------ test pictures */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A solid-colour PNG of the given size — a "photo" the browser can decode and shrink. */
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------ helpers */

/** No sideways scrolling at tablet width, and the page is right-to-left. */
async function expectTabletRtl(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    `${page.url()} scrolls sideways at ${TABLET.width}px`,
  ).toBe(true);
}

/**
 * Wait until React owns a form: text typed into a server-rendered input
 * before hydration is reset by the hydration itself.
 */
async function hydrated(page: Page, testId: string) {
  await page.waitForFunction((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    return !!element && Object.keys(element).some((key) => key.startsWith("__reactProps"));
  }, testId);
}

function toast(page: Page) {
  return page.getByTestId("toast").last();
}

async function tileUrls(images: Locator): Promise<string[]> {
  const tiles = images.locator('[data-testid^="product-images-tile-"]');
  const count = await tiles.count();
  const urls: string[] = [];
  for (let index = 0; index < count; index += 1) {
    urls.push((await images.getByTestId(`product-images-tile-${index}`).getAttribute("data-url")) ?? "");
  }
  return urls;
}

/** Drag a picture by its handle onto another tile, as a finger or mouse would. */
async function dragTile(page: Page, images: Locator, from: number, to: number) {
  const handle = images.getByTestId(`product-images-drag-${from}`);
  const target = images.getByTestId(`product-images-tile-${to}`);
  const start = (await handle.boundingBox())!;
  const end = (await target.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 3, { steps: 12 });
  await page.mouse.up();
}

const state: { productId?: string; subId?: string; brandId?: string; mainUrl?: string; order?: string[] } = {};

/* ------------------------------------------------------------ the first day */

test("the owner's first day: password → categories → brand → product with 3 variants and 4 pictures → publish → opening stock → in the store", async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);
  const owner = await createStaff(request, { presets: ["super_admin"], prefix: "owner" });

  // 1. First sign-in with the temporary password: the change is forced.
  await uiLogin(page, owner.username, owner.password);
  await expect(page).toHaveURL(/\/change-password/);
  await expect(page.getByTestId("forced-password-change")).toBeVisible();
  await expectTabletRtl(page);
  const password = "Owner-First-Day!2026";
  await page.getByTestId("current-password").fill(owner.password);
  await page.getByTestId("new-password").fill(password);
  await page.getByTestId("confirm-password").fill(password);
  await page.getByTestId("change-password-submit").click();
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expectTabletRtl(page);
  // The launch core leads the menu (opened from the tablet's menu button).
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  const nav = page.getByTestId("sidebar-nav").first();
  const keys = await nav.locator('[data-testid^="nav-"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("data-testid")),
  );
  expect(keys.slice(0, 4)).toEqual(["nav-dashboard", "nav-products", "nav-categories", "nav-brands"]);
  await page.getByRole("button", { name: "إغلاق القائمة" }).click();

  // 2. A department and a subcategory, Arabic names only: the English name and
  //    the slug fill themselves in.
  await page.goto("/catalog/categories");
  await expectTabletRtl(page);
  await page.getByTestId("category-new").click();
  const form = page.getByTestId("category-form");
  await form.getByTestId("category-name-ar").fill(`أجهزة ${run}`);
  await form.getByTestId("dialog-submit").click();
  await expect(form).toBeHidden();
  const department = page.locator('[data-testid^="department-"]', { hasText: `أجهزة ${run}` });
  await expect(department).toBeVisible();
  await department.locator('[data-testid^="category-add-child-"]').first().click();
  await form.getByTestId("category-name-ar").fill(`هواتف ${run}`);
  await form.getByTestId("dialog-submit").click();
  await expect(form).toBeHidden();
  await expect(department.locator('[data-depth="1"]', { hasText: `هواتف ${run}` })).toBeVisible();
  const tree = (await api(request, "GET", "/admin/categories")).body as Array<{
    id: string;
    name_ar: string;
    name_en: string;
    slug: string;
    children?: Array<{ id: string; name_ar: string; name_en: string; slug: string }>;
  }>;
  const dept = tree.find((node) => node.name_ar === `أجهزة ${run}`)!;
  const sub = dept.children?.find((node) => node.name_ar === `هواتف ${run}`);
  expect(sub, "subcategory created under the department").toBeTruthy();
  expect(sub!.name_en).toBe(`هواتف ${run}`);
  expect(sub!.slug).toMatch(/^hwatf-[a-z0-9-]+$/);
  state.subId = sub!.id;

  // 3. A brand from the brand screen, Arabic name only.
  await page.goto("/catalog/brands");
  await expectTabletRtl(page);
  await page.getByTestId("brand-new").click();
  const brandForm = page.getByTestId("brand-form");
  await brandForm.getByTestId("brand-name-ar").fill(`شبير ${run}`);
  await brandForm.getByTestId("dialog-submit").click();
  await expect(brandForm).toBeHidden();
  await expect(toast(page)).toBeVisible();
  const brand = (await api(request, "GET", `/admin/brands?q=${encodeURIComponent(run)}`)).body.data.find(
    (row: { name_ar: string }) => row.name_ar === `شبير ${run}`,
  ) as { id: string; slug: string; name_en: string };
  expect(brand.name_en).toBe(`شبير ${run}`);
  expect(brand.slug).toMatch(/^shbyr-[a-z0-9-]+$/);
  state.brandId = brand.id;

  // 4. The product.
  await page.goto("/catalog/products/new");
  await hydrated(page, "product-editor");
  await expectTabletRtl(page);
  await page.getByTestId("product-name-ar").fill(`هاتف تجريبي ${run}`);
  await choose(page.getByTestId("product-category"), state.subId);
  await choose(page.getByTestId("product-brand"), state.brandId);
  await page.getByTestId("product-price").fill("250000");
  await page.getByTestId("product-description").fill("هاتف للتجربة: شاشة ٦٫٥ بوصة.");

  // Three variants by colour: a new row brings the attribute name and threshold along.
  await page.getByTestId("variant-attr-name-0-0").fill("اللون");
  await page.getByTestId("variant-attr-value-0-0").fill("أسود");
  await page.getByTestId("variant-threshold-0").fill("2");
  await page.getByTestId("variant-add").click();
  await expect(page.getByTestId("variant-attr-name-1-0")).toHaveValue("اللون");
  await expect(page.getByTestId("variant-threshold-1")).toHaveValue("2");
  await page.getByTestId("variant-attr-value-1-0").fill("أبيض");
  await page.getByTestId("variant-add").click();
  await page.getByTestId("variant-attr-value-2-0").fill("أزرق");
  await page.getByTestId("variant-price-2").fill("260000");
  // Codes for all three from the name and colour, in Latin letters.
  await page.getByTestId("variant-fill-skus").click();
  const skus = await Promise.all([0, 1, 2].map((index) => page.getByTestId(`variant-sku-${index}`).inputValue()));
  expect(skus[0]).toMatch(/^HATF-TJRYBY-[A-Z0-9]+-ASWD$/);
  expect(new Set(skus).size).toBe(3);

  // Four pictures at once: one is a 2400×1800 "photo" that must be shrunk.
  const images = page.getByTestId("product-images");
  await images.getByTestId("product-images-input").setInputFiles([
    { name: "big-red.png", mimeType: "image/png", buffer: png(2400, 1800, [200, 40, 40]) },
    { name: "green.png", mimeType: "image/png", buffer: png(800, 800, [40, 160, 60]) },
    { name: "blue.png", mimeType: "image/png", buffer: png(1200, 900, [40, 60, 200]) },
    { name: "yellow.png", mimeType: "image/png", buffer: png(640, 480, [230, 200, 40]) },
  ]);
  const tiles = images.locator('[data-testid^="product-images-tile-"]');
  await expect(tiles).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect(images.getByTestId(`product-images-tile-${index}`)).toHaveAttribute("data-phase", "ready", { timeout: 60_000 });
  }
  const uploaded = await tileUrls(images);
  expect(uploaded.every((url) => /\/media\/[0-9a-f-]{36}$/.test(url))).toBe(true);

  // The big picture was shrunk to 1600 px before it was sent.
  const bigSize = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, uploaded[0]);
  expect(bigSize).toEqual([1600, 1200]);

  // Reorder: drag the yellow (last) picture to the front, then make the blue one main.
  await dragTile(page, images, 3, 0);
  await expect.poll(() => tileUrls(images)).toEqual([uploaded[3], uploaded[0], uploaded[1], uploaded[2]]);
  await images.getByTestId("product-images-make-main-3").click();
  const order = [uploaded[2], uploaded[3], uploaded[0], uploaded[1]];
  await expect.poll(() => tileUrls(images)).toEqual(order);
  await expect(images.getByTestId("product-images-tile-0").getByTestId("product-images-main-badge")).toBeVisible();

  // Published straight away.
  await page.getByTestId("product-status-active").check();
  await page.getByTestId("product-save").click();
  await page.waitForURL(/\/catalog\/products\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByTestId("product-next-steps")).toBeVisible();
  await expectTabletRtl(page);
  state.productId = new URL(page.url()).pathname.split("/").pop();
  state.order = order;
  state.mainUrl = order[0];

  const saved = (await api(request, "GET", `/admin/products/${state.productId}`)).body;
  expect(saved).toMatchObject({
    name_ar: `هاتف تجريبي ${run}`,
    name_en: `هاتف تجريبي ${run}`,
    category_id: state.subId,
    brand_id: state.brandId,
    price: 250000,
    status: "active",
  });
  expect(saved.published_at).not.toBeNull();
  expect(
    [...saved.images].sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order).map((image: { url: string }) => image.url),
  ).toEqual(order);
  const variants = new Map((saved.variants as Array<{ sku: string; attributes: unknown; effective_price: number; low_stock_threshold: number }>).map((v) => [v.sku, v]));
  expect(variants.get(skus[0])).toMatchObject({ attributes: { اللون: "أسود" }, effective_price: 250000, low_stock_threshold: 2 });
  expect(variants.get(skus[2])).toMatchObject({ attributes: { اللون: "أزرق" }, effective_price: 260000 });

  // Reopened, the editor shows the same pictures in the same order.
  await page.reload();
  await expect.poll(() => tileUrls(page.getByTestId("product-images"))).toEqual(order);

  // 5. Opening stock, straight from the product: one line per variant.
  await page.getByTestId("next-opening-stock").click();
  await page.waitForURL(/\/inventory\/openings\/new\?product=/);
  await hydrated(page, "opening-form");
  await expectTabletRtl(page);
  const lines = page.getByTestId("opening-line");
  await expect(lines).toHaveCount(3);
  // Every variant has its line (in the API's order), each with a location
  // already chosen when the store has one sellable location.
  const quantities = new Map(skus.map((sku, index) => [sku, 5 + index]));
  const seen: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const line = lines.nth(index);
    const picked = (await line.getByTestId("opening-sku-picked").textContent()) ?? "";
    const sku = skus.find((code) => picked.includes(code));
    expect(sku, `line ${index} names one of the product's codes: ${picked}`).toBeTruthy();
    seen.push(sku!);
    const location = line.getByTestId("opening-location");
    if (!(await selectedValue(location))) {
      await choose(location, { index: 1 });
    }
    await line.getByTestId("opening-quantity").fill(String(quantities.get(sku!)));
    await line.getByTestId("opening-cost").fill("200000");
  }
  expect(seen.sort()).toEqual([...skus].sort());
  await page.getByTestId("opening-review").click();
  await expect(page.getByTestId("opening-preview-line")).toHaveCount(3);
  await page.getByTestId("opening-confirm").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  await page.getByTestId("opening-back-to-product").click();
  await page.waitForURL(new RegExp(`/catalog/products/${state.productId}$`));
  await expect(page.getByTestId("variant-stock-row")).toHaveCount(3);

  // 6. In the store: the public product is visible, in stock, main picture first.
  const store = await request.get(`${API}/products/${state.productId}`);
  expect(store.status()).toBe(200);
  const listed = (await store.json()) as {
    in_stock: boolean;
    images: Array<{ url: string; sort_order: number; is_primary: boolean }>;
    variants: Array<{ sku: string; available_qty: number }>;
  };
  expect(listed.in_stock).toBe(true);
  expect(listed.images.find((image) => image.is_primary)?.url).toBe(state.mainUrl);
  for (const variant of listed.variants) expect(variant.available_qty).toBe(quantities.get(variant.sku));
  const search = await request.get(`${API}/products?q=${encodeURIComponent(`هاتف تجريبي ${run}`)}`);
  expect(((await search.json()) as { total: number }).total).toBe(1);
});

/* ------------------------------------------------------------ big catalog */

test("a big catalog: status and stock filters, bulk publish / hide / move / brand, and duplicate", async ({ page, request }) => {
  test.setTimeout(240_000);
  // Three hidden products in a fresh subcategory, through the API.
  const department = await api(request, "POST", "/admin/categories", { name_ar: `رفوف ${run}`, name_en: `Shelves ${run}`, slug: `shelves-${run}` });
  expect(department.status).toBe(201);
  const from = await api(request, "POST", "/admin/categories", { name_ar: `أ ${run}`, name_en: `From ${run}`, slug: `from-${run}`, parent_id: department.body.id });
  const to = await api(request, "POST", "/admin/categories", { name_ar: `ب ${run}`, name_en: `To ${run}`, slug: `to-${run}`, parent_id: department.body.id });
  const brand = await api(request, "POST", "/admin/brands", { name_ar: `علامة ${run}`, name_en: `Mark ${run}`, slug: `mark-${run}` });
  expect([from.status, to.status, brand.status]).toEqual([201, 201, 201]);
  const ids: string[] = [];
  for (const n of [1, 2, 3]) {
    const created = await api(request, "POST", "/admin/products", {
      category_id: from.body.id,
      name_ar: `صنف ${n} ${run}`,
      name_en: `Item ${n} ${run}`,
      price: 1000 * n,
      discount_type: null,
      tracks_expiry: false,
      status: "hidden",
      published: false,
      variants: [{ sku: `BULK-${n}-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    ids.push(created.body.id);
  }

  await uiLogin(page, process.env.LIVE_ADMIN_USERNAME ?? "admin", process.env.LIVE_ADMIN_PASSWORD ?? "Shubayr-Dev-Admin!2026");
  await expect(page.getByTestId("dashboard")).toBeVisible();

  // Filter: this run's hidden products.
  await page.goto(`/catalog/products?q=${encodeURIComponent(run)}&status=hidden`);
  await hydrated(page, "products-table");
  await expectTabletRtl(page);
  const rows = page.getByTestId("products-table").getByTestId("table-row");
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId("filter-status")).toHaveAttribute("data-value", "hidden");

  // Bulk publish all three.
  await page.getByTestId("products-select-all").check();
  await expect(page.getByTestId("bulk-count")).toContainText("3");
  await page.getByTestId("bulk-publish").click();
  await expect(page.getByTestId("bulk-outcome")).toBeVisible();
  await expect(page.getByTestId("bulk-outcome")).not.toContainText("تعذّر");
  for (const id of ids) expect((await api(request, "GET", `/admin/products/${id}`)).body.status).toBe("active");
  await expect(rows).toHaveCount(0); // none hidden any more

  // Active and out of stock: the same three.
  await page.goto(`/catalog/products?q=${encodeURIComponent(run)}&status=active&stock=out_of_stock`);
  await hydrated(page, "products-table");
  await expect(rows).toHaveCount(3);

  // Move two of them, and give all three the brand.
  await rows.nth(0).getByTestId("product-select").check();
  await rows.nth(1).getByTestId("product-select").check();
  await choose(page.getByTestId("bulk-category"), to.body.id);
  await page.getByTestId("bulk-category-apply").click();
  // Arabic counts two in the dual: «تم تعديل منتجين.»
  await expect(page.getByTestId("bulk-outcome").locator("p").first()).toHaveText("تم تعديل منتجين.");
  await page.goto(`/catalog/products?q=${encodeURIComponent(run)}&category_id=${to.body.id}`);
  await hydrated(page, "products-table");
  await expect(rows).toHaveCount(2);
  await page.goto(`/catalog/products?q=${encodeURIComponent(run)}`);
  await hydrated(page, "products-table");
  await page.getByTestId("products-select-all").check();
  await choose(page.getByTestId("bulk-brand"), brand.body.id);
  await page.getByTestId("bulk-brand-apply").click();
  await expect(page.getByTestId("bulk-outcome")).toBeVisible();
  for (const id of ids) expect((await api(request, "GET", `/admin/products/${id}`)).body.brand_id).toBe(brand.body.id);

  // Hide one again.
  await page.goto(`/catalog/products?q=${encodeURIComponent(`صنف 3 ${run}`)}`);
  await hydrated(page, "products-table");
  await expect(rows).toHaveCount(1);
  await rows.first().getByTestId("product-select").check();
  await page.getByTestId("bulk-hide").click();
  await expect(page.getByTestId("bulk-outcome")).toBeVisible();
  expect((await api(request, "GET", `/admin/products/${ids[2]}`)).body.status).toBe("hidden");

  // Duplicate: the copy keeps the details, moves the code on, starts hidden.
  await rows.first().getByTestId("product-row-duplicate").click();
  await page.waitForURL(/\/catalog\/products\/new\?from=/);
  await hydrated(page, "product-editor");
  await expect(page.getByTestId("product-copy-notice")).toBeVisible();
  await expect(page.getByTestId("product-name-ar")).toHaveValue(`صنف 3 ${run} (نسخة)`);
  await expect(page.getByTestId("variant-sku-0")).toHaveValue(`BULK-3-${run}-2`);
  await expect(page.getByTestId("product-status-hidden")).toBeChecked();
  await page.getByTestId("product-save").click();
  await page.waitForURL(/\/catalog\/products\/[0-9a-f-]{36}\?created=1$/);
  const copyId = new URL(page.url()).pathname.split("/").pop();
  const copy = (await api(request, "GET", `/admin/products/${copyId}`)).body;
  const original = (await api(request, "GET", `/admin/products/${ids[2]}`)).body;
  expect(copy).toMatchObject({ status: "hidden", price: 3000, brand_id: brand.body.id, category_id: original.category_id });
  expect(copy.name_en).toBe(`Item 3 ${run} (copy)`);
  expect(copy.variants.map((variant: { sku: string }) => variant.sku)).toEqual([`BULK-3-${run}-2`]);
});
