import { expect, test, type Page } from "@playwright/test";

/**
 * Work accounts on the storefront (API 6.0), against the mock-backed server.
 *
 * The mock mirrors the backend seed: 07700000005 signs in as a delivery agent
 * and 07700000008 as an order monitor. Either one gets the work-account
 * landing on every shopping page, with the shopping controls gone, and a way
 * to its own work pages (API 6.1). The filters, the live inbox and the
 * transitions are covered against a scripted API in work-pages.spec.ts and
 * inbox.spec.ts.
 */

const OTP = "123456";

async function signInAs(page: Page, phone: string) {
  await page.goto("/login");
  await page.getByTestId("auth-phone").fill(phone);
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  await expect(page.getByTestId("work-account-landing")).toBeVisible();
}

test("a delivery agent sees only the work-account landing", async ({
  page,
}) => {
  await signInAs(page, "07700000005");

  const landing = page.getByTestId("work-account-landing");
  await expect(landing).toHaveAttribute("data-role", "delivery_agent");
  await expect(page.getByTestId("work-account-role")).toHaveText("مندوب توصيل");

  // Shopping, the cart, the wishlist and customer addresses are all hidden.
  await expect(page.getByTestId("header-cart")).toHaveCount(0);
  await expect(page.getByTestId("header-account")).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveCount(0);

  for (const path of [
    "/",
    "/cart",
    "/checkout",
    "/account/wishlist",
    "/account/addresses",
    "/category/electronics",
  ]) {
    await page.goto(path);
    await expect(landing, path).toBeVisible();
    await expect(page.getByTestId("header-cart"), path).toHaveCount(0);
  }
});

test("an order monitor gets the same landing, in English too", async ({
  page,
}) => {
  await signInAs(page, "07700000008");
  await expect(page.getByTestId("work-account-landing")).toHaveAttribute(
    "data-role",
    "order_monitor",
  );

  await page.goto("/en/cart");
  await expect(page.getByTestId("work-account-role")).toHaveText(
    "Order monitor",
  );
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("signing out of a work account restores the store", async ({ page }) => {
  await signInAs(page, "07700000005");
  await page.getByTestId("work-account-signout").click();

  await expect(page.getByTestId("work-account-landing")).toHaveCount(0);
  await expect(page.getByTestId("header-login")).toBeVisible();
  await expect(page.getByTestId("header-cart")).toBeVisible();
});

test("a customer phone still shops normally", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("auth-phone").fill("07701234567");
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  await expect(page.getByTestId("header-account")).toBeVisible();
  await expect(page.getByTestId("header-cart")).toBeVisible();
  await expect(page.getByTestId("work-account-landing")).toHaveCount(0);
});

test("the landing leads an agent to their deliveries", async ({ page }) => {
  await signInAs(page, "07700000005");
  await page.getByTestId("work-account-home").click();
  await expect(page).toHaveURL(/\/deliveries$/);
  await expect(page.getByTestId("delivery-row")).toHaveCount(3);
  await expect(page.getByTestId("header-bell")).toBeVisible();
  await expect(page.getByTestId("header-cart")).toHaveCount(0);

  // Their pages, not the monitor's.
  await page.goto("/monitor/orders");
  await expect(page.getByTestId("work-forbidden")).toBeVisible();
});

test("the landing leads a monitor to the read-only order list", async ({
  page,
}) => {
  await signInAs(page, "07700000008");
  await page.getByTestId("work-account-home").click();
  await expect(page).toHaveURL(/\/monitor\/orders$/);
  await expect(page.getByTestId("monitor-order-row")).toHaveCount(20);
  await page.getByTestId("status-chip-pending").click();
  await expect(page.getByTestId("monitor-order-row")).toHaveCount(5);

  await page.goto("/deliveries");
  await expect(page.getByTestId("work-forbidden")).toBeVisible();
});

test("a customer has an inbox; the work pages are not theirs", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByTestId("auth-phone").fill("07701234567");
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  await expect(page.getByTestId("header-account")).toBeVisible();
  await expect(page.getByTestId("bell-badge")).toHaveText("2");

  await page.getByTestId("header-bell").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(3);
  await page.getByTestId("inbox-mark-all").click();
  await expect(page.getByTestId("bell-badge")).toHaveCount(0);

  await page.goto("/monitor/orders");
  await expect(page.getByTestId("work-forbidden")).toBeVisible();
});
