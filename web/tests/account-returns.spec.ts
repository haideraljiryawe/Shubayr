import { expect, test, type Page } from "@playwright/test";

/**
 * Returns and the review/rating flow, both gated to delivered orders.
 *
 * Fixtures (mock-account.ts): SB-1035 (`sb-1035`) is delivered and holds two
 * lines — p4 ×1 and p10 ×3, so a partial return is exercisable. SB-1039
 * (`sb-1039`) is out for delivery and must refuse both flows.
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

test("a delivered order offers a return; an undelivered one does not", async ({
  page,
}) => {
  await signIn(page);

  await page.goto("/account/orders/sb-1035");
  await expect(page.getByTestId("order-return-cta")).toBeVisible();

  await page.goto("/account/orders/sb-1039");
  await expect(page.getByTestId("order-return-cta")).toHaveCount(0);
});

test("the return page refuses an order that is not delivered", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/account/orders/sb-1039/return");

  await expect(page.getByTestId("return-blocked")).toContainText(
    "الإرجاع متاح للطلبات المُسلّمة فقط",
  );
  await expect(page.getByTestId("return-form")).toHaveCount(0);
});

test("a partial return can be requested and shows up in the list", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/account/orders/sb-1035");
  await page.getByTestId("order-return-cta").click();

  await expect(page.getByTestId("return-form")).toBeVisible();

  // Submitting nothing is refused inline rather than server-side.
  await page.getByTestId("return-submit").click();
  await expect(page.getByTestId("return-error")).toContainText(
    "اختر منتجًا واحدًا على الأقل",
  );

  // Return 2 of the 3 units of p10 — the partial case.
  await page.getByTestId("return-check-oi-p10").check();
  const stepper = page.getByTestId("return-qty-oi-p10");
  await expect(stepper).toBeVisible();
  await stepper.getByRole("button", { name: "زيادة الكمية" }).click();

  await page.getByTestId("return-reason").fill("المقاس غير مناسب");
  await page.getByTestId("return-submit").click();

  // It lands on the returns list, newest first, awaiting review.
  await expect(page).toHaveURL(/\/account\/returns$/);
  const list = page.getByTestId("returns-list");
  await expect(list).toBeVisible();
  await expect(list.locator("> li").first()).toContainText("قيد المراجعة");
  await expect(list.locator("> li").first()).toContainText("sb-1035");
});

test("the quantity stepper cannot exceed what was bought", async ({ page }) => {
  await signIn(page);
  await page.goto("/account/orders/sb-1035/return");

  // p4 was bought once, so its stepper is pinned at one.
  await page.getByTestId("return-check-oi-p4").check();
  const stepper = page.getByTestId("return-qty-oi-p4");
  const increase = stepper.getByRole("button", { name: "زيادة الكمية" });
  await expect(increase).toBeDisabled();
});

test("the returns list starts from the account menu", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("account-link-returns").click();

  await expect(page).toHaveURL(/\/account\/returns$/);
  // The fixture seeds one approved return against the older delivered order.
  await expect(page.getByTestId("returns-list")).toBeVisible();
  await expect(page.getByText("تمت الموافقة")).toBeVisible();
});
