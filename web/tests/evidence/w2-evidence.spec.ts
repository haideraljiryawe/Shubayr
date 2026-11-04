import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator } from "@playwright/test";

/**
 * PR W2 review screenshots (see playwright.evidence.config.ts), phone width:
 * the phone field after Arabic-Indic digits are typed — Latin digits while
 * typing, the national 07… form once left — on sign-in and at checkout, and
 * the code field after an Arabic-digit code.
 *
 *   npx playwright test --config playwright.evidence.config.ts tests/evidence/w2-evidence.spec.ts
 */

test.describe.configure({ mode: "serial" });

const OUT = join(__dirname, "..", "..", "..", "docs", "reviews", "web-store-w2-evidence");
const LOCALES = [
  { locale: "ar", prefix: "" },
  { locale: "en", prefix: "/en" },
] as const;

async function shot(target: Locator, name: string) {
  const page = target.page();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await target.screenshot({ path: join(OUT, `${name}.png`), animations: "disabled", caret: "hide" });
      return;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(500);
    }
  }
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

for (const { locale, prefix } of LOCALES) {
  test(`W2 ${locale}.phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${prefix}/`);
    await page.evaluate(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });

    // Sign-in: typed in Arabic-Indic digits, key by key.
    await page.goto(`${prefix}/login`);
    const phone = page.locator('[data-testid="auth-phone"]:visible');
    const form = page.locator("form").filter({ has: phone });
    await phone.click();
    await page.keyboard.type("٠٧٧١ ٧٢٨ ١٣٧٣");
    await expect(phone).toHaveValue("0771 728 1373");
    await shot(form, `signin-typing-arabic-digits.${locale}.phone`);
    await phone.blur();
    await expect(phone).toHaveValue("07717281373");
    await shot(form, `signin-after-blur.${locale}.phone`);

    // The code, typed in Arabic-Indic digits.
    await page.locator('[data-testid="auth-send-otp"]:visible').click();
    const code = page.locator('[data-testid="auth-code"]:visible');
    await code.click();
    await page.keyboard.type("١٢٣٤٥٦");
    await expect(code).toHaveValue("123456");
    await shot(page.locator("form").filter({ has: code }), `signin-code-arabic-digits.${locale}.phone`);

    // Checkout: the recipient's number, Persian digits, bidi-wrapped (autofill).
    await page.evaluate(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
    });
    await page.goto(`${prefix}/product/p1`);
    await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
    await page.goto(`${prefix}/checkout`);
    const contact = page.getByTestId("address-phone");
    await contact.fill("‪۰۷۷۱ ۷۲۸ ۱۳۷۳‬");
    await expect(contact).toHaveValue("0771 728 1373");
    const field = contact.locator("xpath=ancestor::div[.//label][1]");
    await field.scrollIntoViewIfNeeded();
    await shot(field, `checkout-typing-persian-digits.${locale}.phone`);
    await contact.blur();
    await expect(contact).toHaveValue("07717281373");
    await shot(field, `checkout-after-blur.${locale}.phone`);
  });
}
