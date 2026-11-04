import { expect, test } from "@playwright/test";
import { CUSTOMER_E164, CUSTOMER_LOCAL, OTP, requireLiveApi, sendOtpFromPageRespectingCooldown } from "./live-api";

/**
 * PR W2 against the real API (DEV_OTP): this worker's customer signs in with
 * the number as iOS autofill and an Arabic keyboard deliver it — +964 in
 * Arabic-Indic digits, wrapped in invisible bidi marks — and the code typed in
 * Arabic-Indic digits. The API receives plain E.164 and Latin digits.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "the live W2 test");
});

const ARABIC = "٠١٢٣٤٥٦٧٨٩";
const arabicDigits = (latin: string) => latin.replace(/\d/g, (digit) => ARABIC[Number(digit)]);

test("an Arabic-digit, bidi-wrapped +964 number and an Arabic-digit code sign in", async ({ page }) => {
  // "+964 7xx xxx xxxx" in Arabic-Indic digits, between LRE…PDF with an LRM.
  const national = CUSTOMER_LOCAL.slice(1);
  const typed = `‪‎+${arabicDigits(`964 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`)}‬`;

  await page.goto("/login");
  const phone = page.locator('[data-testid="auth-phone"]:visible');
  await phone.fill(typed);
  await expect(phone).not.toHaveValue(/[٠-٩‪-‮‎]/);

  const sent = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/auth/request-otp"));
  await sendOtpFromPageRespectingCooldown(page);
  expect((await sent).postDataJSON()).toEqual({ phone: CUSTOMER_E164 });
  await expect(page.locator('[data-testid="auth-code-phone"]:visible')).toHaveText(CUSTOMER_LOCAL);

  const code = page.locator('[data-testid="auth-code"]:visible');
  await code.fill(`‪${arabicDigits(OTP)}‬`);
  await expect(code).toHaveValue(OTP);
  const [verify] = await Promise.all([
    page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/auth/verify-otp")),
    page.locator('[data-testid="auth-verify"]:visible').click(),
  ]);
  expect(verify.postDataJSON()).toMatchObject({ phone: CUSTOMER_E164, code: OTP });
  await page.waitForURL((url) => !url.pathname.includes("/login"));
});
