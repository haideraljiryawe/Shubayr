import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import ar from "../../src/messages/ar.json";
import en from "../../src/messages/en.json";

/**
 * PR W1 review screenshots (see playwright.evidence.config.ts): each shot
 * follows the assertion of what it shows.
 */

test.describe.configure({ mode: "serial" });

const OUT = join(__dirname, "..", "..", "..", "docs", "reviews", "web-store-w1-evidence");
const SIZES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;
const LOCALES = [
  { locale: "ar", prefix: "", m: ar },
  { locale: "en", prefix: "/en", m: en },
] as const;

async function shot(target: Page | Locator, name: string) {
  const page = "goto" in target ? (target as Page) : (target as Locator).page();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready);
  const path = join(OUT, `${name}.png`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  // The dev server may re-render a page it has just compiled: try once more.
  for (let attempt = 0; ; attempt += 1) {
    try {
      if ("goto" in target) await (target as Page).screenshot({ path, animations: "disabled", caret: "hide" });
      else await (target as Locator).screenshot({ path, animations: "disabled", caret: "hide" });
      return;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(500);
    }
  }
}

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

for (const { locale, prefix, m } of LOCALES) {
  for (const size of SIZES) {
    const tag = `${locale}.${size.name}`;

    test(`W1 ${tag}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ reducedMotion: "reduce" });

      // Banners (NOTE-001): the first slide with its button, then the image-only one.
      await page.goto(`${prefix}/`);
      const carousel = page.locator('section[aria-roledescription="carousel"]');
      await expect(page.getByTestId("hero-banner")).toHaveCount(4);
      await expect(page.getByTestId("hero-banner").nth(0)).toHaveAttribute("data-action", "button");
      await noSidewaysScroll(page);
      await shot(carousel, `banner-button.${tag}`);
      await page.getByRole("button", { name: m.home.goToSlide.replace("{number}", "4") }).click();
      const imageOnly = page.getByTestId("hero-banner").nth(3);
      await expect(imageOnly).toHaveAttribute("data-show-text", "false");
      await expect(imageOnly.getByTestId("hero-title")).toHaveCount(0);
      await expect(imageOnly).toBeInViewport();
      // Wait for the smooth scroll to settle on the slide before the picture.
      await expect
        .poll(async () => {
          const [slide, frame] = await Promise.all([imageOnly.boundingBox(), carousel.boundingBox()]);
          // The picture is centred in its slide: compare centres.
          return slide && frame ? Math.round(Math.abs(slide.x + slide.width / 2 - (frame.x + frame.width / 2))) : 999;
        })
        .toBeLessThanOrEqual(1);
      await shot(carousel, `banner-image-only.${tag}`);

      // Recently Added (NOTE-004).
      const recent = page.getByTestId("recently-added");
      await expect(recent).toContainText(m.home.recentlyAddedTitle);
      await recent.scrollIntoViewIfNeeded();
      await shot(recent, `recently-added.${tag}`);

      // Per-order maximum (NOTE-011): the limit, then the reached state, then the cart.
      await page.evaluate(() => window.localStorage.clear());
      await page.goto(`${prefix}/product/p11`);
      const limit = page.getByTestId("purchase-limit");
      await expect(limit).toContainText(m.purchaseLimit.max.replace("{max}", "3"));
      const details = limit.locator("xpath=ancestor::div[contains(@class,'flex-col')][2]");
      await details.scrollIntoViewIfNeeded();
      await shot(details, `limit-shown.${tag}`);
      const increase = page.locator(`button[aria-label="${m.common.increase}"]:visible`).first();
      await increase.click();
      await increase.click();
      await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
      await expect(page.getByTestId("purchase-limit-reached")).toBeVisible();
      await expect(page.locator('div[role="status"][aria-live="polite"]').first()).toBeEmpty({ timeout: 10000 });
      await shot(details, `limit-reached.${tag}`);
      await page.goto(`${prefix}/cart`);
      const row = page.getByTestId("cart-items").locator("li").first();
      await expect(row.getByTestId("cart-limit-note")).toBeVisible();
      await shot(row, `limit-cart.${tag}`);

      // Sign-in (17.13.0): the server's countdown, attempts left, the locked code, a 429.
      await page.evaluate(() => window.sessionStorage.clear());
      await page.goto(`${prefix}/login`);
      await page.getByTestId("auth-phone").fill("07701234567");
      await page.getByTestId("auth-send-otp").click();
      await expect(page.getByTestId("auth-cooldown")).toBeVisible();
      const form = page.locator("form").filter({ has: page.getByTestId("auth-code") });
      await shot(form, `otp-countdown.${tag}`);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.getByTestId("auth-code").fill("000000");
        await page.getByTestId("auth-verify").click();
        // Each refusal clears the field; wait for it before the next try.
        await expect(page.getByTestId("auth-code")).toHaveValue("");
        await expect(page.getByTestId("auth-verify")).toBeEnabled().catch(() => undefined);
      }
      await expect(page.getByTestId("auth-code")).toHaveAttribute("aria-invalid", "true");
      await shot(form, `otp-attempts.${tag}`);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.getByTestId("auth-code").fill("000000");
        await page.getByTestId("auth-verify").click();
        // Each refusal clears the field; wait for it before the next try.
        await expect(page.getByTestId("auth-code")).toHaveValue("");
        await expect(page.getByTestId("auth-verify")).toBeEnabled().catch(() => undefined);
      }
      await expect(page.getByTestId("auth-resend")).toHaveAttribute("data-exhausted", "true");
      await shot(form, `otp-locked.${tag}`);

      await page.evaluate(() => window.sessionStorage.clear());
      await page.goto(`${prefix}/login`);
      await expect(page.getByTestId("auth-phone")).toHaveValue("");
      await page.getByTestId("auth-phone").fill("07700000429");
      await page.getByTestId("auth-send-otp").click();
      await expect(page.getByTestId("auth-send-cooldown")).toBeVisible();
      await shot(page.locator("form").filter({ has: page.getByTestId("auth-phone") }), `otp-resend-too-soon.${tag}`);
    });
  }
}
