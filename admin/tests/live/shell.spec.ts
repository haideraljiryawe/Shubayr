import { expect, test } from "./fixtures";
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  API,
  activateStaff,
  adminApiToken,
  bearer,
  createStaff,
  requireLiveApi,
  savePreferredLanguage,
  switchUser,
  uiLoginAsAdmin,
} from "./helpers";
import { hydrated, toggleLocale } from "./shell";

/**
 * The signed-in shell and the sign-in page (VIS-001/002/004/025) against the
 * real API: the exact sign-in copy, the grouped sidebar, the account menu and
 * its sign-out confirmation, the narrow-screen drawer, and the one version.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

test("sign-in says what is missing, and nothing about format", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("تسجيل الدخول");
  await expect(page.getByText("أدخل بيانات حسابك للوصول إلى لوحة الإدارة")).toBeVisible();
  await hydrated(page, "login-submit");

  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("error-username")).toHaveText("أدخل اسم المستخدم.");
  await expect(page.getByTestId("error-password")).toHaveText("أدخل كلمة المرور.");
  await expect(page).toHaveURL(/\/login$/);

  // A one-letter username and a short password are not judged here: the API
  // answers, and the answer is the one wrong-pair message.
  await page.getByTestId("login-username").fill("x");
  await expect(page.getByTestId("error-username")).toHaveCount(0);
  await page.getByTestId("login-password").fill("y");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toHaveText("اسم المستخدم أو كلمة المرور غير صحيحة.");
  await expect(page.getByTestId("error-password")).toHaveCount(0);

  // The password can be shown and hidden again.
  const password = page.getByTestId("login-password");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByTestId("login-password-toggle").click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByTestId("login-password-toggle").click();
  await expect(password).toHaveAttribute("type", "password");
});

test("an unreachable server is not called a wrong password", async ({ page }) => {
  await page.goto("/login");
  await hydrated(page, "login-submit");
  await page.route("**/api/auth/login", (route) => route.abort("connectionrefused"));
  await page.getByTestId("login-username").fill(ADMIN_USERNAME);
  await page.getByTestId("login-password").fill("Anything!2026");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-connection-error")).toHaveText("تعذّر الاتصال. حاول مرة أخرى.");
  await expect(page.getByTestId("login-error")).toHaveCount(0);
});

test("the version is the API's release, the same on sign-in and in the sidebar", async ({ page, request }) => {
  const { release } = (await (await request.get(`${API}/version`)).json()) as { release: string };
  await page.goto("/login");
  await expect(page.getByTestId("app-version-value")).toHaveText(release);
  await expect(page.getByTestId("app-version")).toHaveText(`الإصدار ${release}`);
  await uiLoginAsAdmin(page);
  await expect(page.getByTestId("sidebar-footer").getByTestId("app-version-value")).toHaveText(release);
});

