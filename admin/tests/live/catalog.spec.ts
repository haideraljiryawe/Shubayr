import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { API, adminApiToken, bearer, requireLiveApi, uiLoginAsAdmin } from "./helpers";

/**
 * Catalog v2 in the Web Admin, in a real browser, through the BFF, against a
 * real API: the two-level category rules, the audited category → brand
 * conversion, brands, the SKU editor, and linked prices through an exchange
 * rate change. Fixtures are created through the API with names unique to the
 * run; everything the brief asks to prove is done through the UI.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function api(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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

async function category(
  request: APIRequestContext,
  name: string,
  parentId: string | null = null,
): Promise<{ id: string; slug: string }> {
  const slug = `${name}-${run}`.toLowerCase();
  const created = await api(request, "POST", "/admin/categories", {
    name_en: `${name} ${run}`,
    name_ar: `${name} ${run}`,
    slug,
    parent_id: parentId,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return { id: created.body.id, slug };
}

async function productIn(request: APIRequestContext, categoryId: string, sku: string) {
  const created = await api(request, "POST", "/admin/products", {
    category_id: categoryId,
    name_en: `Live product ${sku}`,
    name_ar: `منتج حي ${sku}`,
    price: 10000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: false,
    variants: [{ sku, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body as { id: string };
}

function toast(page: Page) {
  return page.getByTestId("toast").last();
}

/* ----------------------------------------------------------- categories */

test("categories stay two levels; re-parenting is blocked with the API's message", async ({ page, request }) => {
  // The API itself refuses a third level, whatever a client sends.
  const shelf = await category(request, "Shelf");
  const sub = await category(request, "Sub", shelf.id);
  const third = await api(request, "POST", "/admin/categories", {
    name_en: `Third ${run}`,
    name_ar: `Third ${run}`,
    parent_id: sub.id,
  });
  expect(third.status).toBe(422);
  expect(third.body.code).toBe("CATEGORY_MAX_DEPTH");

  await uiLoginAsAdmin(page);
  await page.goto("/catalog/categories");

  // A department through the UI, then a subcategory under it.
  const dept = `dept-${run}`;
  await page.getByTestId("category-new").click();
  const form = page.getByTestId("category-form");
  await form.getByTestId("category-name-ar").fill(`قسم ${run}`);
  await form.getByTestId("category-name-en").fill(`Dept ${run}`);
  await form.getByTestId("category-slug").fill(dept);
  await form.getByTestId("dialog-submit").click();
  await expect(page.getByTestId(`category-row-${dept}`)).toBeVisible();

  await page.getByTestId(`category-add-child-${dept}`).click();
  await expect(form.getByTestId("category-parent")).toHaveValue(/.+/);
  await form.getByTestId("category-name-ar").fill(`فرعي ${run}`);
  await form.getByTestId("category-name-en").fill(`Child ${run}`);
  await form.getByTestId("category-slug").fill(`child-${run}`);
  await form.getByTestId("dialog-submit").click();
  const child = page.getByTestId(`category-row-child-${run}`);
  await expect(child).toHaveAttribute("data-depth", "1");

  // A subcategory offers no "add subcategory": there is no third level.
  await expect(page.getByTestId(`category-add-child-child-${run}`)).toHaveCount(0);
  // Its parent can only be a department — never a subcategory.
  await page.getByTestId(`category-edit-child-${run}`).click();
  const options = await form.getByTestId("category-parent").locator("option").allTextContents();
  expect(options).not.toContain(`Sub ${run}`);
  expect(options).not.toContain(`فرعي ${run}`);
  expect(options).toContain(`Shelf ${run}`);
  await form.getByRole("button", { name: "إلغاء" }).click();

  // A department with subcategories cannot take a parent at all.
  await page.getByTestId(`category-edit-${dept}`).click();
  await expect(form.getByTestId("category-parent")).toBeDisabled();
  await form.getByRole("button", { name: "إلغاء" }).click();

  // A stale screen: a childless department is being moved under another one,
  // while someone else gives it a subcategory. The API refuses and its own
  // message is shown; the form keeps what was chosen.
  const loner = await category(request, "Loner");
  await page.reload();
  await page.getByTestId(`category-edit-${loner.slug}`).click();
  await form.getByTestId("category-parent").selectOption({ label: `Shelf ${run}` });
  await category(request, "Late", loner.id);
  await form.getByTestId("dialog-submit").click();
  const error = form.getByTestId("form-error");
  await expect(error).toHaveAttribute("data-kind", "validation");
  await expect(error).toContainText("A category with children cannot become a child");
  await expect(form.getByTestId("category-parent")).toHaveValue(shelf.id);
  const unchanged = await api(request, "GET", "/admin/categories");
  expect(
    (unchanged.body as Array<{ id: string }>).some((node) => node.id === loner.id),
    "the department stayed at the top level",
  ).toBe(true);
});

