import { expect, test, type Page } from "@playwright/test";
import ar from "../src/messages/ar.json";

/**
 * PR W2 in the browser (mock-backed): a number as iOS autofill delivers it —
 * wrapped in invisible bidi marks — or typed in Arabic-Indic / Persian digits
 * signs in, goes through checkout and saves on an address; the field shows
 * Latin digits while typing and the national 07… form once left; an OTP code
 * in Arabic digits verifies.
 */

const LRE = "‪";
const PDF = "‬";
const LRM = "‎";
const NBSP = " ";
/** The mock backend accepts this code for any valid phone number. */
const OTP_ARABIC = "١٢٣٤٥٦";

const phoneField = (page: Page) => page.locator('[data-testid="auth-phone"]:visible');
const codeField = (page: Page) => page.locator('[data-testid="auth-code"]:visible');

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });
});

test.describe("sign-in", () => {
  test("a bidi-wrapped +964 number (iOS autofill) and an Arabic-digit code sign in", async ({ page }) => {
    await page.goto("/login");
    const phone = phoneField(page);
    await expect(phone).toHaveAttribute("type", "tel");
    await expect(phone).toHaveAttribute("inputmode", "tel");
    await expect(phone).toHaveAttribute("autocomplete", "tel");
    await expect(phone).toHaveAttribute("dir", "ltr");

    await phone.fill(`${LRE}+964${NBSP}771 728 1373${PDF}`);
    // The invisible marks are gone at once; the grouping stays while typing.
    await expect(phone).toHaveValue(`+964${NBSP}771 728 1373`);
    expect(await phone.inputValue()).not.toMatch(/[‪-‮‎‏]/);
    await phone.blur();
    await expect(phone).toHaveValue("07717281373");

    await page.locator('[data-testid="auth-send-otp"]:visible').click();
    await expect(page.locator('[data-testid="auth-code-phone"]:visible')).toHaveText("07717281373");
    await codeField(page).fill(OTP_ARABIC);
    await expect(codeField(page)).toHaveValue("123456");
    await page.locator('[data-testid="auth-verify"]:visible').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"));
  });

  test("Arabic-Indic digits typed key by key show as Latin digits, the caret where it was", async ({ page }) => {
    await page.goto("/login");
    const phone = phoneField(page);
    await phone.click();
    await page.keyboard.type("٠٧٧١ ١٣٧٣");
    await expect(phone).toHaveValue("0771 1373");
    // Back into the middle: the rest of the number goes where the caret is.
    await phone.evaluate((input: HTMLInputElement) => input.setSelectionRange(5, 5));
    await page.keyboard.type(`${LRM}٧٢٨ `);
    await expect(phone).toHaveValue("0771 728 1373");
    expect(await phone.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(9);

    await page.locator('[data-testid="auth-send-otp"]:visible').click();
    await expect(page.locator('[data-testid="auth-code-phone"]:visible')).toHaveText("07717281373");
  });

  test("Persian digits, 00964, sign in; a code pasted with marks and a space verifies", async ({ page }) => {
    await page.goto("/en/login");
    await phoneField(page).fill("۰۰۹۶۴ ۷۷۱ ۷۲۸ ۱۳۷۳");
    await expect(phoneField(page)).toHaveValue("00964 771 728 1373");
    await page.locator('[data-testid="auth-send-otp"]:visible').click();
    await expect(page.locator('[data-testid="auth-code-phone"]:visible')).toHaveText("07717281373");
    await codeField(page).fill(`${LRE}١٢٣ ٤٥٦${PDF}`);
    await expect(codeField(page)).toHaveValue("123456");
    await page.locator('[data-testid="auth-verify"]:visible').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"));
  });

  test("still refused: not an Iraqi mobile number", async ({ page }) => {
    await page.goto("/login");
    for (const typed of ["٠٨٧١٧٢٨١٣٧٣", "0771728137", "+447700900123"]) {
      await phoneField(page).fill(typed);
      await page.locator('[data-testid="auth-send-otp"]:visible').click();
      await expect(page.getByText(ar.auth.errPhone)).toBeVisible();
      await expect(codeField(page)).toHaveCount(0);
    }
  });
});

test.describe("checkout address", () => {
  test("an Arabic-digit, bidi-wrapped number is accepted and seeds the sign-in step", async ({ page }) => {
    await page.goto("/product/p1");
    await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
    await page.goto("/checkout");
    await page.getByTestId("address-governorate").selectOption({ index: 1 });
    await page.getByTestId("address-name").fill("أحمد علي");
    const phone = page.getByTestId("address-phone");
    await phone.fill(`${LRE}٠٧٧١ ٧٢٨ ١٣٧٣${PDF}`);
    await expect(phone).toHaveValue("0771 728 1373");
    await page.getByTestId("address-city").fill("واسط");
    await expect(phone).toHaveValue("07717281373");
    await page.getByTestId("address-area").fill("حي الزهراء");
    await page.getByTestId("address-street").fill("شارع 14");
    await page.getByTestId("address-submit").click();
    await expect(page.getByText("07717281373")).toBeVisible();
    // Placing the order asks the guest to sign in, with the number they gave.
    await page.getByTestId("place-order").click();
    await expect(phoneField(page)).toHaveValue("07717281373");
  });

  test("a bare 10-digit number is taken as Iraqi, and a wrong one is still refused", async ({ page }) => {
    await page.goto("/product/p1");
    await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
    await page.goto("/checkout");
    const phone = page.getByTestId("address-phone");
    await phone.fill("٠٨٧١٧٢٨١٣٧٣");
    await page.getByTestId("address-submit").click();
    await expect(page.locator('[id$="-phone-error"]')).toBeVisible();
    await phone.fill("7717281373");
    await phone.blur();
    await expect(phone).toHaveValue("07717281373");
  });
});

test.describe("address book", () => {
  test("a number in Persian digits with a mark saves as +964…", async ({ page }) => {
    await page.goto("/login");
    await phoneField(page).fill("07701234567");
    await page.locator('[data-testid="auth-send-otp"]:visible').click();
    await codeField(page).fill("123456");
    await page.locator('[data-testid="auth-verify"]:visible').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"));
    await page.goto("/account/addresses");

    await page.getByTestId("address-add").click();
    await page.getByTestId("address-governorate").selectOption({ index: 1 });
    await page.getByTestId("address-label").fill("بيت الأهل");
    await page.getByTestId("address-city").fill("بابل");
    await page.getByTestId("address-area").fill("الحلة");
    await page.getByTestId("address-street").fill("شارع 40");
    const phone = page.getByTestId("address-phone");
    await phone.fill(`${LRM}۰۷۷۱ ۷۲۸ ۱۳۷۳`);
    await expect(phone).toHaveValue("0771 728 1373");
    await page.getByTestId("address-save").click();

    const card = page.getByTestId("address-list").locator("> li").filter({ hasText: "بيت الأهل" });
    await expect(card).toHaveCount(1);
    await card.getByTestId("address-edit").click();
    // Stored as the API takes it.
    await expect(page.getByTestId("address-phone")).toHaveValue("+9647717281373");
  });
});
