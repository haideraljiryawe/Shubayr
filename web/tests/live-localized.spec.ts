import { expect, test, type Page } from "@playwright/test";
import ar from "../src/messages/ar.json";
import en from "../src/messages/en.json";
import { API, CUSTOMER_LOCAL, OTP, ensureIdentity, requireLiveApi } from "./live-api";

/**
 * NOTE-012 against the real API: sign-in feedback in the shopper's language
 * — never the API's English text — and a language switch half-way through
 * signing in keeps the step, the number and the return destination.
 *
 * This spec deliberately triggers the resend cooldown, so it speaks from its
 * own documentation-range address when the API trusts this runner as a proxy.
 */

const ADDRESS = "198.51.100.200";
test.use({ extraHTTPHeaders: { "X-Forwarded-For": ADDRESS } });
test.describe.configure({ mode: "serial" });

const visible = (page: Page, id: string) => page.locator(`[data-testid="${id}"]:visible`);

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "the live localized-feedback tests");
});

async function primeResendCooldown(page: Page, phone: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.request.post(`${API}/auth/request-otp`, {
      data: { phone },
    });
    if (response.ok()) return;
    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
      retry_after_seconds?: number;
    };
    expect(body.code).toBe("OTP_RESEND_TOO_SOON");
    await page.waitForTimeout(
      Math.max(1, Number(body.retry_after_seconds ?? 1)) * 1000 + 100,
    );
  }
  throw new Error("OTP resend cooldown did not clear");
}

test("switching to English mid-sign-in keeps the code step and the return destination", async ({ page }) => {
  await ensureIdentity(page.request, `+964${CUSTOMER_LOCAL.slice(1)}`);
  await page.goto("/login?next=%2Faccount%2Forders");
  await visible(page, "auth-phone").fill(CUSTOMER_LOCAL);
  await visible(page, "auth-send-otp").click();
  await expect(visible(page, "auth-code")).toBeVisible();

  await page.getByRole("button", { name: ar.header.changeLanguage }).first().click();
  await expect(page).toHaveURL(/\/en\/login\?next=%2Faccount%2Forders$/);
  await expect(page.getByRole("heading", { name: en.auth.codeTitle })).toBeVisible();
  await expect(visible(page, "auth-code-phone")).toHaveText(CUSTOMER_LOCAL);

  // A wrong code is worded in English, not the API's text.
  await visible(page, "auth-code").fill(OTP === "999999" ? "000001" : "999999");
  await visible(page, "auth-verify").click();
  await expect(page.getByText(en.auth.errCode)).toBeVisible();

  await visible(page, "auth-code").fill(OTP);
  await visible(page, "auth-verify").click();
  await expect(page).toHaveURL(/\/en\/account\/orders$/);
});

test("the OTP rate limit is worded in Arabic, then in English after a switch", async ({ page }) => {
  const phone = "07709990017";
  await page.goto("/login");
  await visible(page, "auth-phone").fill(phone);
  await primeResendCooldown(page, `+964${phone.slice(1)}`);
  await visible(page, "auth-send-otp").click();
  await expect(page.getByText(ar.auth.errTooMany)).toBeVisible();

  await page.getByRole("button", { name: ar.header.changeLanguage }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(visible(page, "auth-phone")).toHaveValue(phone);
  await primeResendCooldown(page, `+964${phone.slice(1)}`);
  await visible(page, "auth-send-otp").click();
  await expect(page.getByText(en.auth.errTooMany)).toBeVisible();
  await expect(page.getByText("ThrottlerException")).toHaveCount(0);
});

test("store titles follow the language", async ({ page }) => {
  await page.goto("/login");
  const arabic = await page.title();
  await page.goto("/en/login");
  await expect(page).not.toHaveTitle(arabic);
  await expect(page).toHaveTitle(/Shubayr/);
});