test("convert a category to a brand: preview, then an audited move", async ({ page, request }) => {
  const laptops = await category(request, "Laptops");
  const gaming = await category(request, "Gaming", laptops.id);
  const hp = await category(request, "Hp", laptops.id);
  const one = await productIn(request, hp.id, `LIVE-HP-1-${run}`);
  const two = await productIn(request, hp.id, `LIVE-HP-2-${run}`);

  await uiLoginAsAdmin(page);
  await page.goto("/catalog/categories");
  await page.getByTestId(`category-convert-${hp.slug}`).click();
  const dialog = page.getByTestId("convert-dialog");
  // Prefilled from the category; the slug becomes the brand's.
  await expect(dialog.getByTestId("convert-slug")).toHaveValue(hp.slug);
  await dialog.getByTestId("convert-name-en").fill(`HP ${run}`);
  await dialog.getByTestId("convert-name-ar").fill(`إتش بي ${run}`);
  // The source cannot be its own target, and departments are not offered.
  const targets = await dialog.getByTestId("convert-target").locator("option").allTextContents();
  expect(targets).not.toContain(`Hp ${run}`);
  expect(targets).not.toContain(`Laptops ${run}`);
  await dialog.getByTestId("convert-target").selectOption({ label: `Gaming ${run}` });

  // The preview names every effect, with the real product count, and changes nothing.
  await dialog.getByTestId("convert-preview").click();
  await expect(dialog.getByTestId("convert-effect-products")).toHaveAttribute("data-count", "2");
  await expect(dialog.getByTestId("convert-effect-products")).toContainText(`Gaming ${run}`);
  await expect(dialog.getByTestId("convert-effect-delete")).toContainText(`Hp ${run}`);
  const before = await api(request, "GET", `/admin/products/${one.id}`);
  expect(before.body.category_id).toBe(hp.id);

  await dialog.getByTestId("convert-confirm").click();
  // The Arabic screen names the brand by its Arabic name.
  await expect(toast(page)).toContainText(`إتش بي ${run}`);
  await expect(page.getByTestId(`category-row-${hp.slug}`)).toHaveCount(0);

  // The API state: brand created, both products moved and branded, source gone.
  const brands = await api(request, "GET", `/admin/brands?q=${encodeURIComponent(`HP ${run}`)}`);
  const brand = (brands.body.data as Array<{ id: string; slug: string }>).find((row) => row.slug === hp.slug);
  expect(brand).toBeTruthy();
  for (const product of [one, two]) {
    const moved = await api(request, "GET", `/admin/products/${product.id}`);
    expect(moved.body.category_id).toBe(gaming.id);
    expect(moved.body.brand_id).toBe(brand!.id);
  }
  const tree = await api(request, "GET", "/admin/categories");
  expect(JSON.stringify(tree.body)).not.toContain(hp.id);
  // Audited, with the moved count.
  const audit = await api(request, "GET", `/admin/audit-logs?entity_type=brand&entity_id=${brand!.id}`);
  const entry = (audit.body.data as Array<{ action: string; after: { moved_products: number } }>).find(
    (row) => row.action === "catalog.category.convert_to_brand",
  );
  expect(entry?.after.moved_products).toBe(2);
});

/* ----------------------------------------------------------- brands */

