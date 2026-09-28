import { expect, test, type Page } from "@playwright/test";

/**
 * Work accounts on the storefront (API 6.0), against the mock-backed server.
 *
 * The mock mirrors the backend seed: 07700000005 signs in as a delivery agent
 * and 07700000008 as an order monitor. Either one gets the work-account
 * landing on every page, with the shopping controls gone.
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
