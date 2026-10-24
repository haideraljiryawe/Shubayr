import type { APIRequestContext } from "@playwright/test";
import { LAUNCH_MODULES } from "../../src/lib/modules";
import { expect, test } from "./fixtures";
import {
  API,
  CUSTOMER_PHONE,
  KNOWN_PASSWORD,
  activateStaff,
  adminApiToken,
  apiLogin,
  bearer,
  createStaff,
  phoneToken,
  requireLiveApi,
  servedAddressId,
  uiLogin,
  uiLoginAsAdmin,
} from "./helpers";
import { hydrated, toggleLocale } from "./shell";

/**
 * PR A17 (Ahmed's visual review, final part) with exactly the launch
 * modules: CI serves them from their own admin server (ADMIN_LAUNCH_ORIGIN);
 * locally, run this spec with ADMIN_MODULES set to the launch set.
 *
 * - the role (preset names) under the name in the account menu, in both
 *   languages, following a language switch without a reload;
 * - deleting one product: the server's preview is shown in advance (delete
 *   for a never-used product, archive with its reasons for one with orders);
 * - bulk delete: the preview's counts, then ONE bulk-delete call whose
 *   result matches them.
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
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());

async function api(request: APIRequestContext, method: "GET" | "POST", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

type Product = { id: string; name_ar: string; name_en: string; variants: Array<{ id: string }> };

async function newProduct(request: APIRequestContext, label: string, sellable = false): Promise<Product> {
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `A17 ${label} ${run}`,
    name_ar: `منتج ${label} ${run}`,
    price: 9000,
    discount_type: null,
    tracks_expiry: false,
    status: sellable ? "active" : "hidden",
    published: sellable,
    variants: [{ sku: `A17-${label}-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body as Product;
}

async function stock(request: APIRequestContext, product: Product, label: string) {
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `a17-open-${label}-${run}`,
    document_date: today(),
    lines: [{ variant_id: product.variants[0].id, location_id: LOCATION, quantity: "5", unit_cost_iqd: "5000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
}

/** A product a customer has ordered: order history (and the stock it was sold from). */
async function ordered(request: APIRequestContext, label: string): Promise<Product> {
  const product = await newProduct(request, label, true);
  await stock(request, product, label);
  const headers = bearer(await phoneToken(request, CUSTOMER_PHONE));
  const addressId = await servedAddressId(request, headers, CUSTOMER_PHONE);
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const item of cart.items ?? []) await request.delete(`${API}/cart/items/${item.id}`, { headers });
  const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: product.id, variant_id: product.variants[0].id, quantity: 1 } });
  expect(added.ok(), await added.text()).toBe(true);
  const placed = await request.post(`${API}/orders`, {
    headers: { ...headers, "Idempotency-Key": `a17-${label}-${run}` },
    data: { address_id: addressId, payment_method: "cod" },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return product;
}

/* ------------------------------------------------------------------ role */

test("the account menu names the role under the person, in the interface language", async ({ page, request }) => {
  // Two presets: listed with the language's own separator.
  const staff = await activateStaff(request, await createStaff(request, { presets: ["catalog_editor", "stock_controller"], prefix: "a17role" }));
  const login = await apiLogin(request, staff.username, KNOWN_PASSWORD);
  const me = await (await request.get(`${API}/me`, { headers: bearer(login.body.access_token as string) })).json();
  const presets = me.presets as Array<{ name: string; name_ar: string; name_en: string }>;
  expect(presets.map((preset) => preset.name).sort()).toEqual(["catalog_editor", "stock_controller"]);
  const ar = presets.map((preset) => preset.name_ar);
  const en = presets.map((preset) => preset.name_en);

  await uiLogin(page, staff.username, KNOWN_PASSWORD);
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await hydrated(page, "account-menu");
  const role = page.getByTestId("current-user-role");
  await expect(role).toHaveText(ar.join("، "));
  await expect(role).toHaveAttribute("title", ar.join("، "));
  await page.getByTestId("account-menu").click();
  await expect(page.getByTestId("account-role")).toHaveText(ar.join("، "));
  await page.keyboard.press("Escape");

  // English, without a reload: a marker on the window survives.
  await page.evaluate(() => Object.assign(window, { a17NoReload: true }));
  await toggleLocale(page);
  await expect(role).toHaveText(en.join(", "));
  expect(await page.evaluate(() => (window as unknown as { a17NoReload?: boolean }).a17NoReload)).toBe(true);
  await page.getByTestId("account-menu").click();
  await expect(page.getByTestId("account-role")).toHaveText(en.join(", "));
  await page.keyboard.press("Escape");
  await toggleLocale(page);
  await expect(role).toHaveText(ar.join("، "));
});

test("the owner's role is the owner preset's name, Arabic and English", async ({ page }) => {
  await uiLoginAsAdmin(page);
  const role = page.getByTestId("current-user-role");
  await expect(role).toHaveText("صاحب المتجر");
  await toggleLocale(page);
  await expect(role).toHaveText("Store owner");
  await toggleLocale(page);
});

/* ---------------------------------------------------------- single delete */

test("one product never used: the preview says it will be deleted, and it is", async ({ page, request }) => {
  const unused = await newProduct(request, "UNUSED");
  await uiLoginAsAdmin(page);
  await page.goto(`/catalog/products/${unused.id}`);
  await hydrated(page, "product-delete");
  await page.getByTestId("product-delete").click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog.getByTestId("product-delete-preview")).toHaveAttribute("data-outcome", "delete");
  await expect(dialog.getByTestId("product-delete-explain")).toContainText("سيُحذف هذا المنتج نهائياً لأنه لم يُستخدم بعد");
  const submit = dialog.getByTestId("confirm-submit");
  await expect(submit).toHaveText(/حذف المنتج/);
  await expect(submit).toHaveClass(/bg-error|danger/);
  await submit.click();
  await page.waitForURL(/\/catalog\/products$/);
  expect((await api(request, "GET", `/admin/products/${unused.id}`)).status).toBe(404);
});

