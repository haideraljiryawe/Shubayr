import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { API, awaitQuota, bearer, requireLiveApi, signIn, staffToken } from "./live-api";

/**
 * The store's legal, contact and policy details come from the API (GET
 * /settings, contract 17.2), as the owner saves them in the Web Admin: the
 * contact page, the policies, the footer and the account's help all show
 * this run's values, a cleared field (WhatsApp) is simply not listed, and
 * the returns policy uses the API's return window and refund days.
 *
 * The store caches the settings read (STORE_CACHE_SHARED_SECONDS, 60 s), so
 * each check reloads until the new values are served.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "the live store-info spec");
  await awaitQuota(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PHONE = `+96477${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const VALUES = {
  store_legal_name_ar: `شركة الاختبار ${run}`,
  store_legal_name_en: `Live Test Trading ${run}`,
  store_address_ar: "شارع الرشيد، بغداد",
  store_address_en: "Al-Rasheed Street, Baghdad",
  support_phone: PHONE,
  support_whatsapp: null,
  support_email: `help-${run}@shubayr.test`,
  privacy_email: `privacy-${run}@shubayr.test`,
  support_hours_ar: `كل يوم ${run}`,
  support_hours_en: `Every day ${run}`,
  refund_days: "3",
  policy_effective_date: "2026-10-01",
};

async function saveStoreInfo(request: APIRequestContext): Promise<number> {
  const saved = await request.put(`${API}/admin/settings`, {
    headers: bearer(await staffToken(request)),
    data: { settings: VALUES },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const settings = await (await request.get(`${API}/settings`)).json();
  expect(settings.support_phone).toBe(PHONE);
  expect(settings.support_whatsapp).toBeNull();
  expect(settings.refund_days).toBe(3);
  // The return window is the server's own rule; this spec leaves it as it is.
  expect(Number.isInteger(settings.return_window_days)).toBe(true);
  return settings.return_window_days as number;
}

/** Reload until the store serves the new settings (its read cache is 60 s). */
async function untilServed(page: Page, path: string, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto(path);
    await check();
  }).toPass({ timeout: 80_000, intervals: [2_000, 5_000] });
}

test("the store's pages show the owner's store info from the API, and hide what is empty", async ({ page, request }) => {
  test.setTimeout(240_000);
  const window = await saveStoreInfo(request);

  await untilServed(page, "/en/support", async () => {
    await expect(page.getByTestId("support-phone")).toContainText(PHONE, { timeout: 1_000 });
  });
  await expect(page.getByTestId("support-phone")).toHaveAttribute("href", `tel:${PHONE}`);
  await expect(page.getByTestId("support-email")).toContainText(VALUES.support_email);
  await expect(page.getByTestId("support-privacy")).toContainText(VALUES.privacy_email);
  await expect(page.getByTestId("support-hours")).toContainText(VALUES.support_hours_en);
  await expect(page.getByTestId("support-address")).toContainText(`${VALUES.store_legal_name_en}, ${VALUES.store_address_en}`);
  // Cleared in the admin: not listed, and nothing invented in its place.
  await expect(page.getByTestId("support-whatsapp")).toHaveCount(0);

  await page.goto("/support");
  await expect(page.getByTestId("support-hours")).toContainText(VALUES.support_hours_ar);
  await expect(page.getByTestId("support-address")).toContainText(VALUES.store_legal_name_ar);

  // The returns policy: the API's return window and refund days.
  await page.goto("/en/returns");
  const returns = page.getByTestId("legal-returns");
  await expect(returns).toContainText(`within ${window === 1 ? "1 day" : `${window} days`} of receiving it`);
  await expect(returns).toContainText("within 3 days, in cash");
  await expect(returns).toContainText(`For help with a return: ${PHONE} or ${VALUES.support_email}.`);
  await page.goto("/returns");
  await expect(page.getByTestId("legal-returns")).toContainText("خلال 3 أيام نقدًا");

  await page.goto("/en/privacy");
  await expect(page.getByTestId("legal-privacy")).toContainText(VALUES.privacy_email);
  await expect(page.getByTestId("legal-privacy")).toContainText(VALUES.store_legal_name_en);
  await expect(page.getByTestId("legal-updated")).toContainText("1 October 2026");

  // The footer and the account's help use the same source.
  await expect(page.getByTestId("site-footer").getByTestId("footer-phone")).toHaveText(PHONE);
  await signIn(page, "/account/help");
  const channels = page.getByTestId("help-channels");
  await expect(channels.locator(`a[href="tel:${PHONE}"]`)).toBeVisible();
  await expect(channels.locator('a[href^="https://wa.me/"]')).toHaveCount(0);
  await expect(page.getByTestId("help-hours")).toContainText(VALUES.support_hours_ar);
});
