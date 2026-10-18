import { expect, test, type Page } from "@playwright/test";

/**
 * The delivery fee and the full total before ordering, and the guest's
 * discount progress (API 16.2), on the sample store: Wasit $5, Baghdad $6,
 * Basra not served; tiers 5% from $200 and 10% from $400; the product is $89.
 * A guest's figures use the server's own arithmetic, so the cart and the
 * checkout review show the same total.
 */

const PRODUCT = "/product/p1";

async function addProduct(page: Page, times = 1) {
  await page.goto(PRODUCT);
  for (let i = 0; i < times; i += 1) await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
}

async function hydrated(page: Page, testId: string) {
  await page.waitForFunction((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    return !!element && Object.keys(element).some((key) => key.startsWith("__reactProps"));
  }, testId);
}

test("a guest picks a governorate in the cart: its fee and the full total", async ({ page }) => {
  await addProduct(page);
  await page.goto("/cart");
  await hydrated(page, "cart-delivery-governorate");
  // Before a governorate: delivery is pending and the total is before delivery.
  await expect(page.getByTestId("summary-delivery")).toHaveText("حسب المحافظة");
  await expect(page.getByTestId("cart-summary")).toContainText("الإجمالي قبل التوصيل");
  // Each governorate says its fee, or that it is not delivered to yet.
  const select = page.getByTestId("cart-delivery-governorate");
  await expect(select.locator("option", { hasText: "بغداد" })).toHaveText("بغداد — $6");
  await expect(select.locator("option", { hasText: "البصرة" })).toContainText("لا نوصل إليها بعد");

  await select.selectOption({ label: "بغداد — $6" });
  await expect(page.getByTestId("summary-delivery")).toHaveText("$6");
  await expect(page.getByTestId("cart-summary")).not.toContainText("الإجمالي قبل التوصيل");
  await expect(page.getByTestId("summary-total")).toHaveText("$95");

  // The choice is remembered.
  await page.reload();
  await expect(page.getByTestId("summary-delivery")).toHaveText("$6");
  await expect(page.getByTestId("summary-total")).toHaveText("$95");
});

test("an unserved governorate says so, with no fee", async ({ page }) => {
  await addProduct(page);
  await page.goto("/cart");
  await hydrated(page, "cart-delivery-governorate");
  const select = page.getByTestId("cart-delivery-governorate");
  await select.selectOption({ label: await select.locator("option", { hasText: "البصرة" }).innerText() });
  await expect(page.getByTestId("cart-delivery-problem")).toHaveText("لا نوصل إلى البصرة بعد.");
  await expect(page.getByTestId("summary-delivery")).toHaveText("حسب المحافظة");
  await expect(page.getByTestId("summary-total")).toHaveText("$89");
});

test("a guest sees the discount progress bar from the public tiers", async ({ page }) => {
  await addProduct(page);
  await page.goto("/cart");
  await hydrated(page, "cart-delivery-governorate");
  // $89 of $200: $111 to go for 5%.
  await expect(page.getByTestId("tier-progress")).toHaveAttribute("data-kind", "next");
  await expect(page.getByTestId("tier-progress-text")).toContainText("$111");
  await expect(page.getByTestId("tier-progress-text")).toContainText("5");

  // Three: $267 reaches 5% ($13.35 off); 10% is $133 away.
  await page.getByRole("button", { name: "زيادة الكمية" }).click();
  await page.getByRole("button", { name: "زيادة الكمية" }).click();
  await expect(page.getByTestId("summary-subtotal")).toHaveText("$267");
  await expect(page.getByTestId("summary-tier-discount")).toHaveText("−$13.35");
  await expect(page.getByTestId("tier-progress-text")).toContainText("$133");
  await expect(page.getByTestId("tier-progress-current")).toBeVisible();
  await page.getByTestId("cart-delivery-governorate").selectOption({ label: "واسط — $5" });
  // $267 − $13.35 + $5.
  await expect(page.getByTestId("summary-total")).toHaveText("$258.65");
});

test("the cart total is the checkout total, coupon and delivery included", async ({ page }) => {
  await addProduct(page, 3);
  await page.goto("/cart");
  await hydrated(page, "cart-delivery-governorate");
  await page.getByTestId("cart-delivery-governorate").selectOption({ label: "بغداد — $6" });
  // SHUBAYR10 (10% = $26.70) beats the 5% tier ($13.35) without stacking.
  await page.getByTestId("coupon-input").fill("SHUBAYR10");
  await page.getByTestId("coupon-apply").click();
  await expect(page.getByTestId("summary-discount")).toHaveText("−$26.7");
  await expect(page.getByTestId("summary-tier-discount")).toHaveCount(0);
  const cartTotal = (await page.getByTestId("summary-total").textContent())?.trim();
  expect(cartTotal).toBe("$246.3");

  await page.getByTestId("cart-checkout").click();
  // The governorate chosen in the cart is already selected.
  await expect(page.getByTestId("address-governorate")).toHaveValue("22222222-2222-4222-8222-222222222222");
  await page.getByTestId("address-name").fill("أحمد علي");
  await page.getByTestId("address-phone").fill("07701234567");
  await page.getByTestId("address-city").fill("بغداد");
  await page.getByTestId("address-area").fill("الكرادة");
  await page.getByTestId("address-street").fill("شارع 62");
  await page.getByTestId("address-details").fill("قرب الجسر");
  await page.getByTestId("address-submit").click();
  await expect(page.getByTestId("place-order")).toBeVisible();
  await expect(page.getByTestId("summary-delivery")).toHaveText("$6");
  await expect(page.getByTestId("summary-total")).toHaveText(cartTotal!);
});
