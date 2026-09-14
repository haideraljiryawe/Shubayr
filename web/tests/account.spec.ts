import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/**
 * Phone-OTP sign-in and the account spine, against the mock-backed dev server.
 *
 * Fixtures live in src/lib/mock-account.ts: the customer is «أحمد علي» on
 * 07701234567, the accepted code is 123456, and the account starts with two
 * addresses and three orders. Mock writes live in the page's JS context, so a
 * full reload resets them — tests that create data assert before reloading.
 */

const PHONE = "07701234567";
const OTP = "123456";
const SESSION_KEY = "shubayr.session.v1";

async function signIn(page: Page, { from = "/login" } = {}) {
  await page.goto(from);
  await page.getByTestId("auth-phone").fill(PHONE);
  await page.getByTestId("auth-send-otp").click();
  await expect(page.getByTestId("auth-code")).toBeVisible();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  // Verification is a round-trip: wait for the signed-in header before acting,
  // or the session may not be stored yet.
  await expect(page.getByTestId("header-account")).toBeVisible();
}

function storedSession(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? "null"),
    SESSION_KEY,
  ) as Promise<{ access_token: string; refresh_token: string } | null>;
}

test("signing in with a one-time code lands on the account", async ({ page }) => {
  await signIn(page);

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("account-phone")).toHaveText(PHONE);
  await expect(page.getByText("أحمد علي").first()).toBeVisible();

  // The header swaps the sign-in link for the account entry.
  await expect(page.getByTestId("header-account")).toBeVisible();
  await expect(page.getByTestId("header-login")).toHaveCount(0);

  // The session survives a reload.
  await page.reload();
  await expect(page.getByTestId("account-phone")).toHaveText(PHONE);
});

test("a wrong code is rejected and the flow stays on the code step", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByTestId("auth-phone").fill(PHONE);
  await page.getByTestId("auth-send-otp").click();

  await page.getByTestId("auth-code").fill("000000");
  await page.getByTestId("auth-verify").click();

  await expect(page.getByText("الرمز غير صحيح أو منتهي الصلاحية")).toBeVisible();
  await expect(page.getByTestId("auth-code")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // The right code still works afterwards.
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  await expect(page).toHaveURL(/\/account$/);
});

test("resending is held behind a cooldown that counts down", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("auth-phone").fill(PHONE);
  await page.getByTestId("auth-send-otp").click();

  const resend = page.getByTestId("auth-resend");
  await expect(resend).toBeDisabled();

  const cooldown = page.getByTestId("auth-cooldown");
  await expect(cooldown).toBeVisible();
  const first = Number((await cooldown.textContent())?.match(/\d+/)?.[0]);
  expect(first).toBeGreaterThan(0);

  // It ticks down rather than sitting still.
  await expect
    .poll(async () =>
      Number((await cooldown.textContent())?.match(/\d+/)?.[0] ?? first),
    )
    .toBeLessThan(first);
  await expect(resend).toBeDisabled();
});

