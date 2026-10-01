import { expect, test, type Page } from "@playwright/test";

/**
 * Catalog v2 on the storefront, against the mock-backed dev server
 * (playwright.config.ts forces NEXT_PUBLIC_USE_MOCKS). The fixtures in
 * src/lib/mock-data.ts are the contract here:
 *
 * - brands Sonic / Nova / Atlas / Luma are visible, "Retired" is hidden;
 * - p1's green and grey SKUs override the price (159 before the 60 off), grey
 *   is out of stock and green is at its low-stock threshold;
 * - p36 is basmati rice sold by the kilogram (7.5 kg left, threshold 10 kg);
 * - c1-phones holds a legacy third-level category the storefront must drop.
 *
 * Every assertion reads the visible filter panel: desktop and mobile each
 * render one, and only one is on screen at a time.
 */

test.use({ viewport: { width: 1440, height: 1000 } });

const ARABIC_DIGITS = /[٠-٩]/g;

/** "١٢ منتجات" → 12, whatever digits the locale printed. */
function numberIn(text: string): number {
  const latin = text.replace(ARABIC_DIGITS, (digit) =>
    String(digit.charCodeAt(0) - 0x660),
  );
  return Number(latin.match(/\d+/)?.[0] ?? NaN);
}

async function resultCount(page: Page): Promise<number> {
  // Streaming can briefly hold the old and the new count; read the visible.
  return numberIn(
    await page.locator('[data-testid="result-count"]:visible').first().innerText(),
  );
}

function panel(page: Page) {
  return page.locator('[data-testid="brand-filter"]:visible');
}

async function facet(page: Page, slug: string): Promise<number> {
  return numberIn(await panel(page).getByTestId(`brand-count-${slug}`).innerText());
}

/** Submit the visible filter form and wait for the page it navigates to. */
async function apply(page: Page) {
  const before = page.url();
  await page
    .locator("form:visible")
    .getByRole("button", { name: "عرض النتائج" })
    .click();
  await page.waitForURL((url) => url.toString() !== before);
  await page.waitForLoadState();
}

function cta(page: Page) {
  return page.locator('[data-testid="pdp-add-to-cart"]:visible');
}

test("brand filter: multi-select with facet counts, combined with other filters", async ({
  page,
}) => {
  await page.goto("/category/electronics");

  // Facets are offered with their counts; the hidden brand never is.
  await expect(panel(page)).toBeVisible();
  const sonic = await facet(page, "sonic");
  const nova = await facet(page, "nova");
  expect(sonic).toBeGreaterThan(0);
  expect(nova).toBeGreaterThan(0);
  await expect(panel(page).getByTestId("brand-option-retired")).toHaveCount(0);

  // One brand: the results are exactly its facet count.
  await panel(page).getByTestId("brand-option-sonic").check();
  await apply(page);
  await expect(page).toHaveURL(/brand_id=brand-sonic/);
  await expect.poll(() => resultCount(page)).toBe(sonic);
  await expect(page.getByTestId("selected-brands")).toContainText("سونيك");
  // The other brands keep their counts: facets ignore the brand filter itself.
  expect(await facet(page, "nova")).toBe(nova);

  // Two brands: a union, and the URL repeats the parameter.
  await panel(page).getByTestId("brand-option-nova").check();
  await apply(page);
  await expect(page).toHaveURL(/brand_id=brand-sonic&.*brand_id=brand-nova|brand_id=brand-nova&.*brand_id=brand-sonic/);
  await expect.poll(() => resultCount(page)).toBe(sonic + nova);

  // Combined with "on sale": both the results and the facets narrow together.
  await page.locator("form:visible").locator('input[name="on_sale"]').check();
  await apply(page);
  const saleSonic = await facet(page, "sonic");
  const saleNova = await facet(page, "nova");
  expect(saleSonic + saleNova).toBeLessThan(sonic + nova);
  await expect.poll(() => resultCount(page)).toBe(saleSonic + saleNova);

  // Sorting keeps the brand choice.
  await page.locator("select[name=sort]:visible").selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
  await page.waitForLoadState();
  await expect(page).toHaveURL(/brand_id=brand-sonic/);
  await expect(page).toHaveURL(/brand_id=brand-nova/);
  await expect.poll(() => resultCount(page)).toBe(saleSonic + saleNova);

  // A chip removes one brand and keeps the rest of the query.
  await page.getByTestId("selected-brands").getByRole("link", { name: "نوفا" }).click();
  await expect(page).not.toHaveURL(/brand-nova/);
  await expect(page).toHaveURL(/brand_id=brand-sonic/);
  await expect(page).toHaveURL(/on_sale=true/);
  await expect.poll(() => resultCount(page)).toBe(saleSonic);
});

test("brands page lists visible brands and opens the filtered catalog", async ({
  page,
}) => {
  await page.goto("/categories");
  await page.getByTestId("brands-link").click();
  await expect(page).toHaveURL(/\/brands$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "العلامات التجارية",
  );
  const grid = page.getByTestId("brand-grid");
  await expect(grid.locator("> li")).toHaveCount(4);
  await expect(grid).not.toContainText("متوقفة");

  await page.getByTestId("brand-tile-atlas").click();
  await expect(page).toHaveURL(/\/search\?brand_id=brand-atlas/);
  await expect(page.getByTestId("selected-brands")).toBeVisible();
  const atlas = await facet(page, "atlas");
  await expect.poll(() => resultCount(page)).toBe(atlas);
  await expect(page.getByTestId("selected-brands")).toContainText("أطلس");
});

