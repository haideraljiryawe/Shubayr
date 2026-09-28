import { expect, test } from "@playwright/test";
import {
  activateStaff,
  createStaff,
  requireLiveApi,
  setAccess,
  uiLogin,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

test("a limited user sees only their navigation and a clean 403 elsewhere", async ({
  page,
  request,
}) => {
  const staff = await activateStaff(
    request,
    await createStaff(request, {
      presets: ["catalog_editor"],
      prefix: "limited",
    }),
  );

  await uiLogin(page, staff.username, staff.password);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  const nav = page.getByTestId("sidebar-nav");
  await expect(nav.getByTestId("nav-dashboard")).toBeVisible();
  await expect(nav.getByTestId("nav-staff")).toHaveCount(0);
  await expect(nav.getByTestId("nav-presets")).toHaveCount(0);
  await expect(nav.getByTestId("nav-workPhones")).toHaveCount(0);

  // Typing the URL is not a way in: the API refuses, the page says so calmly.
  for (const path of [
    "/staff",
    "/staff/new",
    "/presets",
    "/presets/new",
    "/work-phones",
  ]) {
    await page.goto(path);
    const forbidden = page.getByTestId("forbidden");
    await expect(forbidden, path).toBeVisible();
    await expect(forbidden, path).toHaveAttribute("data-status", "403");
    // Still inside the shell, with the way back.
    await expect(page.getByTestId("sidebar-nav"), path).toBeVisible();
  }

  // The browser's road to the API is refused the same way.
  const proxied = await page.request.get("/api/proxy/admin/staff");
  expect(proxied.status()).toBe(403);
  expect((await proxied.json()).code).toBe("PERMISSION_DENIED");
});

test("grants and revocations reach the menu without signing in again", async ({
  page,
  request,
}) => {
  const staff = await activateStaff(
    request,
    await createStaff(request, {
      presets: ["catalog_editor"],
      prefix: "grant",
    }),
  );
  await uiLogin(page, staff.username, staff.password);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  const nav = page.getByTestId("sidebar-nav");
  await expect(nav.getByTestId("nav-staff")).toHaveCount(0);

  // Someone else grants users.manage; the next navigation shows it.
  await setAccess(request, staff.id, ["catalog_editor"], ["users.manage"]);
  await page.goto("/");
  await expect(nav.getByTestId("nav-staff")).toBeVisible();
  await nav.getByTestId("nav-staff").click();
  await expect(page.getByTestId("staff-table")).toBeVisible();

  // …and revokes it: the next click hides the entry and the page is refused.
  await setAccess(request, staff.id, ["catalog_editor"], []);
  await nav.getByTestId("nav-dashboard").click();
  await expect(nav.getByTestId("nav-staff")).toHaveCount(0);
  await page.goto("/staff");
  await expect(page.getByTestId("forbidden")).toBeVisible();
});