test("the account pages are closed to signed-out visitors", async ({ page }) => {
  await page.goto("/account/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Forders/);

  // Signing in returns them to where they were headed.
  await page.getByTestId("auth-phone").fill(PHONE);
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  await expect(page).toHaveURL(/\/account\/orders$/);
});

test("an expired access token is refreshed and the request retried", async ({
  page,
}) => {
  await signIn(page);
  const before = await storedSession(page);
  expect(before?.access_token).toBeTruthy();

  // Expire the access token the way a clock would, leaving the refresh token
  // intact. The next authenticated call must 401, refresh, and retry.
  await page.evaluate(
    ([key, session]) => {
      const parsed = JSON.parse(session as string);
      parsed.access_token = "mock-access.1.u-1";
      window.localStorage.setItem(key as string, JSON.stringify(parsed));
    },
    [SESSION_KEY, JSON.stringify(before)] as const,
  );

  await page.goto("/account/orders");

  // The list rendered, so the retry succeeded...
  await expect(page.getByTestId("order-list")).toBeVisible();
  // ...and the stored pair was replaced rather than reused.
  const after = await storedSession(page);
  expect(after?.access_token).not.toBe("mock-access.1.u-1");
  expect(after?.access_token).not.toBe(before?.access_token);
});

test("a refresh that fails signs the visitor out to the login page", async ({
  page,
}) => {
  await signIn(page);
  const before = await storedSession(page);

  // Both tokens unusable: there is nothing left to refresh with.
  await page.evaluate(
    ([key, session]) => {
      const parsed = JSON.parse(session as string);
      parsed.access_token = "mock-access.1.u-1";
      parsed.refresh_token = "not-a-refresh-token";
      window.localStorage.setItem(key as string, JSON.stringify(parsed));
    },
    [SESSION_KEY, JSON.stringify(before)] as const,
  );

  await page.goto("/account/orders");
  await expect(page).toHaveURL(/\/login/);
  expect(await storedSession(page)).toBeNull();
});

test("orders list and the tracking timeline render", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("account-link-orders").click();

  const rows = page.getByTestId("order-row");
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId("order-number").first()).toHaveText("SB-1039");
  await expect(page.getByTestId("order-status").first()).toHaveText(
    "في الطريق إليك",
  );

  await rows.first().click();
  await expect(page).toHaveURL(/\/account\/orders\/sb-1039$/);

  // Items, payment, totals and the timeline.
  await expect(page.getByText("سماعات لاسلكية")).toBeVisible();
  await expect(page.getByText("الدفع عند الاستلام")).toBeVisible();
  await expect(page.getByTestId("order-total")).toHaveText("$212");

  const tracking = page.getByTestId("order-tracking");
  await expect(tracking).toBeVisible();
  // Newest first: an out-for-delivery order has reached step four.
  await expect(tracking.locator("li")).toHaveCount(4);
  await expect(tracking.locator("li").first()).toContainText("في الطريق إليك");
  await expect(tracking.locator("li").last()).toContainText("قيد الانتظار");
});

test("addresses can be added, edited, defaulted and deleted", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("account-link-addresses").click();

  const cards = page.getByTestId("address-list").locator("> li");
  await expect(cards).toHaveCount(2);

  // Create — and validation refuses an empty form first.
  await page.getByTestId("address-add").click();
  await page.getByTestId("address-save").click();
  await expect(page.getByText("يرجى تصحيح الحقول المميّزة أدناه.")).toBeVisible();

  await page.getByTestId("address-label").fill("بيت الأهل");
  await page.getByTestId("address-city").fill("بابل");
  await page.getByTestId("address-area").fill("الحلة");
  await page.getByTestId("address-street").fill("شارع 40");
  await page.getByTestId("address-save").click();

  await expect(cards).toHaveCount(3);
  await expect(page.getByText("بيت الأهل")).toBeVisible();

  // Edit.
  const added = cards.filter({ hasText: "بيت الأهل" });
  await added.getByTestId("address-edit").click();
  await page.getByTestId("address-street").fill("شارع 41");
  await page.getByTestId("address-save").click();
  await expect(page.getByText("شارع 41")).toBeVisible();

  // Promote it to default — the badge moves with it.
  await added.getByTestId("address-set-default").click();
  await expect(added.getByTestId("address-default-badge")).toBeVisible();
  await expect(page.getByTestId("address-default-badge")).toHaveCount(1);

  // Delete, behind its confirmation.
  await added.getByTestId("address-delete").click();
  await page.getByTestId("address-delete-confirm").click();
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("بيت الأهل")).toHaveCount(0);
});

test("a signed-in checkout uses a saved address instead of the guest form", async ({
  page,
}) => {
  await signIn(page);

  await page.goto("/product/p1");
  await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
  await page.goto("/checkout");

  // The saved addresses replace the guest form, with the default preselected.
  const saved = page.getByTestId("saved-addresses");
  await expect(saved).toBeVisible();
  await expect(page.getByTestId("address-name")).toHaveCount(0);
  await expect(saved.locator("input:checked")).toHaveCount(1);

  await page.getByTestId("address-submit").click();

  // Review shows that address, and no sign-in step interrupts the order.
  await expect(page.getByText("المنزل")).toBeVisible();
  await page.getByTestId("place-order").click();

  await expect(page.getByTestId("order-confirmation")).toBeVisible();
  await expect(page.getByTestId("order-number")).toHaveText(/^SB-\d+$/);
});

