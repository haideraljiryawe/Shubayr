import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  API,
  awaitQuota,
  bearer,
  customerToken,
  requireLiveApi,
  signIn,
  staffToken,
} from "./live-api";

/**
 * Catalog v2 on the storefront, in a browser, against the real API (8.x).
 *
 * The seed carries brands and two-SKU products (a "standard" and a dearer
 * "plus"), all sold by the piece. A product sold by the kilogram does not
 * exist in the seed, so one is created through the admin API with stock
 * posted as an opening document — exactly how the Web Admin would do it —
 * and then everything is checked through the storefront's own pages.
 *
 * Expected figures are read from the API rather than hard-coded, so the suite
 * holds however many runs have added data before it.
 */

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1000 } });

/** Seeded two-SKU product: standard + plus (plus has a higher fixed price). */
const EARBUDS = "40000000-0000-4000-8000-000000000001";
const EARBUDS_STD = "50000000-0000-4000-8000-000000000001";
/** The seeded sellable location (backend/prisma/seed.ts, seedId(9, 2)). */
const SELLABLE_LOCATION = "90000000-0000-4000-8000-000000000002";

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

interface WeightProduct {
  id: string;
  loose: string;
  bulk: string;
}
let rice: WeightProduct | null = null;

function storeDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

async function staffApi(
  request: APIRequestContext,
  method: "GET" | "POST" | "PATCH",
  path: string,
  data?: unknown,
) {
  const response = await request.fetch(`${API}${path}`, {
    method,
    headers: bearer(await staffToken(request)),
    data,
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

/**
 * Basmati rice by the kilogram: a "loose" SKU with 12.5 kg in stock against
 * a 20 kg low-stock threshold (so it reads low stock), and a "bulk" SKU with
 * no stock at all (out of stock).
 */
async function weightProduct(request: APIRequestContext): Promise<WeightProduct> {
  if (rice) return rice;
  const seeded = await (await request.get(`${API}/products/${EARBUDS}`)).json();
  const created = await staffApi(request, "POST", "/admin/products", {
    category_id: seeded.category_id,
    brand_id: seeded.brand_id,
    name_en: `Live basmati rice ${stamp}`,
    name_ar: `أرز بسمتي حي ${stamp}`,
    description: "Sold by the kilogram.",
    price: 3500,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [
      {
        sku: `LIVE-RICE-${stamp}`,
        attributes: { pack: "loose" },
        base_unit: "kg",
        whole_units_only: false,
        low_stock_threshold: 20,
        pricing_mode: "fixed",
      },
      {
        sku: `LIVE-RICE-BULK-${stamp}`,
        attributes: { pack: "bulk" },
        base_unit: "kg",
        whole_units_only: false,
        selling_price: 3200,
        pricing_mode: "fixed",
      },
    ],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const loose = created.body.variants.find((v: { sku: string }) => v.sku === `LIVE-RICE-${stamp}`).id as string;
  const bulk = created.body.variants.find((v: { sku: string }) => v.sku === `LIVE-RICE-BULK-${stamp}`).id as string;

  const opening = await staffApi(request, "POST", "/admin/inventory/openings", {
    operation_id: `live-rice-${stamp}`,
    document_date: storeDay(),
    lines: [{ variant_id: loose, location_id: SELLABLE_LOCATION, quantity: "12.5", unit_cost_iqd: "2000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  rice = { id: created.body.id as string, loose, bulk };
  return rice;
}

function numberIn(text: string): number {
  const latin = text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[,٬]/g, "");
  return Number(latin.match(/\d+(\.\d+)?/)?.[0] ?? NaN);
}

async function shownPrice(page: Page): Promise<number> {
  return numberIn(await page.getByTestId("pdp-price").first().locator("span").first().innerText());
}

/** The product count the listing shows (streaming can briefly hold two). */
async function resultCount(page: Page): Promise<number> {
  return numberIn(await page.locator('[data-testid="result-count"]:visible').first().innerText());
}

function panel(page: Page) {
  return page.locator('[data-testid="brand-filter"]:visible');
}

async function applyFilters(page: Page) {
  const before = page.url();
  await page.locator("form:visible").getByRole("button", { name: "عرض النتائج" }).click();
  await page.waitForURL((url) => url.toString() !== before);
  await page.waitForLoadState();
}

function cta(page: Page) {
  return page.locator('[data-testid="pdp-add-to-cart"]:visible');
}

async function emptyCart(request: APIRequestContext): Promise<void> {
  const headers = bearer(await customerToken(request));
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const item of cart.items ?? []) await request.delete(`${API}/cart/items/${item.id}`, { headers });
}

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "the catalog v2 storefront specs");
  await awaitQuota(request);
});

test("brand filter: facet counts from the API, multi-select, combined with on-sale", async ({ page, request }) => {
  const brands = (await (await request.get(`${API}/brands?per_page=100`)).json()).data as Array<{
    id: string;
    slug: string;
  }>;
  expect(brands.length).toBeGreaterThanOrEqual(2);
  const all = await (await request.get(`${API}/products?per_page=1`)).json();
  const counts = new Map<string, number>(
    all.facets.brands.map((facet: { brand_id: string; count: number }) => [facet.brand_id, facet.count]),
  );
  const [first, second] = brands.filter((brand) => (counts.get(brand.id) ?? 0) > 0);

  await page.goto("/search");
  await expect(panel(page)).toBeVisible();
  for (const brand of [first, second]) {
    expect(numberIn(await panel(page).getByTestId(`brand-count-${brand.slug}`).innerText())).toBe(
      counts.get(brand.id),
    );
  }

  await panel(page).getByTestId(`brand-option-${first.slug}`).check();
  await panel(page).getByTestId(`brand-option-${second.slug}`).check();
  await applyFilters(page);
  await expect(page).toHaveURL(new RegExp(`brand_id=${first.id}`));
  await expect(page).toHaveURL(new RegExp(`brand_id=${second.id}`));
  const both = await (
    await request.get(`${API}/products?per_page=1&brand_id=${first.id}&brand_id=${second.id}`)
  ).json();
  await expect.poll(() => resultCount(page)).toBe(both.total);
  expect(both.total).toBe((counts.get(first.id) ?? 0) + (counts.get(second.id) ?? 0));

  await page.locator("form:visible").locator('input[name="on_sale"]').check();
  await applyFilters(page);
  const onSale = await (
    await request.get(`${API}/products?per_page=1&on_sale=true&brand_id=${first.id}&brand_id=${second.id}`)
  ).json();
  await expect.poll(() => resultCount(page)).toBe(onSale.total);
  // Facets follow the other filters (on-sale) but not the brand filter.
  const saleCount = onSale.facets.brands.find((facet: { brand_id: string }) => facet.brand_id === first.id)?.count ?? 0;
  if (saleCount > 0) {
    expect(numberIn(await panel(page).getByTestId(`brand-count-${first.slug}`).innerText())).toBe(saleCount);
  }
});

test("brands page opens the catalog filtered to one brand", async ({ page, request }) => {
  const brands = (await (await request.get(`${API}/brands?per_page=100`)).json()).data as Array<{
    id: string;
    slug: string;
  }>;
  await page.goto("/brands");
  await expect(page.getByTestId("brand-grid").locator("> li")).toHaveCount(brands.length);
  const brand = brands[0];
  await page.getByTestId(`brand-tile-${brand.slug}`).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?brand_id=${brand.id}`));
  const expected = await (await request.get(`${API}/products?per_page=1&brand_id=${brand.id}`)).json();
  await expect.poll(() => resultCount(page)).toBe(expected.total);
});

test("the price follows the selected SKU", async ({ page, request }) => {
  const product = await (await request.get(`${API}/products/${EARBUDS}`)).json();
  const byOption = new Map<string, number>(
    product.variants.map((variant: { attributes: { option: string }; effective_price: number }) => [
      variant.attributes.option,
      variant.effective_price,
    ]),
  );
  expect(byOption.get("plus")).not.toBe(byOption.get("standard"));

  await page.goto(`/product/${EARBUDS}`);
  await page.getByRole("button", { name: "standard", exact: true }).click();
  await expect.poll(() => shownPrice(page)).toBe(byOption.get("standard"));
  await page.getByRole("button", { name: "plus", exact: true }).click();
  await expect.poll(() => shownPrice(page)).toBe(byOption.get("plus"));
  await expect(page).toHaveURL(/variant=/);
});

test("availability is the API's label per SKU, never a quantity", async ({ page, request }) => {
  const product = await weightProduct(request);
  const availability = await (await request.get(`${API}/products/${product.id}/availability`)).json();
  const levels = new Map(
    availability.variants.map((v: { variant_id: string; availability: string }) => [v.variant_id, v.availability]),
  );
  expect(levels.get(product.loose)).toBe("low_stock");
  expect(levels.get(product.bulk)).toBe("out_of_stock");

  const label = page.getByTestId("availability");
  await page.goto(`/product/${product.id}?variant=${product.loose}`);
  await expect(label).toHaveText("مخزون منخفض");
  await expect(label).not.toHaveText(/\d|[٠-٩]/);
  await expect(page.getByText(/12[.٫]5|١٢٫٥/)).toHaveCount(0);
  await expect(cta(page)).toBeEnabled();

  await page.goto(`/product/${product.id}?variant=${product.bulk}`);
  await expect(label).toHaveText("غير متوفر في المخزون");
  await expect(cta(page)).toBeDisabled();

  // The seeded earbuds, which other workers order meanwhile: the page and the
  // API are read together until they agree, so an order landing between the
  // two reads can't fail the comparison.
  const labels = { in_stock: "متوفر في المخزون", low_stock: "مخزون منخفض", out_of_stock: "غير متوفر في المخزون" };
  await expect
    .poll(async () => {
      const seeded = await (await request.get(`${API}/products/${EARBUDS}/availability`)).json();
      const std = seeded.variants.find((v: { variant_id: string }) => v.variant_id === EARBUDS_STD);
      await page.goto(`/product/${EARBUDS}?variant=${EARBUDS_STD}`);
      return (await label.innerText()) === labels[std.availability as keyof typeof labels];
    })
    .toBe(true);
});

test("a weight SKU takes 1.5 kg into the server cart; a piece SKU refuses a fraction", async ({ page, request }) => {
  const product = await weightProduct(request);
  await emptyCart(request);
  await signIn(page, `/product/${product.id}?variant=${product.loose}`);

  const quantity = page.getByTestId("quantity-input");
  await expect(page.getByTestId("quantity-unit")).toHaveText("كغم");
  await quantity.fill("1.5");
  await expect(page.getByTestId("quantity-error")).toHaveCount(0);
  await cta(page).click();
  await expect(page.getByRole("status")).toContainText("تمت إضافة");

  // The server holds 1.5 kg of the loose SKU, priced per kilogram.
  const headers = bearer(await customerToken(request));
  await expect
    .poll(async () => {
      const cart = await (await request.get(`${API}/cart`, { headers })).json();
      return cart.items.find((item: { variant_id: string }) => item.variant_id === product.loose)?.quantity;
    })
    .toBe(1.5);
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  const line = cart.items.find((item: { variant_id: string }) => item.variant_id === product.loose);
  expect(line.line_total).toBe(line.unit_price * 1.5);

  await page.goto("/cart");
  await expect(page.getByTestId("quantity-input")).toHaveValue("1.5");
  await expect(page.getByTestId("quantity-unit")).toHaveText("كغم");

  // A piece SKU: the page refuses the fraction before any request…
  await page.goto(`/product/${EARBUDS}?variant=${EARBUDS_STD}`);
  await page.getByTestId("quantity-input").fill("1.5");
  await expect(page.getByTestId("quantity-error")).toHaveAttribute("data-error", "wholeOnly");
  await expect(cta(page)).toBeDisabled();
  // …and the API refuses it too, whatever a client sends.
  const refused = await request.post(`${API}/cart/items`, {
    headers,
    data: { product_id: EARBUDS, variant_id: EARBUDS_STD, quantity: 1.5 },
  });
  expect(refused.status()).toBe(422);
  expect((await refused.json()).code).toBe("SKU_WHOLE_UNITS_ONLY");

  await emptyCart(request);
});