test("brands: create, edit, hide, and delete only when unused", async ({ page, request }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/catalog/brands");
  const slug = `acme-${run}`;
  await page.getByTestId("brand-new").click();
  const form = page.getByTestId("brand-form");
  await form.getByTestId("brand-name-ar").fill(`أكمي ${run}`);
  await form.getByTestId("brand-name-en").fill(`Acme ${run}`);
  await form.getByTestId("brand-slug").fill(slug);
  await form.getByTestId("dialog-submit").click();
  await expect(form).toBeHidden();
  await expect(toast(page)).toBeVisible();

  // The run id matches the brand before and after it is renamed.
  await page.getByTestId("table-search").fill(run);
  const row = page.getByTestId(`brand-row-${slug}`);
  await expect(row).toBeVisible();

  // Edit keeps the slug and renames.
  await page.getByTestId(`brand-edit-${slug}`).click();
  await form.getByTestId("brand-name-en").fill(`Acme Renamed ${run}`);
  await form.getByTestId("dialog-submit").click();
  // The dialog closes only once the API has saved it.
  await expect(form).toBeHidden();
  await expect(row).toContainText(`Acme Renamed ${run}`);
  const listed = await api(request, "GET", `/admin/brands?q=${encodeURIComponent(`Acme Renamed ${run}`)}`);
  const brand = listed.body.data[0] as { id: string; name_en: string; is_visible: boolean };
  expect(brand.name_en).toBe(`Acme Renamed ${run}`);

  // Hide: gone from the storefront's list, still in the admin.
  await page.getByTestId(`brand-toggle-${slug}`).click();
  await expect(page.getByTestId(`brand-visibility-${slug}`)).toHaveText("مخفية");
  const publicBrands = await request.get(`${API}/brands?q=${encodeURIComponent(`Acme Renamed ${run}`)}`);
  expect((await publicBrands.json()).total).toBe(0);

  // A brand in use cannot be deleted — the API's reason is shown.
  const shelf = await category(request, "Brandshelf");
  const sub = await category(request, "Brandsub", shelf.id);
  const product = await productIn(request, sub.id, `LIVE-ACME-${run}`);
  expect((await api(request, "PATCH", `/admin/products/${product.id}`, { brand_id: brand.id })).status).toBe(200);
  await page.getByTestId(`brand-delete-${slug}`).click();
  await page.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("confirm-dialog").getByTestId("form-error")).toHaveAttribute("data-kind", "conflict");
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "إلغاء" }).click();

  // Unused, it goes.
  expect((await api(request, "PATCH", `/admin/products/${product.id}`, { brand_id: null })).status).toBe(200);
  await page.getByTestId(`brand-delete-${slug}`).click();
  await page.getByTestId("confirm-submit").click();
  await expect(page.getByTestId(`brand-row-${slug}`)).toHaveCount(0);
  expect((await api(request, "GET", `/admin/brands?q=${encodeURIComponent(`Acme Renamed ${run}`)}`)).body.total).toBe(0);
});

/* ----------------------------------------------------------- SKU editor */

