import { expect, test, type Page } from "@playwright/test";

/**
 * The legal and support pages and the public account deletion page, against
 * the mock-backed dev server (the store is public here; the closed store is
 * covered on the production build in tests/prod/coming-soon.spec.ts).
 *
 * DELETE /me/account is mocked in src/lib/mock-account.ts: the
 * `shubayr.mock.account-deletion` sessionStorage key picks the answer —
 * "none" deletes, a list of codes refuses for those reasons.
 */

const PHONE = "07701234567";
const OTP = "123456";
const SESSION_KEY = "shubayr.session.v1";
const DELETION_KEY = "shubayr.mock.account-deletion";

const PAGES = [
  { path: "/privacy", testId: "legal-privacy", ar: "سياسة الخصوصية", en: "Privacy policy" },
  { path: "/terms", testId: "legal-terms", ar: "شروط الاستخدام", en: "Terms of use" },
  { path: "/returns", testId: "legal-returns", ar: "سياسة الإرجاع والاسترداد", en: "Returns & refunds" },
  { path: "/support", testId: "support-page", ar: "اتصل بنا", en: "Contact us" },
  { path: "/account/delete", testId: "delete-account-page", ar: "حذف الحساب", en: "Delete your account" },
] as const;

for (const { path, testId, ar, en } of PAGES) {
  test(`${path} renders in Arabic (RTL) and English (LTR)`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar);
    await expect(page).toHaveTitle(new RegExp(ar));

    await page.goto(`/en${path}`);
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en);
    await expect(page).toHaveTitle(new RegExp(en.replace(/[&]/g, "\\$&")));
  });
}

test("the privacy policy covers what is collected, retention after deletion and no selling", async ({ page }) => {
  await page.goto("/en/privacy");
  const policy = page.getByTestId("legal-privacy");
  for (const text of [
    "mobile phone number",
    "Delivery addresses",
    "Your orders and returns",
    "Device notification tokens",
    "We never sell your data",
    "Order, return, payment and accounting records are kept",
    "privacy@",
  ]) {
    await expect(policy, text).toContainText(text);
  }
  await expect(policy).toContainText("/en/account/delete");
  await expect(page.getByTestId("legal-updated")).toContainText("Last updated");

  await page.goto("/privacy");
  await expect(page.getByTestId("legal-privacy")).toContainText("لا نبيع بياناتك");
  await expect(page.getByTestId("legal-privacy")).toContainText("رموز إشعارات الجهاز");
});

test("the terms cover phone confirmation, cash on delivery, delivery fees, prices and automatic discounts", async ({ page }) => {
  await page.goto("/en/terms");
  const terms = page.getByTestId("legal-terms");
  for (const text of ["confirm it with a phone call", "cash on delivery", "depends on the governorate", "Prices and stock can change", "automatic discount"]) {
    await expect(terms, text).toContainText(text);
  }
});

test("the support page lists the contacts and hours from the store config", async ({ page }) => {
  await page.goto("/support");
  await expect(page.getByTestId("support-phone")).toHaveAttribute("href", /^tel:\+964/);
  await expect(page.getByTestId("support-whatsapp")).toHaveAttribute("href", /^https:\/\/wa\.me\/964\d+$/);
  await expect(page.getByTestId("support-email")).toHaveAttribute("href", /^mailto:.+@/);
  await expect(page.getByTestId("support-hours")).toContainText("بتوقيت بغداد");
  await page.goto("/en/support");
  await expect(page.getByTestId("support-hours")).toContainText("Baghdad time");
});

test("every page's footer links to the legal, support and account deletion pages", async ({ page }) => {
  for (const path of ["/", "/categories", "/cart", "/privacy"]) {
    await page.goto(path);
    const footer = page.getByTestId("site-footer");
    for (const [key, href] of [
      ["privacy", "/privacy"],
      ["terms", "/terms"],
      ["returns", "/returns"],
      ["support", "/support"],
      ["deleteAccount", "/account/delete"],
    ] as const) {
      await expect(footer.getByTestId(`policy-link-${key}`), `${path} → ${key}`).toHaveAttribute("href", href);
    }
  }
  await page.goto("/en");
  await expect(page.getByTestId("site-footer").getByTestId("policy-link-privacy")).toHaveAttribute("href", "/en/privacy");
  await page.getByTestId("site-footer").getByTestId("policy-link-terms").click();
  await expect(page).toHaveURL(/\/en\/terms$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of use");
});

test("account deletion, signed out: what is deleted and kept, how to sign in, and the support contact", async ({ page }) => {
  await page.goto("/account/delete");
  // Not bounced to /login: the page is public.
  await expect(page).toHaveURL(/\/account\/delete$/);
  await expect(page.getByTestId("delete-what-deleted")).toContainText("رقم هاتفك");
  await expect(page.getByTestId("delete-what-kept")).toContainText("سجلات الطلبات");
  await expect(page.getByTestId("delete-before")).toContainText("طلباتك المفتوحة");
  const signedOut = page.getByTestId("delete-signed-out");
  await expect(signedOut).toContainText("سجّل الدخول لحذف حسابك");
  await expect(signedOut.getByTestId("auth-phone")).toBeVisible();
  await expect(page.getByTestId("delete-support").locator('a[href^="tel:"]')).toBeVisible();
  await expect(page.getByTestId("delete-support").locator('a[href^="mailto:"]')).toBeVisible();
  await expect(page.getByTestId("delete-confirm")).toHaveCount(0);

  await page.goto("/en/account/delete");
  await expect(page.getByTestId("delete-signed-out")).toContainText("Sign in to delete your account");
  await expect(page.getByTestId("delete-what-kept")).toContainText("cannot be erased");
});

async function signInHere(page: Page, deletion: string | null) {
  await page.addInitScript(
    ([key, value]) => {
      if (value === null) window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, value);
    },
    [DELETION_KEY, deletion] as const,
  );
  await page.goto("/account/delete");
  await page.getByTestId("auth-phone").fill(PHONE);
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  // Signed in on the same page: the form gives way to the confirm step.
  await expect(page.getByTestId("delete-confirm")).toBeVisible();
  await expect(page).toHaveURL(/\/account\/delete$/);
  await expect(page.getByTestId("delete-confirm")).toContainText(PHONE);
}

