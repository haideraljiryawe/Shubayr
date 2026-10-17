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

  // The contract requires a reason on every LINE, so submitting without one
  // is refused here rather than spent on a 422.
  await page.getByTestId("return-submit").click();
  await expect(page.getByTestId("return-error")).toContainText(
    "اذكر سبب الإرجاع لكل منتج",
  );

  await page.getByTestId("return-line-reason-oi-p10").fill("المقاس غير مناسب");
  await page.getByTestId("return-reason").fill("ملاحظة عامة");
  await page.getByTestId("return-submit").click();

  // It lands on the returns list, newest first, awaiting review.
  await expect(page).toHaveURL(/\/account\/returns$/);
  const list = page.getByTestId("returns-list");
  await expect(list).toBeVisible();
  await expect(list.locator("> li").first()).toContainText("قيد المراجعة");
  // The row names the ORDER, resolved to its number rather than its id.
  await expect(list.locator("> li").first()).toContainText("SB-1035");
  await expect(list.locator("> li").first()).toContainText("المقاس غير مناسب");
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

/* ---------------------------------------------------------------------------
 * Returns v2 (contract 17.0): weighed quantities and the return detail.
 *
 * SB-1028 (`sb-1028`) also carries 2.5 kg of rice (oi-p36), 0.5 kg of which
 * is already refunded (ret-2), so 2 kg are still returnable. ret-3 is a
 * rejected return on SB-1035.
 * ------------------------------------------------------------------------- */

test("a weighed product is returned by typed weight, to three decimals at most", async ({ page }) => {
  await signIn(page);
  await page.goto("/account/orders/sb-1028/return");
  await page.getByTestId("return-check-oi-p36").check();

  // No stepper for kilograms: a field, prefilled with what is still returnable.
  await expect(page.getByTestId("return-qty-oi-p36")).toHaveCount(0);
  const weight = page.getByTestId("return-qty-input-oi-p36");
  await expect(weight).toHaveValue("2");
  const hint = page.getByTestId("return-qty-hint-oi-p36");
  await expect(hint).toContainText("2 kg");

  await weight.fill("2.25");
  await expect(hint).toContainText("لا يمكن إرجاع أكثر من 2 kg");
  await weight.fill("0.1234");
  await expect(hint).toContainText("ثلاث منازل عشرية");
  await page.getByTestId("return-line-reason-oi-p36").fill("الكيس ممزق");
  await page.getByTestId("return-submit").click();
  await expect(page.getByTestId("return-error")).toContainText("راجع كمية كل منتج");

  // Arabic digits and the Arabic decimal mark are what people type.
  await weight.fill("٠٫٧٥");
  await page.getByTestId("return-submit").click();
  await expect(page).toHaveURL(/\/account\/returns$/);
  const first = page.getByTestId("returns-list").locator("> li").first();
  await expect(first).toContainText("قيد المراجعة");
  await expect(first).toContainText("×0.75 kg");

  await first.getByRole("link", { name: "عرض التفاصيل" }).click();
  await expect(page.getByTestId("return-detail")).toHaveAttribute("data-status", "requested");
  await expect(page.getByTestId("return-detail-asked")).toHaveText("0.75 kg");
  await expect(page.getByTestId("return-detail-explain")).toContainText("سنراجعه قريبًا");
});

test("a refunded return explains what was accepted, paid and done with the points", async ({ page }) => {
  await signIn(page);
  await page.goto("/account/returns/ret-2");

  const detail = page.getByTestId("return-detail");
  await expect(detail).toHaveAttribute("data-status", "refunded");
  await expect(page.getByTestId("return-detail-status")).toHaveText("تم الاسترداد");
  await expect(page.getByTestId("return-detail-explain")).toContainText("دُفع لك المبلغ المسترد");
  for (const stage of ["requested", "reviewed", "received", "inspected", "refunded"]) {
    await expect(page.getByTestId(`return-stage-${stage}`)).toHaveAttribute("data-state", "done");
  }
  await expect(page.getByTestId("return-detail-asked")).toHaveText("0.5 kg");
  await expect(page.getByTestId("return-detail-accepted")).toHaveText("0.5 kg");
  await expect(page.getByTestId("return-detail-cash")).toBeVisible();
  await expect(page.getByTestId("return-detail-paid-how")).toContainText("دُفع نقدًا");
  // Points are a balance matter, never taken off the cash.
  const points = page.getByTestId("return-detail-points");
  await expect(points).toContainText("سُحبت نقطتان");
  await expect(points).toContainText("لا تُنقص المبلغ النقدي");
  await expect(page.getByTestId("return-detail-event")).toHaveCount(5);
  // The shopper's words only: nothing about custody, ledgers or inspections' internals.
  await expect(detail).not.toContainText(/عهدة|قيد|custody|ledger|journal/i);

  await page.goto("/en/account/returns/ret-2");
  await expect(page.getByTestId("return-detail-explain")).toContainText("Your refund has been paid");
  await expect(page.getByTestId("return-detail-points")).toContainText("2 points you earned on these items were taken back");
});

test("a rejected return says so, with the reason, and goes no further", async ({ page }) => {
  await signIn(page);
  await page.goto("/account/returns");
  await page.getByTestId("return-details-ret-3").click();
  await expect(page).toHaveURL(/\/account\/returns\/ret-3$/);

  await expect(page.getByTestId("return-detail-status")).toHaveText("مرفوض");
  await expect(page.getByTestId("return-detail-rejection")).toContainText("المنتج مستعمل");
  await expect(page.getByTestId("return-stage-received")).toHaveAttribute("data-state", "skipped");
  await expect(page.getByTestId("return-stage-refunded")).toHaveAttribute("data-state", "skipped");
  await expect(page.getByTestId("return-detail-refund")).toHaveCount(0);
});

test("an unknown return is not found", async ({ page }) => {
  await signIn(page);
  await page.goto("/account/returns/ret-missing");
  await expect(page.getByTestId("return-not-found")).toBeVisible();
});