test("the SKU editor: base unit, whole units, price override, low-stock threshold", async ({ page, request }) => {
  const shelf = await category(request, "Pantry");
  const rice = await category(request, "Rice", shelf.id);
  await uiLoginAsAdmin(page);
  await page.goto("/catalog/products");
  await page.getByTestId("product-new").click();

  await page.getByTestId("product-name-ar").fill(`أرز ${run}`);
  await page.getByTestId("product-name-en").fill(`Rice ${run}`);
  // Only subcategories are offered; a department is not a valid home.
  await expect(page.getByTestId("product-category").locator(`option[value="${shelf.id}"]`)).toHaveCount(0);
  await page.getByTestId("product-category").selectOption(rice.id);
  await page.getByTestId("product-price").fill("4000");

  // SKU 1: by the piece — whole units forced — with its own price.
  await page.getByTestId("variant-sku-0").fill(`LIVE-BAG-${run}`);
  await expect(page.getByTestId("variant-whole-0")).toBeChecked();
  await expect(page.getByTestId("variant-whole-0")).toBeDisabled();
  await page.getByTestId("variant-price-0").fill("18000");
  await page.getByTestId("variant-threshold-0").fill("3");

  // SKU 2: by the kilogram, fractions allowed, threshold in kilograms.
  await page.getByTestId("variant-add").click();
  await page.getByTestId("variant-sku-1").fill(`LIVE-KG-${run}`);
  await page.getByTestId("variant-unit-1").selectOption("kg");
  await expect(page.getByTestId("variant-whole-1")).toBeEnabled();
  await expect(page.getByTestId("variant-whole-1")).not.toBeChecked();
  await page.getByTestId("variant-threshold-1").fill("2.5555");
  await page.getByTestId("product-save").click();
  // Refused next to the field: four decimals; nothing was sent.
  await expect(page.getByTestId("variant-1").getByTestId("error-low_stock_threshold")).toBeVisible();
  await page.getByTestId("variant-threshold-1").fill("2.5");
  await page.getByTestId("product-save").click();
  await page.waitForURL(/\/catalog\/products\/[0-9a-f-]{36}$/);
  await expect(toast(page)).toBeVisible();

  const id = page.url().split("/").pop()!;
  const saved = await api(request, "GET", `/admin/products/${id}`);
  const bySku = new Map(
    (saved.body.variants as Array<Record<string, unknown>>).map((variant) => [variant.sku, variant]),
  );
  expect(bySku.get(`LIVE-BAG-${run}`)).toMatchObject({
    base_unit: "piece",
    whole_units_only: true,
    selling_price: 18000,
    low_stock_threshold: 3,
    pricing_mode: "fixed",
    effective_price: 18000,
  });
  expect(bySku.get(`LIVE-KG-${run}`)).toMatchObject({
    base_unit: "kg",
    whole_units_only: false,
    selling_price: null,
    low_stock_threshold: 2.5,
    effective_price: 4000,
  });

  // The editor reloads what was stored, whatever order the SKUs come back in.
  const card = (sku: string) => page.locator("fieldset", { has: page.locator("legend code", { hasText: sku }) });
  await expect(card(`LIVE-KG-${run}`).locator('[data-testid^="variant-unit-"]')).toHaveValue("kg");
  await expect(card(`LIVE-KG-${run}`).locator('[data-testid^="variant-threshold-"]')).toHaveValue("2.5");
  await expect(card(`LIVE-KG-${run}`).locator('[data-testid^="variant-whole-"]').first()).not.toBeChecked();
  await expect(card(`LIVE-BAG-${run}`).locator('[data-testid^="variant-price-"]')).toHaveValue("18000");
});

/* ----------------------------------------------------------- linked prices */

