import { expect, test, type Page } from "@playwright/test";
import ar from "../src/messages/ar.json";
import en from "../src/messages/en.json";

/**
 * PR W1 on the mock-backed store (hermetic): the 17.7.0 home banners, Recently
 * Added, the per-order maximum on a guest cart, and every 17.13.0 sign-in
 * state. The mock answers fixed test numbers with each OTP refusal (see
 * mockRequestOtp in src/lib/api.ts); p11 has a per-order maximum of 3.
 */

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));

const addToCart = (page: Page) => page.locator('[data-testid="pdp-add-to-cart"]:visible');

test.describe("home banners (NOTE-001)", () => {
  for (const [prefix, locale] of [["", "ar"], ["/en", "en"]] as const) {
    test(`each banner follows its own action, ${locale}`, async ({ page }) => {
      await page.goto(`${prefix}/`);
      const slides = page.getByTestId("hero-banner");
      await expect(slides).toHaveCount(4);
      // Offers, with a button label: the button opens the on-sale listing in this language.
      await expect(slides.nth(0)).toHaveAttribute("data-action", "button");
      await expect(slides.nth(0).getByTestId("hero-cta")).toHaveAttribute("href", `${prefix}/search?on_sale=true`);
      // A category without a label: the whole card opens it.
      await expect(slides.nth(1)).toHaveAttribute("data-action", "card");
      await expect(slides.nth(1).getByTestId("hero-card-link")).toHaveAttribute("href", `${prefix}/category/electronics`);
      // No action: nothing clickable, no button.
      await expect(slides.nth(2)).toHaveAttribute("data-action", "none");
      await expect(slides.nth(2).locator("a")).toHaveCount(0);
      // Image-only with an external URL: no text drawn, a new isolated tab.
      const imageOnly = slides.nth(3);
      await expect(imageOnly).toHaveAttribute("data-show-text", "false");
      await expect(imageOnly.getByTestId("hero-title")).toHaveCount(0);
      const external = imageOnly.getByTestId("hero-card-link");
      await expect(external).toHaveAttribute("href", "https://example.com/shubayr");
      await expect(external).toHaveAttribute("target", "_blank");
      await expect(external).toHaveAttribute("rel", "noopener noreferrer");
      await expect(external).toHaveAttribute("aria-label", locale === "ar" ? "شبير في كل مكان" : "Shubayr everywhere");
    });
  }
});

test("Recently Added takes the New arrivals place when it is on and has products", async ({ page }) => {
  await page.goto("/");
  const recent = page.getByTestId("recently-added");
  await expect(recent).toBeVisible();
  await expect(recent).toContainText(ar.home.recentlyAddedTitle);
  await expect(recent.locator('a[href*="/product/"]').first()).toBeVisible();
  await expect(page.getByTestId("new-arrivals")).toHaveCount(0);
});

test.describe("per-order maximum (NOTE-011), guest cart", () => {
  test("shown on the product page, capped across sizes and in the cart", async ({ page }) => {
    await page.goto("/product/p11");
    const limit = page.getByTestId("purchase-limit");
    await expect(limit).toContainText(fill(ar.purchaseLimit.max, { max: 3 }));
    const increase = page.locator(`button[aria-label="${ar.common.increase}"]:visible`).first();
    const quantity = page.locator('[data-testid="quantity-input"]:visible').first();
    await increase.click();
    await increase.click();
    await expect(quantity).toHaveValue("3");
    // The fourth pair is past the maximum, though size 40 has 6 in stock.
    await expect(increase).toBeDisabled();
    await addToCart(page).click();
    await expect(page.getByTestId("purchase-limit-reached")).toBeVisible();
    await expect(addToCart(page)).toBeDisabled();
    // Another size of the same product: still at the maximum.
    await page.locator('button[aria-pressed]:visible', { hasText: "42" }).first().click();
    await expect(page.getByTestId("purchase-limit-reached")).toBeVisible();
    await expect(addToCart(page)).toBeDisabled();

    await page.goto("/cart");
    const row = page.getByTestId("cart-items").locator("li").first();
    await expect(row.locator('[data-testid="quantity-input"]')).toHaveValue("3");
    await expect(row.locator(`button[aria-label="${ar.common.increase}"]`)).toBeDisabled();
    await expect(row.getByTestId("cart-limit-note")).toHaveText(fill(ar.purchaseLimit.max, { max: 3 }));

    // One pair back: the product page offers exactly one more, in any size.
    await row.locator(`button[aria-label="${ar.common.decrease}"]`).click();
    await expect(row.locator('[data-testid="quantity-input"]')).toHaveValue("2");
    await page.goto("/product/p11");
    await expect(page.getByTestId("purchase-limit-in-cart")).toBeVisible();
    await expect(addToCart(page)).toBeEnabled();
  });

  test("English wording", async ({ page }) => {
    await page.goto("/en/product/p11");
    await expect(page.getByTestId("purchase-limit")).toContainText("Maximum 3 per order");
  });
});