test("categories stay two levels: a legacy third level is never shown or routed", async ({
  page,
}) => {
  await page.goto("/category/electronics");
  const subcategories = page.locator("select[name=category_id]:visible");
  await expect(subcategories.locator("option")).toContainText([
    "الهواتف والأجهزة اللوحية",
  ]);
  await expect(subcategories).not.toContainText("مستوى ثالث قديم");

  // The subcategory page offers no deeper level either.
  await page.goto("/category/phones");
  await expect(page.locator("select[name=category_id]:visible")).toHaveCount(0);

  const response = await page.goto("/category/legacy-third-level");
  expect(response?.status()).toBe(404);
});

test("the price follows the selected SKU", async ({ page }) => {
  await page.goto("/product/p1");
  const price = page.getByTestId("pdp-price").first();
  await expect(price.getByText("$89", { exact: true })).toBeVisible();

  // Green overrides the price: 159 regular, 99 after the product's 60 off.
  await page.getByRole("button", { name: /Green|أخضر/ }).click();
  await expect(price.getByText("$99", { exact: true })).toBeVisible();
  await expect(price.getByText("$159", { exact: true })).toBeVisible();
  await expect(price.getByText("$89", { exact: true })).toHaveCount(0);

  // The cart line keeps the SKU's own price.
  await cta(page).click();
  await page.goto("/cart");
  await expect(page.getByTestId("summary-subtotal")).toHaveText("$99");

  // And back to black.
  await page.goto("/product/p1?variant=p1-black");
  await expect(price.getByText("$89", { exact: true })).toBeVisible();
});

test("availability is a label per SKU, never a quantity", async ({ page }) => {
  await page.goto("/product/p1?variant=p1-black");
  const label = page.getByTestId("availability");
  await expect(label).toHaveText("متوفر في المخزون");

  await page.getByRole("button", { name: /Green|أخضر/ }).click();
  await expect(label).toHaveText("مخزون منخفض");
  await expect(label).not.toHaveText(/\d|[٠-٩]/);
  // Low stock never blocks the sale.
  await expect(cta(page)).toBeEnabled();

  await page.getByRole("button", { name: /Gray|رمادي/ }).click();
  await expect(label).toHaveText("غير متوفر في المخزون");
  await expect(cta(page)).toBeDisabled();

  // A fraction below the threshold is low stock too (7.5 kg of 10 kg).
  await page.goto("/product/p36");
  await expect(label).toHaveText("مخزون منخفض");
  await expect(page.getByText(/7[.,٫]5|٧/)).toHaveCount(0);
});

test("a weight SKU takes a decimal quantity with its unit; a piece SKU refuses a fraction", async ({
  page,
}) => {
  await page.goto("/product/p36");
  const quantity = page.getByTestId("quantity-input");
  await expect(page.getByTestId("quantity-unit")).toHaveText("كغم");
  await expect(page.getByTestId("price-per-unit")).toHaveText("السعر لكل كغم");

  // Four decimals is one too many; three is fine; Arabic digits and the
  // Arabic decimal mark read the same as Latin.
  await quantity.fill("1.2345");
  await expect(page.getByTestId("quantity-error")).toHaveAttribute(
    "data-error",
    "tooManyDecimals",
  );
  await expect(cta(page)).toBeDisabled();
  await quantity.fill("١٫٥");
  await expect(page.getByTestId("quantity-error")).toHaveCount(0);
  await expect(cta(page)).toBeEnabled();
  await cta(page).click();

  // One item on the badge, 1.5 kg in the cart, priced 1.5 × $3.
  await expect(page.getByTestId("cart-badge")).toHaveText("1");
  await page.goto("/cart");
  await expect(page.getByTestId("quantity-input")).toHaveValue("1.5");
  await expect(page.getByTestId("quantity-unit")).toHaveText("كغم");
  await expect(page.getByTestId("summary-subtotal")).toHaveText("$4.5");

  // Changing it in the cart keeps three decimals.
  await page.getByTestId("quantity-input").fill("2.125");
  await expect(page.getByTestId("summary-subtotal")).toHaveText("$6.38");

  // A piece SKU: a fraction is refused next to the field and blocks the CTA.
  await page.goto("/product/p2");
  const piece = page.getByTestId("quantity-input");
  await expect(page.getByTestId("quantity-unit")).toHaveCount(0);
  await piece.fill("1.5");
  await expect(page.getByTestId("quantity-error")).toHaveText(
    "هذا المنتج يُباع بالقطعة — أدخل عددًا صحيحًا.",
  );
  await expect(cta(page)).toBeDisabled();
  await piece.fill("2");
  await expect(page.getByTestId("quantity-error")).toHaveCount(0);
  await expect(cta(page)).toBeEnabled();
});

test("no negotiation leftovers on the product page", async ({ page }) => {
  await page.goto("/product/p1");
  await expect(page.getByText(/تفاوض|Negotiab/i)).toHaveCount(0);
});
