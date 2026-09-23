import { expect, test, type Page } from "@playwright/test";

/**
 * Points, product reviews and the delivery rating.
 *
 * Fixtures (mock-account.ts): the loyalty account holds 1,240 points over five
 * ledger entries, and SB-1035 (`sb-1035`) is the delivered order carrying the
 * two reviewable lines oi-p4 and oi-p10.
 */

const PHONE = "07701234567";
const OTP = "123456";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("auth-phone").fill(PHONE);
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  await expect(page.getByTestId("header-account")).toBeVisible();
}

test("the points page shows the balance and its ledger", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("account-link-points").click();

  await expect(page).toHaveURL(/\/account\/points$/);
  // A points total is Latin digits inside Arabic, so it is direction-isolated.
  const balance = page.getByTestId("points-balance");
  await expect(balance).toHaveText("1,240");
  await expect(balance).toHaveAttribute("dir", "ltr");

  const ledger = page.getByTestId("points-ledger");
  await expect(ledger.locator("> li")).toHaveCount(5);
  // Earnings read as credits, redemptions as debits.
  await expect(ledger).toContainText("نقاط مكتسبة");
  await expect(ledger).toContainText("نقاط مستبدلة");
  await expect(ledger.locator("> li").first()).toContainText("+320");
});

test("a delivered order can be reviewed per product", async ({ page }) => {
  await signIn(page);
  await page.goto("/account/orders/sb-1035");

  // Both lines start reviewable.
  await expect(page.getByTestId("review-open-oi-p4")).toBeVisible();
  await expect(page.getByTestId("review-open-oi-p10")).toBeVisible();

  await page.getByTestId("review-open-oi-p4").click();
  const form = page.getByTestId("review-form-oi-p4");
  await expect(form).toBeVisible();

  // Stars are required, and the refusal is inline.
  await page.getByTestId("review-submit-oi-p4").click();
  await expect(form.getByRole("alert")).toContainText("اختر تقييمًا");

  // The star group is a real radiogroup, so it is labelled for assistive tech…
  await expect(form.getByRole("radiogroup")).toBeVisible();
  await expect(form.getByRole("radio")).toHaveCount(5);
  // …and clicking the star itself is what a pointer user does.
  await form.getByTestId("review-stars-oi-p4-star-4").click();
  await expect(form.getByRole("radio", { name: "4 من ٥ نجوم" })).toBeChecked();
  await form.getByRole("textbox").fill("منتج ممتاز وجودة عالية.");
  await page.getByTestId("review-submit-oi-p4").click();

  // It flips to "reviewed" and stops offering the form again.
  await expect(page.getByTestId("review-done-oi-p4")).toBeVisible();
  await expect(page.getByTestId("review-open-oi-p4")).toHaveCount(0);
  // The other line is untouched.
  await expect(page.getByTestId("review-open-oi-p10")).toBeVisible();
});

test("the delivery rating is separate from the product review", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/account/orders/sb-1035");

  const form = page.getByTestId("delivery-rating-form");
  await expect(form).toBeVisible();

  await form.getByTestId("delivery-stars-star-5").click();
  await expect(form.getByRole("radio", { name: "5 من ٥ نجوم" })).toBeChecked();
  await page.getByTestId("delivery-rating-submit").click();

  await expect(page.getByTestId("delivery-rated")).toBeVisible();
  // Rating the courier does not mark any product as reviewed.
  await expect(page.getByTestId("review-open-oi-p4")).toBeVisible();
});

test("reviews and the delivery rating are hidden on an undelivered order", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/account/orders/sb-1039");

  await expect(page.getByTestId("delivery-rating-form")).toHaveCount(0);
  await expect(page.getByTestId("review-open-oi-p1")).toHaveCount(0);
});

test("order lines render from the order's own snapshots", async ({ page }) => {
  await signIn(page);

  // Break the catalogue: the order page must not depend on it any more, since
  // the contract snapshots the name and image onto each order item.
  await page.route("**/products/**", (route) => route.abort());
  await page.goto("/account/orders/sb-1035");

  await expect(page.getByText("لابتوب").first()).toBeVisible();
  await expect(page.getByText("قميص قطني").first()).toBeVisible();
});