test.describe("sign-in OTP (contract 17.13.0)", () => {
  async function send(page: Page, phone: string, prefix = "") {
    // A fresh form each time: the tab keeps sign-in progress across visits (A10).
    if (page.url().startsWith("http")) await page.evaluate(() => window.sessionStorage.clear());
    await page.goto(`${prefix}/login`);
    await expect(page.getByTestId("auth-phone")).toHaveValue("");
    await page.getByTestId("auth-phone").fill(phone);
    await page.getByTestId("auth-send-otp").click();
  }

  test("the resend countdown starts from the server's wait", async ({ page }) => {
    await send(page, "07701234567");
    const cooldown = page.getByTestId("auth-cooldown");
    await expect(cooldown).toBeVisible();
    const seconds = Number((await cooldown.textContent())?.match(/\d+/)?.[0]);
    // The mock server says 60; the old client-side guess was 30.
    expect(seconds).toBeGreaterThan(30);
    expect(seconds).toBeLessThanOrEqual(60);
    await expect(page.getByTestId("auth-resend")).toBeDisabled();
  });

  test("OTP_RESEND_TOO_SOON: worded with the wait, sending held for that number only", async ({ page }) => {
    await send(page, "07700000429");
    await expect(page.getByText(fill(ar.auth.errResendTooSoon, { wait: "45 ثانية" }))).toBeVisible();
    await expect(page.getByTestId("auth-send-otp")).toBeDisabled();
    await expect(page.getByTestId("auth-send-cooldown")).toBeVisible();
    // Another number isn't held back by this one's wait.
    await page.getByTestId("auth-phone").fill("07701234567");
    await expect(page.getByTestId("auth-send-otp")).toBeEnabled();
  });

  test("OTP_PHONE_QUOTA_EXCEEDED and OTP_IP_QUOTA_EXCEEDED name the wait", async ({ page }) => {
    await send(page, "07700000430", "/en");
    await expect(page.getByText(fill(en.auth.errPhoneQuota, { wait: "1 hour" }))).toBeVisible();
    await send(page, "07700000431", "/en");
    await expect(page.getByText(fill(en.auth.errIpQuota, { wait: "15 minutes" }))).toBeVisible();
    // The network-wide limit holds back every number.
    await page.getByTestId("auth-phone").fill("07701234567");
    await expect(page.getByTestId("auth-send-otp")).toBeDisabled();
  });

  test("OTP_DELIVERY_UNAVAILABLE and SMS_NOT_CONFIGURED: try again shortly", async ({ page }) => {
    await send(page, "07700000503");
    await expect(page.getByText(ar.auth.errDeliveryUnavailable)).toBeVisible();
    await expect(page.getByTestId("auth-send-otp")).toBeEnabled();
    await send(page, "07700000504", "/en");
    await expect(page.getByText(en.auth.errDeliveryUnavailable)).toBeVisible();
    await expect(page.getByText("SMS_NOT_CONFIGURED")).toHaveCount(0);
  });

  test("attempts remaining count down; then the code is locked and a new one is offered", async ({ page }) => {
    await send(page, "07701234567", "/en");
    const code = page.getByTestId("auth-code");
    for (const left of [4, 3, 2, 1]) {
      await code.fill("000000");
      await page.getByTestId("auth-verify").click();
      await expect(page.getByText(left === 1 ? "That code is wrong. 1 attempt left." : `That code is wrong. ${left} attempts left.`)).toBeVisible();
    }
    await code.fill("000000");
    await page.getByTestId("auth-verify").click();
    await expect(page.getByText(en.auth.errAttemptsExceeded)).toBeVisible();
    await expect(code).toHaveValue("");
    await expect(code).toBeDisabled();
    await expect(page.getByTestId("auth-verify")).toBeDisabled();
    const resend = page.getByTestId("auth-resend");
    await expect(resend).toHaveAttribute("data-exhausted", "true");
    await expect(resend).toHaveText(en.auth.requestNewCode);
  });
});
