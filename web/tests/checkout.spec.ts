import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/**
 * Cash-on-Delivery checkout: address → sign-in gate → review → confirmation.
 * Mock-backed, same fixtures as the cart spec.
 */

const PRODUCT = "/product/p1";

function addToCart(page: Page) {
  return page.locator('[data-testid="pdp-add-to-cart"]:visible');
}

async function fillAddress(page: Page) {
  await page.getByTestId("address-name").fill("أحمد علي");
  await page.getByTestId("address-phone").fill("07701234567");
  await page.getByTestId("address-city").fill("واسط");
  await page.getByTestId("address-area").fill("حي الزهراء");
  await page.getByTestId("address-street").fill("شارع 14");
  await page.getByTestId("address-details").fill("قرب مدرسة الأمل، دار رقم 7");
}

test("an empty cart cannot be checked out", async ({ page }) => {
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-empty")).toBeVisible();
  await expect(page.getByRole("link", { name: "العودة إلى السلة" })).toBeVisible();
});

test("the address step refuses to advance while it is invalid", async ({
  page,
}) => {
  await page.goto(PRODUCT);
  await addToCart(page).click();
  await page.goto("/checkout");

  await page.getByTestId("address-submit").click();
  await expect(page.getByText("يرجى تصحيح الحقول المميّزة أدناه.")).toBeVisible();
  // Still on the address step.
  await expect(page.getByTestId("place-order")).toHaveCount(0);

  // A malformed phone is caught on its own.
  await fillAddress(page);
  await page.getByTestId("address-phone").fill("123");
  await page.getByTestId("address-submit").click();
  await expect(
    page.getByText("أدخل رقم هاتف صحيح (11 رقمًا يبدأ بـ 07)"),
  ).toBeVisible();

  await page.getByTestId("address-phone").fill("07701234567");
  await page.getByTestId("address-submit").click();
  await expect(page.getByTestId("place-order")).toBeVisible();
});

test("review shows the order, then placing it confirms and clears the cart", async ({
  page,
}) => {
  await page.goto(PRODUCT);
  await addToCart(page).click();
  await page.goto("/checkout");
  await fillAddress(page);
  await page.getByTestId("address-submit").click();

  // Review carries the items, the address and the same totals as the cart.
  await expect(page.getByText("سماعات لاسلكية")).toBeVisible();
  await expect(page.getByText("واسط — حي الزهراء — شارع 14")).toBeVisible();
  await expect(page.getByText("الدفع عند الاستلام").first()).toBeVisible();
  await expect(page.getByTestId("summary-total")).toHaveText("$94");

  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("auth-phone")).toBeVisible();
  // The phone from the address seeds the sign-in step.
  await expect(page.getByTestId("auth-phone")).toHaveValue("07701234567");
  await page.getByTestId("auth-submit").click();

  await page.getByTestId("place-order").click();

  const confirmation = page.getByTestId("order-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole("heading", { name: "تم استلام طلبك!" }),
  ).toBeVisible();
  await expect(page.getByTestId("order-number")).toHaveText(/^SB-\d+$/);
  await expect(confirmation.getByText("الدفع عند الاستلام")).toBeVisible();
  await expect(page.getByTestId("summary-total")).toHaveText("$94");

  // The order emptied the cart.
  await expect(page.getByTestId("cart-badge")).toHaveCount(0);
  await page.getByTestId("track-order").click();
  await expect(page).toHaveURL(/\/orders\/[^/]+\/track$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "صفحة تتبّع الطلب قيد الإنشاء",
  );

  await page.goto("/cart");
  await expect(page.getByTestId("cart-empty")).toBeVisible();
});

test("a coupon applied in the cart carries into the order", async ({ page }) => {
  await page.goto(PRODUCT);
  await addToCart(page).click();
  await page.goto("/cart");
  await page.getByTestId("coupon-input").fill("WELCOME5");
  await page.getByTestId("coupon-apply").click();
  await expect(page.getByTestId("summary-total")).toHaveText("$89");

  await page.getByTestId("cart-checkout").click();
  await fillAddress(page);
  await page.getByTestId("address-submit").click();

  // $89 + $5 delivery − $5 fixed coupon.
  await expect(page.getByTestId("summary-discount")).toHaveText("−$5");
  await expect(page.getByTestId("summary-total")).toHaveText("$89");

  await page.getByTestId("place-order").click();
  await page.getByTestId("auth-submit").click();
  await page.getByTestId("place-order").click();

  await expect(page.getByTestId("order-confirmation")).toBeVisible();
  await expect(page.getByTestId("summary-discount")).toHaveText("−$5");
  await expect(page.getByTestId("summary-total")).toHaveText("$89");
});

for (const [name, width, height] of [
  ["mobile", 390, 844],
  ["desktop", 1440, 1000],
] as const) {
  test(`checkout step screenshots: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mkdir("docs/screenshots", { recursive: true });

    const shoot = async (step: string) => {
      // Let any confirmation toast clear before capturing the step.
      await expect(
        page.locator('div[role="status"][aria-live="polite"]'),
      ).toBeEmpty();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState("networkidle");
      // No horizontal overflow at any step, at either width.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `docs/screenshots/checkout-${step}-${name}.png`,
        fullPage: true,
        caret: "initial",
        style: "nextjs-portal { display: none !important; }",
      });
    };

    await page.goto(PRODUCT);
    await addToCart(page).click();
    await page.goto("/checkout");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await fillAddress(page);
    await shoot("address");

    await page.getByTestId("address-submit").click();
    await expect(page.getByTestId("place-order")).toBeVisible();
    await shoot("review");

    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("auth-phone")).toBeVisible();
    await shoot("signin");

    await page.getByTestId("auth-submit").click();
    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("order-confirmation")).toBeVisible();
    await shoot("confirmation");
  });
}