test("the language is the account's: it follows the person, not the browser", async ({ page, request }) => {
  const colleague = await activateStaff(request, await createStaff(request, { prefix: "lang" }));
  try {
    await uiLoginAsAdmin(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await hydrated(page, "account-menu");
  await page.getByTestId("account-menu").click();
    await page.getByTestId("account-locale-en").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const me = await request.get(`${API}/me`, { headers: bearer(await adminApiToken(request)) });
    expect(((await me.json()) as { preferred_ui_language: string }).preferred_ui_language).toBe("en");

    // A colleague on the same browser gets their own (Arabic, the default)…
    await switchUser(page, colleague.username, colleague.password);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    // …and the admin gets English back on any sign-in.
    await switchUser(page, ADMIN_USERNAME, ADMIN_PASSWORD);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await hydrated(page, "account-menu");
  await page.getByTestId("account-menu").click();
    await page.getByTestId("account-locale-ar").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  } finally {
    await savePreferredLanguage(request, await adminApiToken(request), "ar");
  }
});

test("the sidebar groups its pages and remembers what was opened", async ({ page }) => {
  await uiLoginAsAdmin(page);
  const nav = page.getByTestId("sidebar-nav");
  // Home and Reports are direct links; the rest sit in groups.
  await expect(nav.getByTestId("nav-dashboard")).toBeVisible();
  await expect(nav.getByTestId("nav-reports")).toBeVisible();
  await expect(nav.getByTestId("nav-dashboard")).toHaveAttribute("aria-current", "page");

  // On a page, its group is open and its link is the current one.
  await page.goto("/inventory/warehouses");
  const inventory = nav.getByTestId("nav-group-inventory");
  await expect(inventory).toHaveAttribute("aria-expanded", "true");
  await expect(nav.getByTestId("nav-warehouses")).toHaveAttribute("aria-current", "page");

  // Another group opened by hand stays open after a reload.
  const finance = nav.getByTestId("nav-group-finance");
  await expect(finance).toHaveAttribute("aria-expanded", "false");
  await finance.click();
  await expect(finance).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(nav.getByTestId("nav-group-finance")).toHaveAttribute("aria-expanded", "true");
  await nav.getByTestId("nav-group-finance").click();
  await expect(nav.getByTestId("nav-group-finance")).toHaveAttribute("aria-expanded", "false");

  // The sidebar scrolls by itself: the page under it does not move it.
  const box = await page.getByTestId("sidebar").boundingBox();
  await page.mouse.wheel(0, 2000);
  expect((await page.getByTestId("sidebar").boundingBox())?.y).toBe(box?.y);
});

test("the account menu holds the language, the password and sign-out", async ({ page }) => {
  await uiLoginAsAdmin(page);
  const top = page.getByTestId("top-bar");
  await expect(top.getByTestId("locale-switch")).toHaveCount(0);

  await hydrated(page, "account-menu");
  await page.getByTestId("account-menu").click();
  const menu = page.getByTestId("account-menu-content");
  await expect(menu.getByTestId("account-name")).toBeVisible();
  await expect(menu.getByTestId("account-locale-ar")).toHaveAttribute("aria-checked", "true");
  // The password change comes back to this page afterwards.
  await expect(menu.getByTestId("account-change-password")).toHaveAttribute("href", "/change-password?next=%2F");
  await menu.getByTestId("account-change-password").click();
  await expect(page).toHaveURL(/\/change-password\?next=%2F$/);
  await page.goto("/");

  // Sign-out asks first; Cancel and Escape keep the session.
  for (const dismiss of ["cancel", "escape"] as const) {
    await hydrated(page, "account-menu");
  await page.getByTestId("account-menu").click();
    await page.getByTestId("sign-out").click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog).toContainText("هل تريد تسجيل الخروج من حسابك؟");
    if (dismiss === "cancel") await dialog.getByTestId("confirm-cancel").click();
    else await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/staff$/);
    await page.goto("/");
  }

  await hydrated(page, "account-menu");
  await page.getByTestId("account-menu").click();
  await page.getByTestId("sign-out").click();
  await page.getByTestId("confirm-dialog").getByTestId("confirm-submit").click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("on a phone the menu is a drawer from the reading side", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uiLoginAsAdmin(page);
  await expect(page.getByTestId("sidebar")).toBeHidden();

  for (const locale of ["ar", "en"] as const) {
    if ((await page.locator("html").getAttribute("lang")) !== locale) await toggleLocale(page);
    const open = page.getByTestId("drawer-open");
    await hydrated(page, "drawer-open");
    const drawer = page.getByTestId("nav-drawer");

    // Escape closes it.
    await open.click();
    await expect(drawer).toBeVisible();
    // Measure where it lands, not mid-slide.
    await drawer.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    const box = (await drawer.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(280);
    expect(box.width).toBeLessThanOrEqual(Math.min(320, 390 * 0.85));
    if (locale === "ar") expect(Math.round(box.x + box.width)).toBe(390);
    else expect(Math.round(box.x)).toBe(0);
    // The page behind is locked while it is open.
    await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", /.*/);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // So do the backdrop and the close button.
    await open.click();
    // Outside the panel: the panel is on the right in Arabic, the left in English.
    await page.getByTestId("drawer-backdrop").click({ position: { x: locale === "ar" ? 20 : 370, y: 400 } });
    await expect(drawer).toBeHidden();
    await open.click();
    await page.getByTestId("drawer-close").click();
    await expect(drawer).toBeHidden();

    // Choosing a page closes it.
    await open.click();
    await page.getByTestId("drawer-nav").getByTestId("nav-reports").click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(drawer).toBeHidden();
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked", /.*/);
  }
  await toggleLocale(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});