test("a signed-in shopper can still type a new address", async ({ page }) => {
  await signIn(page);
  await page.goto("/product/p1");
  await page.locator('[data-testid="pdp-add-to-cart"]:visible').click();
  await page.goto("/checkout");

  await page.getByTestId("use-new-address").click();

  // The form is prefilled from the profile rather than starting blank.
  await expect(page.getByTestId("address-name")).toHaveValue("أحمد علي");
  await expect(page.getByTestId("address-phone")).toHaveValue(PHONE);

  await page.getByTestId("address-city").fill("النجف");
  await page.getByTestId("address-area").fill("حي السلام");
  await page.getByTestId("address-street").fill("شارع 9");
  await page.getByTestId("address-submit").click();

  await expect(page.getByText("النجف — حي السلام — شارع 9")).toBeVisible();
});

test("the profile can be edited", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("account-link-profile").click();

  await expect(page.getByTestId("profile-name")).toHaveValue("أحمد علي");
  await page.getByTestId("profile-name").fill("");
  await page.getByTestId("profile-save").click();
  await expect(page.getByText("الاسم مطلوب")).toBeVisible();

  await page.getByTestId("profile-name").fill("أحمد علي الجريّاوي");
  await page.getByTestId("profile-email").fill("not-an-email");
  await page.getByTestId("profile-save").click();
  await expect(page.getByText("أدخل بريدًا إلكترونيًا صحيحًا")).toBeVisible();

  await page.getByTestId("profile-email").fill("ahmed@example.com");
  await page.getByTestId("profile-save").click();

  // The account header follows the edit.
  await page.getByTestId("account-signout").waitFor();
  await expect(page.getByText("أحمد علي الجريّاوي").first()).toBeVisible();
});

test("signing out clears the session", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("account-signout").click();

  await expect(page).toHaveURL(/\/$|\/ar$/);
  await expect(page.getByTestId("header-login")).toBeVisible();
  expect(await storedSession(page)).toBeNull();

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

test("unbuilt account sections land on a placeholder, not a dead link", async ({
  page,
}) => {
  await signIn(page);
  await page.getByTestId("account-link-wishlist").click();
  await expect(page.getByTestId("account-soon")).toBeVisible();

  // An invented section is still a real 404.
  const response = await page.goto("/account/not-a-section");
  expect(response?.status()).toBe(404);
});

for (const [name, width, height] of [
  ["mobile", 390, 844],
  ["desktop", 1440, 1000],
] as const) {
  test(`account screenshots: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mkdir("docs/screenshots", { recursive: true });

    const shoot = async (screen: string) => {
      await expect(
        page.locator('div[role="status"][aria-live="polite"]'),
      ).toBeEmpty();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `docs/screenshots/${screen}-${name}.png`,
        fullPage: true,
        caret: "initial",
        style: "nextjs-portal { display: none !important; }",
      });
    };

    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByTestId("auth-phone").fill(PHONE);
    await shoot("login-phone");

    await page.getByTestId("auth-send-otp").click();
    await expect(page.getByTestId("auth-code")).toBeVisible();
    await page.getByTestId("auth-code").fill(OTP);
    await shoot("login-otp");

    await page.getByTestId("auth-verify").click();
    await expect(page.getByTestId("account-menu")).toBeVisible();
    await shoot("account");

    await page.goto("/account/orders/sb-1039");
    await expect(page.getByTestId("order-tracking")).toBeVisible();
    await shoot("order-detail");

    await page.goto("/account/addresses");
    await expect(page.getByTestId("address-list")).toBeVisible();
    await shoot("addresses");
  });
}
