import { expect, test } from "@playwright/test";
import {
  ADMIN_USERNAME,
  KNOWN_PASSWORD,
  apiLogin,
  createStaff,
  requireLiveApi,
  uiLogin,
  uiLoginAsAdmin,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

test("signs in with username and password; the tokens stay out of JavaScript", async ({
  page,
  context,
}) => {
  await uiLoginAsAdmin(page);

  // Arabic and right-to-left by default.
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("current-user")).toBeVisible();

  const cookies = await context.cookies();
  const session = cookies.filter((cookie) =>
    cookie.name.startsWith("shubayr_admin_"),
  );
  expect(session.map((cookie) => cookie.name).sort()).toEqual([
    "shubayr_admin_at",
    "shubayr_admin_rt",
  ]);
  for (const cookie of session) {
    expect(cookie.httpOnly, cookie.name).toBe(true);
    expect(cookie.secure, cookie.name).toBe(true);
    expect(cookie.sameSite, cookie.name).toBe("Strict");
  }
  // Page scripts cannot see either token.
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "shubayr_admin_",
  );
});

test("a wrong password is refused with a clear message", async ({ page }) => {
  await uiLogin(page, ADMIN_USERNAME, "Not-The-Password!1");
  await expect(page.getByTestId("login-error")).toBeVisible();
  // The typed username survives the failure.
  await expect(page.getByTestId("login-username")).toHaveValue(ADMIN_USERNAME);
});

test("repeated failures lock the account and the form says so", async ({
  page,
  request,
}) => {
  const staff = await createStaff(request, { prefix: "lock" });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await uiLogin(page, staff.username, `Wrong-Pass!${attempt}xx`);
    await expect(page.getByTestId("login-error")).toBeVisible();
  }
  // Locked now — even the right password is refused, with the lockout wording.
  await uiLogin(page, staff.username, staff.password);
  const lockout = page.getByTestId("lockout-message");
  await expect(lockout).toBeVisible();
  await expect(lockout).toContainText("15");
  await expect(page).toHaveURL(/\/login/);

  const { status, body } = await apiLogin(
    request,
    staff.username,
    staff.password,
  );
  expect(status).toBe(429);
  expect(body.code).toBe("ACCOUNT_LOCKED");
});

test("a temporary password forces the change before anything else", async ({
  page,
  request,
}) => {
  const staff = await createStaff(request, {
    presets: ["super_admin"],
    prefix: "temp",
  });

  await uiLogin(page, staff.username, staff.password);
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByTestId("forced-password-change")).toBeVisible();

  // No way around it: every admin page leads back here.
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/change-password$/);

  // A mismatch is caught before the round trip; the typed values stay.
  await page.getByTestId("current-password").fill(staff.password);
  await page.getByTestId("new-password").fill(KNOWN_PASSWORD);
  await page.getByTestId("confirm-password").fill("Something-Else!2026");
  await page.getByTestId("change-password-submit").click();
  await expect(page.getByTestId("error-confirm")).toBeVisible();
  await expect(page.getByTestId("new-password")).toHaveValue(KNOWN_PASSWORD);

  await page.getByTestId("confirm-password").fill(KNOWN_PASSWORD);
  await page.getByTestId("change-password-submit").click();
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByTestId("nav-staff")).toBeVisible();

  // The new password is the one that works from now on.
  const { status, body } = await apiLogin(
    request,
    staff.username,
    KNOWN_PASSWORD,
  );
  expect(status).toBe(201);
  expect(
    (body.user as { must_change_password: boolean }).must_change_password,
  ).toBe(false);
});

test("signing out revokes the session and clears the cookies", async ({
  page,
  context,
}) => {
  await uiLoginAsAdmin(page);
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/login$/);

  const names = (await context.cookies()).map((cookie) => cookie.name);
  expect(names).not.toContain("shubayr_admin_at");
  expect(names).not.toContain("shubayr_admin_rt");

  await page.goto("/staff");
  await expect(page).toHaveURL(/\/login\?next=%2Fstaff$/);
});

test("the admin speaks English on request, left to right", async ({ page }) => {
  await uiLoginAsAdmin(page);
  await page.getByTestId("locale-switch").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("nav-staff")).toHaveText("Staff");
  // Put it back for the rest of the suite.
  await page.getByTestId("locale-switch").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});

test("an expired or foreign session is sent to sign in, not looped", async ({
  page,
  context,
}) => {
  // A cookie that looks like a live token but the API rejects.
  const fake = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: "nobody",
    }),
  ).toString("base64url")}.bad`;
  await context.addCookies([
    {
      name: "shubayr_admin_at",
      value: fake,
      url: "http://localhost:3300",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/login\?.*expired=1/);
  await expect(page.getByTestId("login-username")).toBeVisible();
});
