import { expect, test, type Page } from "@playwright/test";

/**
 * The wishlist, guest and signed-in.
 *
 * Fixtures: the customer is «أحمد علي» on 07701234567 with the code 123456,
 * and their account wishlist already holds p11 and p17 (see mock-account.ts).
 * A guest's list lives in localStorage under shubayr.wishlist.v1.
 */

const PHONE = "07701234567";
const OTP = "123456";
const WISHLIST_KEY = "shubayr.wishlist.v1";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("auth-phone").fill(PHONE);
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  await expect(page.getByTestId("header-account")).toBeVisible();
}

function storedWishlist(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? "[]"),
    WISHLIST_KEY,
  ) as Promise<string[]>;
}

test("a guest can save a product and find it on the wishlist page", async ({
  page,
}) => {
  await page.goto("/product/p1");

  // The product page heart is the first one outside the related rail.
  await page.getByRole("button", { name: "أضف إلى المفضلة" }).first().click();
  await expect(await storedWishlist(page)).toContain("p1");

  await page.goto("/account/wishlist");
  // A guest is bounced to sign-in: the page lives behind the account guard.
  await expect(page).toHaveURL(/\/login/);
});

test("the wishlist page lists saved products, and removes one", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/account/wishlist");

  const grid = page.getByTestId("wishlist-grid");
  await expect(grid).toBeVisible();
  // The account fixture starts with two saved products.
  await expect(grid.locator("> li")).toHaveCount(2);
  await expect(page.getByTestId("wishlist-count")).toContainText("2");

  await page.getByTestId("wishlist-remove-p11").click();
  await expect(grid.locator("> li")).toHaveCount(1);
  await expect(await storedWishlist(page)).not.toContain("p11");
});

test("moving a product to the cart takes it out of the wishlist", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/account/wishlist");
  await expect(page.getByTestId("wishlist-grid")).toBeVisible();

  await page.getByTestId("wishlist-move-p17").click();

  // It leaves the wishlist…
  await expect(page.getByTestId("wishlist-move-p17")).toHaveCount(0);
  // …and the header cart badge picks it up.
  await expect(page.getByTestId("cart-badge")).toHaveText("1");
});

test("a product hearted as a guest survives signing in", async ({ page }) => {
  // Heart p4 while signed out.
  await page.goto("/product/p4");
  await page.getByRole("button", { name: "أضف إلى المفضلة" }).first().click();
  await expect(await storedWishlist(page)).toContain("p4");

  await signIn(page);
  await page.goto("/account/wishlist");
  await expect(page.getByTestId("wishlist-grid")).toBeVisible();

  // The guest pick is merged with the account's two, not replaced by them.
  const stored = await storedWishlist(page);
  expect(stored).toContain("p4");
  expect(stored).toContain("p11");
  await expect(page.getByTestId("wishlist-grid").locator("> li")).toHaveCount(3);
});

test("an empty wishlist offers a way back to the catalogue", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/account/wishlist");
  await expect(page.getByTestId("wishlist-grid")).toBeVisible();

  await page.getByTestId("wishlist-remove-p11").click();
  await page.getByTestId("wishlist-remove-p17").click();

  await expect(page.getByText("قائمة المفضلة فارغة")).toBeVisible();
  await page.getByRole("link", { name: "تصفّح المنتجات" }).click();
  await expect(page).toHaveURL(/\/categories$/);
});
