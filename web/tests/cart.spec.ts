import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/**
 * Cart page. Runs against the mock-backed dev server from playwright.config.ts,
 * so src/lib/mock-data.ts is the contract: p1 «سماعات لاسلكية» costs $89 (was
 * $149) and its colours carry 12 / 4 / 0 units. The delivery fee is the $5
 * default from src/lib/config.ts, and SHUBAYR10 takes 10% off.
 */

const PRODUCT = "/product/p1";

function addToCart(page: Page) {
  return page.locator('[data-testid="pdp-add-to-cart"]:visible');
}

/** The green colour, seeded with 4 units — the stock-cap fixture. */
function greenSwatch(page: Page) {
  return page.locator("fieldset button[aria-pressed]").nth(1);
}

test("adding from the product page fills the cart and survives a reload", async ({
  page,
}) => {
  await page.goto(PRODUCT);
  await addToCart(page).click();

  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  // A reload reads the cart back out of localStorage, not out of memory.
  await page.reload();
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  await page.goto("/cart");
  await expect(page.getByTestId("cart-items").locator("li")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "سماعات لاسلكية" })).toBeVisible();

  // And again on the cart page itself.
  await page.reload();
  await expect(page.getByTestId("cart-items").locator("li")).toHaveCount(1);
});

test("quantity is capped at the variant's available stock", async ({ page }) => {
  await page.goto(PRODUCT);
  await greenSwatch(page).click();
  await addToCart(page).click();
  await page.goto("/cart");

  const increase = page.getByRole("button", { name: "زيادة الكمية" });
  const quantity = page
    .getByTestId("cart-items")
    .getByLabel("الكمية", { exact: true });

  // Green is seeded with 4 units: four presses cannot get past it.
  for (let index = 0; index < 6; index += 1) {
    if (await increase.isEnabled()) await increase.click();
  }

  await expect(quantity).toHaveText("4");
  await expect(increase).toBeDisabled();
  await expect(page.getByTestId("cart-max-qty")).toHaveText(
    "الحد الأقصى المتاح 4",
  );

  // The cap is stored, not just rendered.
  await page.reload();
  await expect(
    page.getByTestId("cart-items").getByLabel("الكمية", { exact: true }),
  ).toHaveText("4");
});

test("totals add up, and a coupon discounts them", async ({ page }) => {
  await page.goto(PRODUCT);
  await addToCart(page).click();
  await page.goto("/cart");

  // 1 × $89 + $5 delivery.
  await expect(page.getByTestId("summary-subtotal")).toHaveText("$89");
  await expect(page.getByTestId("summary-delivery")).toHaveText("$5");
  await expect(page.getByTestId("summary-discount")).toHaveCount(0);
  await expect(page.getByTestId("summary-total")).toHaveText("$94");

  // Two units: the subtotal and the total move, the fee does not.
  await page.getByRole("button", { name: "زيادة الكمية" }).click();
  await expect(page.getByTestId("summary-subtotal")).toHaveText("$178");
  await expect(page.getByTestId("summary-delivery")).toHaveText("$5");
  await expect(page.getByTestId("summary-total")).toHaveText("$183");

  // SHUBAYR10 is 10% off the subtotal: $17.8 off $183.
  await page.getByTestId("coupon-input").fill("SHUBAYR10");
  await page.getByTestId("coupon-apply").click();

  await expect(page.getByTestId("summary-discount")).toHaveText("−$17.8");
  await expect(page.getByTestId("summary-total")).toHaveText("$165.2");

  // Removing it puts the total back.
  await page.getByTestId("coupon-remove").click();
  await expect(page.getByTestId("summary-discount")).toHaveCount(0);
  await expect(page.getByTestId("summary-total")).toHaveText("$183");
});

test("an unknown coupon is rejected without changing the totals", async ({
  page,
}) => {
  await page.goto(PRODUCT);
  await addToCart(page).click();
  await page.goto("/cart");

  await page.getByTestId("coupon-input").fill("NOT-A-COUPON");
  await page.getByTestId("coupon-apply").click();

  await expect(
    page.getByText("رمز الكوبون غير صالح أو منتهي الصلاحية"),
  ).toBeVisible();
  await expect(page.getByTestId("summary-discount")).toHaveCount(0);
  await expect(page.getByTestId("summary-total")).toHaveText("$94");
});

test("removing the last item shows the empty state", async ({ page }) => {
  await page.goto("/cart");
  // A first-time visitor already sees it.
  await expect(page.getByTestId("cart-empty")).toBeVisible();
  await expect(page.getByRole("link", { name: "تصفّح المنتجات" })).toBeVisible();

  await page.goto(PRODUCT);
  await addToCart(page).click();
  await page.goto("/cart");
  await expect(page.getByTestId("cart-items")).toBeVisible();

  await page.getByTestId("cart-remove").click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
  await expect(page.getByTestId("cart-badge")).toHaveCount(0);
});

test("clear-all empties the whole cart", async ({ page }) => {
  await page.goto(PRODUCT);
  await addToCart(page).click();
  await page.goto("/product/p2");
  await addToCart(page).click();
  await page.goto("/cart");
  await expect(page.getByTestId("cart-items").locator("li")).toHaveCount(2);

  await page.getByTestId("cart-clear").click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
});

for (const [name, width, height] of [
  ["mobile", 390, 844],
  ["desktop", 1440, 1000],
] as const) {
  test(`cart screenshot with items, coupon and totals: ${name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await mkdir("docs/screenshots", { recursive: true });

    await page.goto(PRODUCT);
    await addToCart(page).click();
    await page.goto("/product/p11");
    await addToCart(page).click();
    await page.goto("/cart");

    await page.getByTestId("coupon-input").fill("SHUBAYR10");
    await page.getByTestId("coupon-apply").click();
    await expect(page.getByTestId("summary-discount")).toBeVisible();
    // Let the confirmation toast clear so it does not sit over the totals.
    await expect(page.locator('div[role="status"][aria-live="polite"]')).toBeEmpty();

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    // No page-level horizontal overflow at either width.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `docs/screenshots/cart-${name}.png`,
      fullPage: true,
      caret: "initial",
      style: "nextjs-portal { display: none !important; }",
    });
  });
}