test("one product with orders: the preview says it will be archived and why; archived and hidden by default", async ({ page, request }) => {
  const sold = await ordered(request, "SOLD");
  await uiLoginAsAdmin(page);
  await page.goto(`/catalog/products/${sold.id}`);
  await hydrated(page, "product-delete");
  await page.getByTestId("product-delete").click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog.getByTestId("product-delete-preview")).toHaveAttribute("data-outcome", "archive");
  await expect(dialog.getByTestId("product-delete-explain")).toContainText("لذلك سيُؤرشف");
  await expect(dialog.locator('[data-reason="order_history"]')).toHaveText("يوجد في طلبات سابقة");
  await expect(dialog.getByTestId("confirm-submit")).toHaveText(/أرشفة/);
  await expect(dialog.getByTestId("confirm-submit")).not.toHaveClass(/bg-error/);
  await dialog.getByTestId("confirm-submit").click();
  const outcome = page.getByTestId("product-delete-outcome");
  await expect(outcome).toHaveAttribute("data-archived", "1");
  await expect(outcome.locator('[data-reason="order_history"]')).toBeVisible();
  expect((await api(request, "GET", `/admin/products/${sold.id}`)).body.status).toBe("archived");

  await page.goto(`/catalog/products?q=${encodeURIComponent(sold.name_en)}`);
  await expect(page.getByTestId("products-table")).not.toContainText(sold.name_ar);
  await page.goto(`/catalog/products?q=${encodeURIComponent(sold.name_en)}&status=archived`);
  await expect(page.getByTestId("products-table")).toContainText(sold.name_ar);
});

/* ------------------------------------------------------------ bulk delete */

test("bulk: the preview counts what will happen, ONE bulk-delete applies it, and the result matches", async ({ page, request }) => {
  const unusedA = await newProduct(request, "BULKA");
  const unusedB = await newProduct(request, "BULKB");
  const stocked = await newProduct(request, "BULKC");
  await stock(request, stocked, "BULKC");
  await uiLoginAsAdmin(page);
  await page.goto(`/catalog/products?q=${encodeURIComponent(`A17 BULK`)}`);
  const rows = page.getByTestId("products-table").locator("tr").filter({ hasText: run });
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) await row.getByTestId("product-select").check();

  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  page.on("request", (sent) => {
    if (sent.method() === "POST" && /\/api\/proxy\/admin\/products\//.test(sent.url())) {
      calls.push({ path: new URL(sent.url()).pathname, body: sent.postDataJSON() });
    }
  });
  await page.getByTestId("bulk-delete").click();
  const dialog = page.getByTestId("confirm-dialog");
  const preview = dialog.getByTestId("bulk-preview");
  await expect(preview).toHaveAttribute("data-state", "ready");
  await expect(preview).toHaveAttribute("data-delete", "2");
  await expect(preview).toHaveAttribute("data-archive", "1");
  await expect(preview).toHaveAttribute("data-failed", "0");
  await expect(dialog.getByTestId("bulk-preview-delete")).toContainText("سيُحذف منتجان");
  // The archive group opens to show which product and why.
  await dialog.getByTestId("bulk-preview-archive").locator("summary").click();
  await expect(dialog.getByTestId("bulk-preview-archive").getByTestId("bulk-preview-line")).toContainText(stocked.name_ar);
  await expect(dialog.getByTestId("bulk-preview-archive").getByTestId("bulk-preview-line")).toContainText("له حركات مخزون");
  await expect(dialog.getByTestId("confirm-submit")).toHaveText("حذف 2 وأرشفة 1");
  await dialog.getByTestId("confirm-submit").click();

  const outcome = page.getByTestId("product-delete-outcome");
  await expect(outcome).toHaveAttribute("data-deleted", "2");
  await expect(outcome).toHaveAttribute("data-archived", "1");
  await expect(outcome).toHaveAttribute("data-failed", "0");
  await expect(outcome.locator('[data-reason="inventory_history"]').first()).toBeVisible();
  await expect(page.getByTestId("bulk-bar")).toHaveCount(0);

  // The preview (twice under the dev server's Strict Mode), then exactly one bulk-delete with an operation id.
  const paths = calls.map((call) => call.path);
  expect(paths.at(-1)).toBe("/api/proxy/admin/products/bulk-delete");
  expect(new Set(paths.slice(0, -1))).toEqual(new Set(["/api/proxy/admin/products/delete-preview"]));
  const bulk = calls.at(-1)!.body as { operation_id: string; ids: string[] };
  expect(bulk.operation_id.length).toBeGreaterThanOrEqual(8);
  expect([...bulk.ids].sort()).toEqual([unusedA.id, unusedB.id, stocked.id].sort());
  expect((await api(request, "GET", `/admin/products/${unusedA.id}`)).status).toBe(404);
  expect((await api(request, "GET", `/admin/products/${unusedB.id}`)).status).toBe(404);
  expect((await api(request, "GET", `/admin/products/${stocked.id}`)).body.status).toBe("archived");

  // Replaying that operation id gives the original answer and applies nothing twice.
  const replay = await api(request, "POST", "/admin/products/bulk-delete", bulk);
  expect(replay.status, JSON.stringify(replay.body)).toBe(201);
  expect(replay.body.operation_id).toBe(bulk.operation_id);
});
