import type { APIRequestContext } from "@playwright/test";
import { LAUNCH_MODULES } from "../../src/lib/modules";
import { expect, test } from "./fixtures";
import { API, KNOWN_PASSWORD, activateStaff, adminApiToken, bearer, createStaff, requireLiveApi, switchUser, uiLogin } from "./helpers";
import { hydrated, toggleLocale } from "./shell";

/**
 * PR A16 (Ahmed's visual review, part 4) with exactly the launch modules:
 * CI serves them from their own admin server (ADMIN_LAUNCH_ORIGIN); locally,
 * run this spec with ADMIN_MODULES set to the launch set.
 *
 * - VIS-019: the permission picker reads by Arabic/English names from the
 *   registry, searches them (Arabic letter forms folded), and keeps the
 *   selection across a language switch;
 * - (product delete moved to a17.spec.ts: previews and the real bulk delete);
 * - change password: show/hide, the live checklist, and back to the page the
 *   person came from.
 */

test.describe.configure({ mode: "serial" });

const launchOrigin = process.env.ADMIN_LAUNCH_ORIGIN;
const launchMode = Boolean(launchOrigin) || process.env.ADMIN_MODULES === LAUNCH_MODULES;
if (launchOrigin) test.use({ baseURL: launchOrigin });

test.beforeEach(async ({ request }) => {
  test.skip(!launchMode, "needs the admin started with the launch modules (ADMIN_MODULES=LAUNCH_MODULES)");
  await requireLiveApi(request);
});

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

/* ------------------------------------------------------------ permissions */

test("VIS-019: permissions read by name in both languages, search folds Arabic, a language switch keeps the selection", async ({ page, request }) => {
  // Its own staff member, so the language it saves is nobody else's.
  const staff = await activateStaff(request, await createStaff(request, { presets: ["super_admin"], prefix: "a16perm" }));
  await uiLogin(page, staff.username, KNOWN_PASSWORD);
  await page.goto("/presets/new");
  const picker = page.getByTestId("picker-permission_keys");
  await expect(picker).toBeVisible();

  // Arabic names first, the key only as a small hint.
  await expect(picker.getByTestId("perm-name-orders.accept")).toHaveText("قبول الطلبات");
  await expect(picker.getByTestId("perm-description-orders.accept")).toContainText("قبول الطلبات");
  await expect(picker.locator("code", { hasText: "orders.accept" })).toBeVisible();

  // Search the Arabic name; typed without hamza and with ه for ة, as people do.
  const search = picker.getByTestId("picker-permission_keys-search");
  await search.fill("قبول الطلبات");
  await expect(picker.getByTestId("perm-orders.accept")).toBeVisible();
  await expect(picker.getByTestId("perm-orders.view")).toHaveCount(0);
  await picker.getByTestId("perm-orders.accept").check();
  await search.fill("اداره العلامات التجاريه");
  await expect(picker.getByTestId("perm-catalog.brands")).toBeVisible();
  await picker.getByTestId("perm-catalog.brands").check();
  await search.fill("لا توجد صلاحية بهذا الاسم أبدًا");
  await expect(picker.getByTestId("picker-permission_keys-none")).toBeVisible();
  await search.fill("");

  // English: the same permissions, re-labelled, still chosen.
  await toggleLocale(page);
  await expect(picker.getByTestId("perm-name-orders.accept")).toHaveText("Accept pending orders");
  await expect(picker.getByTestId("perm-name-catalog.brands")).toHaveText("Manage brands");
  await expect(picker.getByTestId("perm-orders.accept")).toBeChecked();
  await expect(picker.getByTestId("perm-catalog.brands")).toBeChecked();
  await expect(picker.getByTestId("perm-orders.view")).not.toBeChecked();
  await search.fill("sale prices");
  await expect(picker.getByTestId("perm-prices.change")).toBeVisible();
  // An English search also finds the Arabic wording, and the other way round.
  await search.fill("أسعار البيع");
  await expect(picker.getByTestId("perm-prices.change")).toBeVisible();
  await search.fill("");

  // Saved as keys, exactly what was ticked.
  const name = `a16_${run}`;
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-reason").fill("A16 live test preset");
  await page.getByTestId("preset-save").click();
  await expect(page).toHaveURL(/\/presets\/[0-9a-f-]{36}$/);
  const presets = (await api(request, "GET", "/admin/presets")).body as Array<{ name: string; permissions: Array<{ permission: { key: string } }> }>;
  const saved = presets.find((preset) => preset.name === name)!;
  expect(saved.permissions.map((entry) => entry.permission.key).sort()).toEqual(["catalog.brands", "orders.accept"]);

  // The staff editor's extra grants use the same names.
  await page.goto("/staff/new");
  await expect(page.getByTestId("perm-name-orders.view")).toHaveText("View orders");
  await toggleLocale(page);
  await expect(page.getByTestId("perm-name-orders.view")).toHaveText("عرض الطلبات");
});

/* ------------------------------------------------------- change password */

test("change password: show/hide, the live checklist, and back to the page you came from", async ({ page, request }) => {
  const staff = await activateStaff(request, await createStaff(request, { presets: ["super_admin"], prefix: "a16pw" }));
  await switchUser(page, staff.username, KNOWN_PASSWORD);
  await page.goto("/catalog/products?status=hidden");
  await hydrated(page, "account-menu");
  await page.getByTestId("account-menu").click();
  await page.getByTestId("account-change-password").click();
  await page.waitForURL(/\/change-password\?next=%2Fcatalog%2Fproducts/);

  const next = page.getByTestId("new-password");
  await next.fill("short");
  await expect(next).toHaveAttribute("type", "password");
  await page.getByTestId("new-password-toggle").click();
  await expect(next).toHaveAttribute("type", "text");
  await page.getByTestId("new-password-toggle").click();
  await expect(next).toHaveAttribute("type", "password");
  const checklist = page.getByTestId("password-checklist");
  await expect(checklist.locator('[data-met="false"]').first()).toBeVisible();

  const fresh = `A16-New-Pass!${run}`;
  await page.getByTestId("current-password").fill(KNOWN_PASSWORD);
  await next.fill(fresh);
  await expect(checklist.locator('[data-met="false"]')).toHaveCount(0);
  await page.getByTestId("confirm-password").fill(fresh);
  await page.getByTestId("change-password-submit").click();
  await page.waitForURL(/\/catalog\/products$/);

  // The new password is the one that works now.
  await switchUser(page, staff.username, fresh);
  await expect(page.getByTestId("dashboard")).toBeVisible();
});
