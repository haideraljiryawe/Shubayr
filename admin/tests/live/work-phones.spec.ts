import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  API,
  DEV_OTP,
  randomWorkPhone,
  requireLiveApi,
  uiLoginAsAdmin,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

/** What the phone gets when it signs in through OTP on the web store. */
async function otpSignIn(request: APIRequestContext, phone: string) {
  await request.post(`${API}/auth/request-otp`, { data: { phone } });
  const response = await request.post(`${API}/auth/verify-otp`, {
    data: { phone, code: DEV_OTP, client: "web_store" },
  });
  return { status: response.status(), body: await response.json() };
}

test("registers a work phone with its person, then revokes it", async ({
  page,
  request,
}) => {
  const phone = randomWorkPhone();
  const local = `0${phone.slice(4)}`;
  const name = `مندوب ${phone.slice(-4)}`;

  await uiLoginAsAdmin(page);
  await page.getByTestId("nav-workPhones").click();

  // Registered in the local format staff actually type.
  const form = page.getByTestId("work-phone-form");
  await form.getByTestId("input-phone").fill(local);
  await form.getByTestId("input-name").fill(name);
  await form.getByTestId("input-role").selectOption("delivery_agent");
  await form.getByTestId("input-reason").fill("New courier for Kut");
  await form.getByTestId("work-phone-submit").click();
  await expect(page.getByTestId("toast")).toBeVisible();

  await page.getByTestId("table-search").fill(phone.slice(-7));
  const row = page.getByTestId("table-row").filter({ hasText: phone });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(name);
  await expect(row).toContainText("مندوب توصيل");

  // The server now assigns the role at OTP sign-in.
  const signedIn = await otpSignIn(request, phone);
  // The contract documents 200; API 6.1 answers 201. Either is a sign-in.
  expect([200, 201]).toContain(signedIn.status);
  expect(signedIn.body.user.role).toBe("delivery_agent");

  // Change the role by registering again.
  await page.getByTestId(`work-phone-change-${phone}`).click();
  await expect(form.getByTestId("input-phone")).toHaveValue(phone);
  await form.getByTestId("input-role").selectOption("order_monitor");
  await form.getByTestId("input-reason").fill("Moved to the order desk");
  await form.getByTestId("work-phone-submit").click();
  await expect(row).toContainText("مراقب طلبات");

  // Revoke, with a reason, behind a confirmation.
  await page.getByTestId(`work-phone-revoke-${phone}`).click();
  await page.getByTestId("confirm-reason").fill("Contract ended");
  await page.getByTestId("confirm-submit").click();
  await expect(row).toContainText("ملغى");
  await expect(page.getByTestId(`work-phone-revoke-${phone}`)).toHaveCount(0);

  // Revoked means the phone can no longer sign in as a work account.
  const refused = await otpSignIn(request, phone);
  expect(refused.status).toBe(401);
});

test("a customer's phone cannot become a work phone", async ({ page }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/work-phones");
  const form = page.getByTestId("work-phone-form");
  await form.getByTestId("input-phone").fill("07700000006");
  await form.getByTestId("input-name").fill("Not allowed");
  await form.getByTestId("input-reason").fill("Should be refused");
  await form.getByTestId("work-phone-submit").click();
  await expect(page.getByTestId("form-error")).toHaveAttribute(
    "data-kind",
    "customerPhone",
  );
  // What was typed is still there to correct.
  await expect(form.getByTestId("input-name")).toHaveValue("Not allowed");
});
