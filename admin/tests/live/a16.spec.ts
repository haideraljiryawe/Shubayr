import type { APIRequestContext } from "@playwright/test";
import { LAUNCH_MODULES } from "../../src/lib/modules";
import { expect, test } from "./fixtures";
import { API, KNOWN_PASSWORD, activateStaff, adminApiToken, bearer, createStaff, requireLiveApi, switchUser, uiLogin, uiLoginAsAdmin } from "./helpers";
import { hydrated, toggleLocale } from "./shell";

/**
 * PR A16 (Ahmed's visual review, part 4) with exactly the launch modules:
 * CI serves them from their own admin server (ADMIN_LAUNCH_ORIGIN); locally,
 * run this spec with ADMIN_MODULES set to the launch set.
 *
 * - VIS-019: the permission picker reads by Arabic/English names from the
 *   registry, searches them (Arabic letter forms folded), and keeps the
 *   selection across a language switch;
 * - product delete: never used → deleted; with history → archived, with the
 *   reason; bulk does both; the list hides archived products unless asked;
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
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";

async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function newProduct(request: APIRequestContext, label: string) {
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `A16 ${label} ${run}`,
    name_ar: `منتج ${label} ${run}`,
    price: 9000,
    discount_type: null,
    tracks_expiry: false,
    status: "hidden",
    published: false,
    variants: [{ sku: `A16-${label}-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body as { id: string; name_ar: string; name_en: string; variants: Array<{ id: string }> };
}

/** Stock entered as opening stock: history the product can't be deleted with. */
async function withHistory(request: APIRequestContext, label: string) {
  const product = await newProduct(request, label);
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `a16-open-${label}-${run}`,
    document_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date()),
    lines: [{ variant_id: product.variants[0].id, location_id: LOCATION, quantity: "1", unit_cost_iqd: "5000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  return product;
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

/* ---------------------------------------------------------------- delete */

test("product delete: never used → deleted; with history → archived with its reason; the list hides it unless asked", async ({ page, request }) => {
  const unused = await newProduct(request, "UNUSED");
  const stocked = await withHistory(request, "STOCKED");
  await uiLoginAsAdmin(page);

  // Never used: deleted completely, back to the list.
  await page.goto(`/catalog/products/${unused.id}`);
  await hydrated(page, "product-delete");
  await page.getByTestId("product-delete").click();
  const confirm = page.getByTestId("confirm-dialog");
  await expect(confirm.getByTestId("product-delete-explain")).toContainText("يُحذف نهائيًا");
  await expect(confirm.getByTestId("product-delete-explain")).toContainText("يُؤرشف");
  await confirm.getByTestId("confirm-submit").click();
  await page.waitForURL(/\/catalog\/products$/);
  expect((await api(request, "GET", `/admin/products/${unused.id}`)).status).toBe(404);

  // With stock history: archived instead, and the page says why.
  await page.goto(`/catalog/products/${stocked.id}`);
  await hydrated(page, "product-delete");
  await page.getByTestId("product-delete").click();
  await confirm.getByTestId("confirm-submit").click();
  const outcome = page.getByTestId("product-delete-outcome");
  await expect(outcome).toHaveAttribute("data-archived", "1");
  await expect(outcome.locator('[data-reason="inventory_history"]')).toBeVisible();
  expect((await api(request, "GET", `/admin/products/${stocked.id}`)).body.status).toBe("archived");

  // Archived products are out of the list by default, and one filter away.
  await page.goto(`/catalog/products?q=${encodeURIComponent(stocked.name_en)}`);
  await expect(page.getByTestId("products-table")).not.toContainText(stocked.name_ar);
  await page.goto(`/catalog/products?q=${encodeURIComponent(stocked.name_en)}&status=archived`);
  await expect(page.locator('[data-testid="product-status-cell"][data-status="archived"]').first()).toBeVisible();
});

test("bulk delete: one call per product, each deleted or archived as the server decides", async ({ page, request }) => {
  const unused = await newProduct(request, "BULKA");
  const stocked = await withHistory(request, "BULKB");
  await uiLoginAsAdmin(page);
  await page.goto(`/catalog/products?q=${encodeURIComponent(`A16 BULK`)}`);
  const rows = page.getByTestId("products-table").locator("tr").filter({ hasText: run });
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) await row.getByTestId("product-select").check();
  const calls: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "POST" && /\/api\/proxy\/admin\/products\//.test(sent.url())) calls.push(new URL(sent.url()).pathname);
  });
  await page.getByTestId("bulk-delete").click();
  const confirm = page.getByTestId("confirm-dialog");
  await expect(confirm).toContainText("منتجين");
  await confirm.getByTestId("confirm-submit").click();
  const outcome = page.getByTestId("product-delete-outcome");
  await expect(outcome).toHaveAttribute("data-deleted", "1");
  await expect(outcome).toHaveAttribute("data-archived", "1");
  await expect(outcome.locator('[data-reason="inventory_history"]')).toBeVisible();
  expect(calls.sort()).toEqual([`/api/proxy/admin/products/${stocked.id}/delete`, `/api/proxy/admin/products/${unused.id}/delete`].sort());
  expect((await api(request, "GET", `/admin/products/${unused.id}`)).status).toBe(404);
  expect((await api(request, "GET", `/admin/products/${stocked.id}`)).body.status).toBe("archived");
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
