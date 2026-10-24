import ar from "../../src/messages/ar.json";
import en from "../../src/messages/en.json";
import { expect, test } from "./fixtures";
import { ADMIN_USERNAME, createStaff, requireLiveApi, uiLogin, uiLoginAsAdmin } from "./helpers";
import { toggleLocale } from "./shell";

/**
 * NOTE-012 against the real API: what the person reads is the admin's own
 * wording in the language they chose — never the API's English message —
 * and switching the language mid-form keeps what they typed and re-words the
 * messages already on screen.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

test("a wrong password is worded in Arabic, then in English after a switch, keeping the username", async ({ page }) => {
  await uiLogin(page, ADMIN_USERNAME, "Not-The-Password!1");
  await expect(page.getByTestId("login-error")).toHaveText(ar.auth.invalidCredentials);

  await toggleLocale(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("login-error")).toHaveText(en.auth.invalidCredentials);
  await expect(page.getByTestId("login-username")).toHaveValue(ADMIN_USERNAME);

  await toggleLocale(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});

test("the lockout is worded in English for someone who chose English", async ({ page, request }) => {
  const staff = await createStaff(request, { prefix: "lock-en" });
  await page.goto("/login");
  await toggleLocale(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await uiLogin(page, staff.username, `Wrong-Pass!${attempt}xx`);
    await expect(page.getByTestId("login-error")).toHaveText(en.auth.invalidCredentials);
  }
  await uiLogin(page, staff.username, staff.password);
  await expect(page.getByTestId("lockout-message")).toHaveText(en.auth.locked);
  await expect(page.getByTestId("form-error")).toHaveCount(0);
});

test("a server 422 shows the admin's wording, re-worded by a language switch that keeps every input", async ({ page }) => {
  await uiLoginAsAdmin(page);
  await page.goto("/staff/new");
  // Starts with a digit: the API's username pattern refuses it (class-validator
  // `matches`), and the API's own English message must not reach the screen.
  await page.getByTestId("input-username").fill("9-not-valid");
  await page.getByTestId("input-name").fill("Keeps Me");
  await page.getByTestId("generate-password").click();
  await page.getByTestId("input-reason").fill("Checking validation");
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "POST" && candidate.url().includes("/admin/staff")),
    page.getByTestId("staff-create-submit").click(),
  ]);
  expect(response.status()).toBe(422);
  const serverText = ((await response.json()) as { errors?: { message: string }[] }).errors?.[0]?.message ?? "";

  await expect(page.getByTestId("error-username")).toHaveText(ar.errors.fields.format);
  if (serverText) await expect(page.getByTestId("error-username")).not.toContainText(serverText);

  await toggleLocale(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("error-username")).toHaveText(en.errors.fields.format);
  await expect(page.getByTestId("input-username")).toHaveValue("9-not-valid");
  await expect(page.getByTestId("input-name")).toHaveValue("Keeps Me");
  await expect(page.getByTestId("input-reason")).toHaveValue("Checking validation");
  await expect(page).toHaveURL(/\/staff\/new$/);

  await toggleLocale(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});

test("page titles follow the chosen language", async ({ page }) => {
  await page.goto("/login");
  const arabic = await page.title();
  await toggleLocale(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).not.toHaveTitle(arabic);
  await expect(page).toHaveTitle(/Shubayr Admin/);
  await toggleLocale(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page).toHaveTitle(arabic);
});
