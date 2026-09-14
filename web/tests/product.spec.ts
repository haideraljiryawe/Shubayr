import { expect, test, type Page } from "@playwright/test";

/**
 * Product detail page. Runs against the mock-backed dev server configured in
 * playwright.config.ts, so the fixtures in src/lib/mock-data.ts are the
 * contract: p1 has three colour variants (grey is out of stock) and a 40% cut.
 */

const PRODUCT = "/product/p1";

async function swatches(page: Page) {
  return page.locator("fieldset button[aria-pressed]");
}

/**
 * The purchase CTA, not a related product card's button — those carry the same
 * label. Only one of the two (desktop / sticky mobile) is visible at a time.
 */
function addToCartCta(page: Page) {
  return page.locator('[data-testid="pdp-add-to-cart"]:visible');
}

test("renders the product with price, discount and rating", async ({ page }) => {
  await page.goto(PRODUCT);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "سماعات لاسلكية",
  );
  await expect(page.getByText("$89", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$149", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("-40%").first()).toBeVisible();
});

test("a product with no active discount shows its price alone", async ({
  page,
}) => {
  // p2 carries no discount definition, so the contract reports on_sale=false
  // and effective_price === price: no struck original, no badge.
  await page.goto("/product/p2");

  // Scoped to the product's own price block: the related rail below it does
  // carry discounted tiles.
  const priceBlock = page.getByTestId("pdp-price").first();
  await expect(priceBlock.getByText("$299", { exact: true })).toBeVisible();
  await expect(priceBlock.locator(".line-through")).toHaveCount(0);
  await expect(priceBlock.getByText(/^-\d+%$/)).toHaveCount(0);
});

test("selecting a variant updates the URL so the choice is shareable", async ({
  page,
}) => {
  await page.goto(PRODUCT);

  const options = await swatches(page);
  await options.nth(1).click();

  await expect(page).toHaveURL(/variant=p1-green/);

  // Reloading the shared URL restores the same selection.
  await page.reload();
  await expect((await swatches(page)).nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("an out-of-stock variant blocks the CTA", async ({ page }) => {
  await page.goto(PRODUCT);

  // The grey variant is seeded with qty 0.
  await (await swatches(page)).nth(2).click();

  await expect(page.getByText("نفد من المخزون").first()).toBeVisible();
  await expect(addToCartCta(page)).toBeDisabled();
});

test("quantity is capped at the selected variant's stock", async ({ page }) => {
  await page.goto(PRODUCT);

  // Green has 4 in stock; the stepper must not exceed it.
  await (await swatches(page)).nth(1).click();
  const increase = page.getByRole("button", { name: "زيادة الكمية" });
  for (let i = 0; i < 8; i += 1) {
    if (await increase.isDisabled()) break;
    await increase.click();
  }
  await expect(page.getByLabel("الكمية", { exact: true })).toHaveText("4");
});

test("add to cart confirms with a toast", async ({ page }) => {
  await page.goto(PRODUCT);

  await addToCartCta(page).click();
  await expect(page.getByRole("status")).toContainText(
    "تمت إضافة المنتج إلى السلة",
  );
});

test("reviews show verified badges and paginate", async ({ page }) => {
  await page.goto(PRODUCT);

  const reviewsHeading = page.getByRole("heading", { name: "التقييمات" });
  await reviewsHeading.scrollIntoViewIfNeeded();

  await expect(page.getByText("شراء موثّق").first()).toBeVisible();
  await expect(page.getByText("صفحة 1 من 3")).toBeVisible();

  await page.getByRole("button", { name: "التقييمات التالية" }).click();
  await expect(page.getByText("صفحة 2 من 3")).toBeVisible();
});

test("a missing product returns a real 404, not a soft one", async ({
  page,
}) => {
  const response = await page.goto("/product/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("المنتج غير موجود")).toBeVisible();
});

test("english locale mirrors to LTR", async ({ page }) => {
  await page.goto("/en/product/p1");

  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Wireless headphones",
  );
});