test("linked price: 12 USD at 1,550 → 18,750 (round up to 250); rate only vs publish; a stale preview is refused", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const settings = await api(request, "GET", "/admin/settings");
  const originalRounding = (settings.body.settings.sale_rounding_multiple as string | null) ?? "0";
  expect((await api(request, "PUT", "/admin/settings", { settings: { sale_rounding_multiple: "250" } })).status).toBe(200);
  // Rates are dated in the past on purpose: the rate list orders by effective
  // time, and a later spec (finance) records "the latest" rate at the current
  // minute. This one's rates stay strictly before that.
  const setup = await api(request, "POST", "/admin/exchange-rates", {
    currency_code: "USD",
    rate: "1500",
    basis: 1,
    effective_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    reason: `Live linked-price test ${run}`,
  });
  expect(setup.status).toBe(201);
  /** The rate form's effective time, one minute back, in store time. */
  const oneMinuteAgo = () =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(Date.now() - 60_000))
      .replace(" ", "T");

  try {
    const shelf = await category(request, "Phones");
    const sub = await category(request, "Smart", shelf.id);
    const sku = `LIVE-USD-${run}`;
    await uiLoginAsAdmin(page);

    // The editor: linked to 12 USD, the local price is shown before saving.
    await page.goto("/catalog/products/new");
    await page.getByTestId("product-name-ar").fill(`هاتف ${run}`);
    await page.getByTestId("product-name-en").fill(`Phone ${run}`);
    await page.getByTestId("product-category").selectOption(sub.id);
    await page.getByTestId("product-price").fill("1");
    await page.getByTestId("variant-sku-0").fill(sku);
    await page.getByTestId("variant-mode-linked-0").check();
    await page.getByTestId("variant-currency-0").selectOption("USD");
    await page.getByTestId("variant-reference-0").fill("12");
    await expect(page.getByTestId("variant-rounding-0")).toContainText("250");
    await expect(page.getByTestId("variant-local-price-0")).toHaveAttribute("data-value", "18000");
    await page.getByTestId("product-save").click();
    await page.waitForURL(/\/catalog\/products\/[0-9a-f-]{36}$/);
    const productId = page.url().split("/").pop()!;
    const variantOf = async () => {
      const product = await api(request, "GET", `/admin/products/${productId}`);
      return product.body.variants[0] as { id: string; published_price: number; awaiting_rate_id: string | null };
    };
    expect((await variantOf()).published_price).toBe(18000);

    const previewAt = async (value: string) => {
      await page.goto("/finance/currencies");
      await page.getByTestId("rate-currency").selectOption("USD");
      await page.getByTestId("rate-value").fill(value);
      await page.getByTestId("rate-effective").fill(oneMinuteAgo());
      await page.getByTestId("rate-reason").fill(`Linked price check ${run}`);
      await page.getByTestId("rate-submit").click();
      await expect(page.getByTestId("linked-preview")).toBeVisible();
      return page.locator(`[data-testid="preview-row"][data-sku="${sku}"]`);
    };

    // 1,550 with "save rate only": the preview shows 18,000 → 18,750; the
    // published price stays and is marked as awaiting the new rate.
    let row = await previewAt("1550");
    await expect(row.getByTestId("preview-old")).toHaveText("18,000 IQD");
    await expect(row.getByTestId("preview-new")).toHaveText("18,750 IQD");
    await expect(row.getByTestId("preview-change")).toHaveText("+4.17%");
    await expect(page.getByTestId("preview-rounding")).toContainText("250");
    expect(Number(await page.getByTestId("preview-count").innerText())).toBeGreaterThanOrEqual(1);
    await page.getByTestId("rate-save-only").click();
    await expect(page.getByTestId("linked-preview")).toHaveCount(0);
    await expect(toast(page)).toBeVisible();
    let variant = await variantOf();
    expect(variant.published_price).toBe(18000);
    expect(variant.awaiting_rate_id).toBeTruthy();

    await page.goto(`/catalog/products/${productId}`);
    await expect(page.getByTestId("variant-awaiting-0")).toBeVisible();
    await expect(page.getByTestId("variant-published-price-0")).toHaveText("18,000 IQD");
    await expect(page.getByTestId("variant-local-price-0")).toHaveAttribute("data-value", "18750");

    // 1,550 again, published this time: 18,750, no longer awaiting.
    row = await previewAt("1550");
    await expect(row.getByTestId("preview-new")).toHaveText("18,750 IQD");
    await page.getByTestId("rate-publish").click();
    await expect(page.getByTestId("linked-preview")).toHaveCount(0);
    await expect(toast(page)).toBeVisible();
    variant = await variantOf();
    expect(variant.published_price).toBe(18750);
    expect(variant.awaiting_rate_id).toBeNull();
    const storefront = await request.get(`${API}/admin/products/${productId}`, {
      headers: bearer(await adminApiToken(request)),
    });
    expect((await storefront.json()).variants[0].effective_price).toBe(18750);

    // A decrease is shown as one; then the preview goes stale — someone saves
    // the linked product meanwhile — and publishing it is refused until the
    // preview is refreshed.
    row = await previewAt("1500");
    await expect(row).toHaveAttribute("data-direction", "down");
    await expect(row.getByTestId("preview-change")).toHaveText("−4%");
    const current = await variantOf();
    const resaved = await api(request, "PATCH", `/admin/products/${productId}`, {
      variants: [
        { id: current.id, sku, pricing_mode: "linked", reference_currency_code: "USD", reference_price: 12 },
      ],
    });
    expect(resaved.status, JSON.stringify(resaved.body)).toBe(200);
    await page.getByTestId("rate-publish").click();
    await expect(page.getByTestId("preview-stale")).toBeVisible();
    await expect(page.getByTestId("rate-publish")).toBeDisabled();
    await expect(page.getByTestId("rate-save-only")).toBeDisabled();
    expect((await variantOf()).published_price).toBe(18750);

    await page.getByTestId("preview-refresh").click();
    await expect(page.getByTestId("preview-stale")).toHaveCount(0);
    await expect(page.getByTestId("preview-rates")).toContainText("1,500");
    await expect(row.getByTestId("preview-old")).toHaveText("18,750 IQD");
    await expect(row.getByTestId("preview-new")).toHaveText("18,000 IQD");
    await page.getByTestId("rate-publish").click();
    await expect(page.getByTestId("linked-preview")).toHaveCount(0);
    await expect(toast(page)).toBeVisible();
    expect((await variantOf()).published_price).toBe(18000);
  } finally {
    await api(request, "PUT", "/admin/settings", { settings: { sale_rounding_multiple: originalRounding } });
  }
});