function storedSession(page: Page) {
  return page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY);
}

test("account deletion, signed in: confirm, deleted, signed out", async ({ page }) => {
  await signInHere(page, "none");
  const submit = page.getByTestId("delete-submit");
  // Nothing happens until the visitor confirms they understand.
  await expect(submit).toBeDisabled();
  await page.getByTestId("delete-understood").check();
  await submit.click();

  await expect(page.getByTestId("delete-done")).toBeVisible();
  await expect(page.getByTestId("delete-done")).toContainText("تم حذف حسابك");
  expect(await storedSession(page)).toBeNull();
  await expect(page.getByTestId("header-login")).toBeVisible();
});

for (const [code, arabic] of [
  ["OPEN_ORDERS", "طلب مفتوح"],
  ["PENDING_RETURNS", "طلب إرجاع"],
  ["UNSETTLED_AMOUNTS", "مبالغ لم تُسوَّ"],
] as const) {
  test(`account deletion refused: ${code} is explained and the visitor stays signed in`, async ({ page }) => {
    await signInHere(page, code);
    await page.getByTestId("delete-understood").check();
    await page.getByTestId("delete-submit").click();

    const blocked = page.getByTestId("delete-blocked");
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText("لا يمكن حذف حسابك الآن");
    await expect(blocked.getByTestId(`delete-reason-${code}`)).toContainText(arabic);
    await expect(blocked.locator("li")).toHaveCount(1);
    await expect(page.getByTestId("delete-done")).toHaveCount(0);
    expect(await storedSession(page)).not.toBeNull();
    // Each reason points where to finish it.
    const target = { OPEN_ORDERS: "/account/orders", PENDING_RETURNS: "/account/returns", UNSETTLED_AMOUNTS: "/support" }[code];
    await expect(blocked.getByTestId(`delete-reason-${code}`).locator("a")).toHaveAttribute("href", target);
  });
}

test("account deletion refused for several reasons lists each, with the counts", async ({ page }) => {
  // Unset: the fixtures' own open orders and pending return.
  await signInHere(page, null);
  await page.getByTestId("delete-understood").check();
  await page.getByTestId("delete-submit").click();
  const blocked = page.getByTestId("delete-blocked");
  await expect(blocked.getByTestId("delete-reason-OPEN_ORDERS")).toBeVisible();
  await expect(blocked.getByTestId("delete-reason-PENDING_RETURNS")).toBeVisible();
  await expect(blocked.getByTestId("delete-reason-UNSETTLED_AMOUNTS")).toHaveCount(0);
  await page.goto("/en/account/delete");
  await page.getByTestId("delete-understood").check();
  await page.getByTestId("delete-submit").click();
  await expect(page.getByTestId("delete-reason-OPEN_ORDERS")).toContainText(/You have (one|\d+) open order/);
  await expect(page.getByTestId("delete-reason-PENDING_RETURNS")).toContainText(/return/);
});

test("the refusal counts come from the API's structured details, not its English message", async ({ page }) => {
  // The mock's messages carry no number at all; only `details` has the counts.
  await signInHere(page, "OPEN_ORDERS:3,PENDING_RETURNS:2,UNSETTLED_AMOUNTS:1");
  await page.getByTestId("delete-understood").check();
  await page.getByTestId("delete-submit").click();
  const blocked = page.getByTestId("delete-blocked");
  await expect(blocked.getByTestId("delete-reason-OPEN_ORDERS")).toContainText("لديك 3 طلبات مفتوحة");
  await expect(blocked.getByTestId("delete-reason-PENDING_RETURNS")).toContainText("لديك طلبا إرجاع قيد المعالجة");
  await expect(blocked.getByTestId("delete-reason-UNSETTLED_AMOUNTS")).toBeVisible();
  await expect(blocked.locator("li")).toHaveCount(3);
});

test("without details (an older API), the counts are still read from the messages", async ({ page }) => {
  await signInHere(page, "legacy:OPEN_ORDERS:2");
  await page.getByTestId("delete-understood").check();
  await page.getByTestId("delete-submit").click();
  const blocked = page.getByTestId("delete-blocked");
  await expect(blocked.getByTestId("delete-reason-OPEN_ORDERS")).toContainText("لديك طلبان مفتوحان");
  await expect(blocked.locator("li")).toHaveCount(1);
});
