import { deflateSync } from "node:zlib";
import type { APIRequestContext, Page } from "@playwright/test";
import { LAUNCH_MODULES } from "../../src/lib/modules";
import { expect, test } from "./fixtures";
import { API, activateStaff, adminApiToken, bearer, createStaff, placeOrder, randomWorkPhone, requireLiveApi, switchUser, uiLoginAsAdmin } from "./helpers";

/**
 * PR A12 (contracts 17.7.0 and 17.8.0) with exactly the launch module set
 * (LAUNCH_MODULES): CI serves it from its own admin server
 * (ADMIN_LAUNCH_ORIGIN); locally, run this spec with ADMIN_MODULES set to the
 * launch set. Anywhere else it skips.
 *
 * - banners: a product action (and a warning for a hidden product), two
 *   image-only default banners, the two-defaults rule refusing a delete, and
 *   one atomic reorder;
 * - Settings → Recently Added saved within the API's bounds;
 * - a per-order limit saved on a product;
 * - restock paid now (one atomic call) and owed, with totals shown to a
 *   purchaser without cost.view;
 * - supplier search on the server, and "recent" from the API's order;
 * - a courier company → handover → delivery → its cash handed in.
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
/** Every default banner this spec creates carries this prefix, so a rerun can tidy up after an earlier one. */
const DEFAULT_PREFIX = "A12 default";
const digits = (text: string | null) => (text ?? "").replace(/[^\d]/g, "");

async function api(request: APIRequestContext, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

/** A solid-colour 2:1 PNG, uploaded through the media API. */
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buffer: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([r, g, b], 1 + x * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function uploadPicture(request: APIRequestContext, colour: [number, number, number]): Promise<string> {
  const upload = await request.post(`${API}/media/images`, {
    headers: bearer(await adminApiToken(request)),
    multipart: { file: { name: "banner.png", mimeType: "image/png", buffer: png(1600, 800, colour) } },
  });
  expect(upload.status()).toBe(201);
  return (await upload.json()).public_url as string;
}

async function newProduct(request: APIRequestContext, label: string, over: Record<string, unknown> = {}) {
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `A12 ${label} ${run}`,
    name_ar: `منتج ${label} ${run}`,
    price: 12000,
    discount_type: null,
    tracks_expiry: false,
    status: "active",
    published: true,
    variants: [{ sku: `A12-${label}-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
    ...over,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body as { id: string; name_ar: string; name_en: string; variants: Array<{ id: string; sku: string }> };
}

async function allBanners(request: APIRequestContext) {
  const page = await api(request, "GET", "/admin/banners?per_page=100");
  return page.body.data as Array<{ id: string; internal_name: string; is_default: boolean; effective_status: string; show_text: boolean; action: { type: string; target: { id: string; available: boolean } | null } }>;
}

const usableDefaults = async (request: APIRequestContext) =>
  (await allBanners(request)).filter((banner) => banner.is_default && banner.effective_status === "active");

async function confirmDialog(page: Page) {
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toBeVisible();
  if (await dialog.getByTestId("customer-contacted").count()) {
    await dialog.getByTestId("customer-contacted").check();
    await dialog.getByTestId("customer-contact-note").fill("Customer confirmed by phone");
  }
  await dialog.getByTestId("confirm-submit").click();
  await expect(dialog).toBeHidden();
}

let tillId = "";
async function till(request: APIRequestContext): Promise<string> {
  if (tillId) return tillId;
  const created = await api(request, "POST", "/admin/cash-accounts", { name: `A12 till ${run}`, kind: "cash", currency_code: "IQD" });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  tillId = created.body.id as string;
  return tillId;
}

/* ---------------------------------------------------------------- banners */

test("banners: a product action, two image-only defaults, the two-defaults refusal and one atomic reorder", async ({ page, request }) => {
  test.setTimeout(180_000);
  const created: string[] = [];
  const shown = await newProduct(request, "BAN");
  const hidden = await newProduct(request, "HID", { status: "hidden", published: false });
  const picture = await uploadPicture(request, [20, 110, 70]);

  // Tidy up after an earlier run: defaults it left can go while two others remain.
  for (const banner of (await allBanners(request)).filter((row) => row.is_default && row.internal_name.startsWith(DEFAULT_PREFIX))) {
    await api(request, "DELETE", `/admin/banners/${banner.id}`);
  }

  try {
    await uiLoginAsAdmin(page);
    await page.goto("/catalog/banners");
    const form = page.getByTestId("banner-form");

    // 1. A banner that opens a product, picked by searching its name.
    const productBanner = `A12 product ${run}`;
    await page.getByTestId("banner-new").click();
    await form.getByTestId("banner-internal-name").fill(productBanner);
    await form.getByTestId("banner-title-ar").fill(`وصل ${run}`);
    await form.getByTestId("banner-action").selectOption("product");
    await form.getByTestId("dialog-submit").click();
    await expect(form.getByTestId("banner-target-required")).toBeVisible();
    await form.getByTestId("banner-target-product-search").fill(shown.name_ar);
    await form.getByTestId("banner-target-product-option").filter({ hasText: shown.name_ar }).first().click();
    await expect(form.getByTestId("banner-target-product-name")).toHaveText(shown.name_ar);
    await expect(form.getByTestId("banner-preview-action")).toContainText(shown.name_ar);
    // The picture comes from a saved banner's media; here it is uploaded through the form's own field.
    await form.getByTestId("banner-image-input").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: png(2400, 1200, [200, 120, 30]) });
    await form.getByTestId("banner-image-use-crop").click();
    await form.getByTestId("banner-enabled").check();
    await form.getByTestId("dialog-submit").click();
    await expect(form).toBeHidden();
    const productRow = page.getByTestId("banner-row").filter({ hasText: productBanner });
    await expect(productRow.getByTestId("banner-link-text")).toHaveAttribute("data-action", "product");
    await expect(productRow.getByTestId("banner-link-text")).toContainText(shown.name_ar);
    await expect(productRow.getByTestId("banner-target-unavailable")).toHaveCount(0);
    const stored = (await allBanners(request)).find((row) => row.internal_name === productBanner)!;
    created.push(stored.id);
    expect(stored.action).toMatchObject({ type: "product", target: { id: shown.id, available: true } });
    // Raw admin translations (17.9.0): only Arabic was typed, so English reads back empty.
    expect((await api(request, "GET", `/admin/banners/${stored.id}`)).body).toMatchObject({ title_ar: `وصل ${run}`, title_en: null });
    await productRow.getByTestId("banner-edit").click();
    await expect(form.getByTestId("banner-title-ar")).toHaveValue(`وصل ${run}`);
    await expect(form.getByTestId("banner-title-en")).toHaveValue("");
    await form.getByRole("button", { name: "إلغاء" }).last().click();
    await expect(form).toBeHidden();

    // A hidden product is still a valid target, but the row warns that customers can't see it.
    const hiddenBanner = await api(request, "POST", "/admin/banners", {
      title: `A12 hidden ${run}`,
      internal_name: `A12 hidden ${run}`,
      image_url: picture,
      is_active: false,
      action_type: "product",
      action_target_id: hidden.id,
    });
    expect(hiddenBanner.status, JSON.stringify(hiddenBanner.body)).toBe(201);
    created.push(hiddenBanner.body.id);
    expect(hiddenBanner.body.action.target.available).toBe(false);
    await page.reload();
    await expect(page.getByTestId("banner-row").filter({ hasText: `A12 hidden ${run}` }).getByTestId("banner-target-unavailable")).toBeVisible();

    // 2. Two image-only default banners: one through the form, one through the API.
    const firstDefault = `${DEFAULT_PREFIX} ${run} 1`;
    await page.getByTestId("banner-new").click();
    await form.getByTestId("banner-internal-name").fill(firstDefault);
    await form.getByTestId("banner-show-text").uncheck();
    await form.getByTestId("banner-image-input").setInputFiles({ name: "d.png", mimeType: "image/png", buffer: png(2400, 1200, [60, 60, 160]) });
    await form.getByTestId("banner-image-use-crop").click();
    // Image only: the preview draws no title and says so.
    await expect(form.getByTestId("banner-preview")).toHaveAttribute("data-show-text", "false");
    await expect(form.getByTestId("banner-preview-title")).toHaveCount(0);
    await expect(form.getByTestId("banner-preview-image-only")).toBeVisible();
    await form.getByTestId("banner-is-default").check();
    await expect(form.getByTestId("banner-default-rule")).toContainText("اثنان");
    await form.getByTestId("banner-default-priority").fill("1");
    await form.getByTestId("banner-enabled").check();
    await form.getByTestId("dialog-submit").click();
    await expect(form).toBeHidden();
    const one = (await allBanners(request)).find((row) => row.internal_name === firstDefault)!;
    created.push(one.id);
    expect(one).toMatchObject({ is_default: true, show_text: false, effective_status: "active" });
    await expect(page.getByTestId("banner-row").filter({ hasText: firstDefault }).getByTestId("banner-image-only-badge")).toBeVisible();

    const second = await api(request, "POST", "/admin/banners", {
      title: `${DEFAULT_PREFIX} ${run} 2`,
      internal_name: `${DEFAULT_PREFIX} ${run} 2`,
      image_url: picture,
      show_text: false,
      is_default: true,
      default_priority: 2,
      is_active: true,
    });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    created.push(second.body.id);

    // Only these two defaults remain usable (anything older was tidied above).
    const others = (await usableDefaults(request)).filter((row) => row.id !== one.id && row.id !== second.body.id);
    for (const row of others) expect((await api(request, "DELETE", `/admin/banners/${row.id}`)).status).toBe(204);
    expect((await usableDefaults(request)).map((row) => row.id).sort()).toEqual([one.id, second.body.id].sort());

    await page.reload();
    await expect(page.getByTestId("banner-defaults-summary")).toHaveAttribute("data-usable", "2");
    await expect(page.getByTestId("banner-defaults-short")).toHaveCount(0);

    // 3. The last two defaults are protected up front (removal.allowed=false):
    //    no delete, no switch-off — and one is replaced by another in one call.
    const protectedRow = page.getByTestId("banner-row").filter({ hasText: firstDefault });
    await expect(protectedRow.getByTestId("banner-removal-blocked")).toBeVisible();
    await expect(protectedRow.getByTestId("banner-delete")).toBeDisabled();
    await expect(protectedRow.getByTestId("banner-toggle")).toBeDisabled();
    const incomingName = `${DEFAULT_PREFIX} ${run} incoming`;
    const incoming = await api(request, "POST", "/admin/banners", {
      title: incomingName,
      internal_name: incomingName,
      image_url: picture,
      show_text: false,
      is_active: true,
    });
    expect(incoming.status, JSON.stringify(incoming.body)).toBe(201);
    created.push(incoming.body.id);
    await page.reload();
    await page.getByTestId("banner-row").filter({ hasText: firstDefault }).getByTestId("banner-swap-open").click();
    const swap = page.getByTestId("banner-swap");
    await swap.getByTestId("banner-swap-incoming").selectOption(incoming.body.id);
    await expect(swap.getByTestId("banner-swap-priority")).toHaveValue("1");
    const swapCalls: string[] = [];
    page.on("request", (sent) => {
      if (/\/api\/proxy\/admin\/banners/.test(sent.url()) && sent.method() !== "GET") swapCalls.push(`${sent.method()} ${new URL(sent.url()).pathname}`);
    });
    await swap.getByTestId("dialog-submit").click();
    await expect(swap).toBeHidden();
    expect(swapCalls).toEqual(["POST /api/proxy/admin/banners/defaults/swap"]);
    const afterSwap = await allBanners(request);
    expect(afterSwap.find((row) => row.id === incoming.body.id)).toMatchObject({ is_default: true });
    expect(afterSwap.find((row) => row.id === one.id)).toMatchObject({ is_default: false });
    expect((await usableDefaults(request)).length).toBe(2);
    // The replaced banner is a regular one now: it can be deleted.
    await expect(page.getByTestId("banner-row").filter({ hasText: firstDefault }).getByTestId("banner-delete")).toBeEnabled();

    // 4. Reorder: one atomic call with the whole order.
    const writes: string[] = [];
    page.on("request", (sent) => {
      if (/\/api\/proxy\/admin\/banners/.test(sent.url()) && sent.method() !== "GET") writes.push(`${sent.method()} ${new URL(sent.url()).pathname}`);
    });
    const rows = page.getByTestId("banner-row");
    const ids = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-banner-id")));
    const index = ids.indexOf(stored.id);
    expect(index).toBeGreaterThan(0);
    await rows.nth(index).getByTestId("banner-up").click();
    await expect(rows.nth(index - 1)).toHaveAttribute("data-banner-id", stored.id);
    expect(writes).toEqual(["PUT /api/proxy/admin/banners/order"]);
    const order = (await allBanners(request)).map((row) => row.id);
    expect(order.indexOf(stored.id)).toBe(index - 1);
  } finally {
    // Regular banners go; the last two defaults stay by design (the API keeps two).
    for (const id of created) await api(request, "DELETE", `/admin/banners/${id}`);
  }
});

/* ---------------------------------------------------------- recently added */

test("Settings → Recently Added: bounds checked, saved, and read back", async ({ page, request }) => {
  const before = (await api(request, "GET", "/admin/settings")).body.settings as Record<string, string>;
  try {
    await uiLoginAsAdmin(page);
    await page.goto("/settings");
    const form = page.getByTestId("recently-added-form");
    await form.getByTestId("recently-added-enabled").check();
    await form.getByTestId("recently-added-max-count").fill("51");
    await form.getByTestId("recently-added-window-days").fill("0");
    await form.getByTestId("recently-added-save").click();
    await expect(form).toContainText("يجب ألا يزيد عن 50");
    await expect(form).toContainText("يجب ألا يقل عن 1");
    await form.getByTestId("recently-added-max-count").fill("12");
    await form.getByTestId("recently-added-window-days").fill("٧");
    await form.getByTestId("recently-added-save").click();
    await expect(page.getByTestId("toast").last()).toContainText("حُفظت إعدادات «وصل حديثًا»");
    const after = (await api(request, "GET", "/admin/settings")).body.settings as Record<string, string>;
    expect(after).toMatchObject({ recently_added_enabled: "true", recently_added_max_count: "12", recently_added_window_days: "7" });
    await page.reload();
    await expect(form.getByTestId("recently-added-max-count")).toHaveValue("12");
    // The public feed is on now.
    expect((await request.get(`${API}/products/recently-added`)).status()).toBe(200);
  } finally {
    await api(request, "PUT", "/admin/settings", {
      settings: {
        recently_added_enabled: before.recently_added_enabled ?? "false",
        recently_added_max_count: before.recently_added_max_count ?? "10",
        recently_added_window_days: before.recently_added_window_days ?? "30",
      },
    });
  }
});

/* ---------------------------------------------------------- per-order limit */

test("product editor: a per-order limit for the whole product, prefilled with 10 when switched on", async ({ page, request }) => {
  const product = await newProduct(request, "LIM");
  await uiLoginAsAdmin(page);
  await page.goto(`/catalog/products/${product.id}`);
  await expect(page.getByTestId("product-limit-summary")).toHaveAttribute("data-enabled", "false");
  const editor = page.getByTestId("product-editor");
  await expect(editor.getByTestId("purchase-limit-max")).toHaveCount(0);
  await editor.getByTestId("purchase-limit-enabled").check();
  await expect(editor.getByTestId("purchase-limit-max")).toHaveValue("10");
  await editor.getByTestId("purchase-limit-max").fill("2.5");
  await editor.getByTestId("product-save").click();
  await expect(editor).toContainText("أدخل رقمًا صحيحًا");
  await editor.getByTestId("purchase-limit-max").fill("3");
  await editor.getByTestId("product-save").click();
  await expect(page.getByTestId("product-limit-summary")).toHaveAttribute("data-enabled", "true");
  await expect(page.getByTestId("product-limit-summary")).toContainText("3");
  let stored = (await api(request, "GET", `/admin/products/${product.id}`)).body;
  expect(stored).toMatchObject({ purchase_limit_enabled: true, purchase_limit_max_quantity: 3 });

  // Off again: the switch goes off; the stored maximum is not the editor's business.
  await page.getByTestId("purchase-limit-enabled").uncheck();
  await page.getByTestId("product-save").click();
  await expect(page.getByTestId("product-limit-summary")).toHaveAttribute("data-enabled", "false");
  stored = (await api(request, "GET", `/admin/products/${product.id}`)).body;
  expect(stored.purchase_limit_enabled).toBe(false);
});

/* ---------------------------------------------------------------- restock */

async function restockable(request: APIRequestContext, label: string) {
  const product = await newProduct(request, label);
  const opening = await api(request, "POST", "/admin/inventory/openings", {
    operation_id: `a12-open-${label}-${run}`,
    document_date: today(),
    lines: [{ variant_id: product.variants[0].id, location_id: LOCATION, quantity: "2", unit_cost_iqd: "7000" }],
  });
  expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  return product;
}

async function newSupplier(request: APIRequestContext, name: string, phone: string) {
  const created = await api(request, "POST", "/admin/suppliers", { name, phone, default_currency: "IQD", payment_terms_days: 0 });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body as { id: string; name: string };
}

test("supplier search on the server by phone; restock owed, then paid now in one call; the last cost is the API's", async ({ page, request }) => {
  test.setTimeout(180_000);
  const phone = randomWorkPhone();
  const supplier = await newSupplier(request, `A12 Najaf Supply ${run}`, phone);
  const product = await restockable(request, "RST");
  const account = await till(request);
  // A USD rate for the landed cost below (newer than any earlier spec's).
  const rate = await api(request, "POST", "/admin/exchange-rates", {
    currency_code: "USD",
    rate: "1500",
    basis: 1,
    effective_at: new Date().toISOString(),
    reason: `A12 paid-now landed cost ${run}`,
  });
  expect(rate.status, JSON.stringify(rate.body)).toBe(201);

  await uiLoginAsAdmin(page);
  // 1. Owed. The supplier is found by typing part of its phone — a server search.
  await page.goto(`/purchasing/invoices/new?restock=${product.id}`);
  let form = page.getByTestId("invoice-form");
  const searches: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "GET" && /\/api\/proxy\/admin\/suppliers\?/.test(sent.url())) searches.push(new URL(sent.url()).search);
  });
  // Never bought before: no supplier is preselected.
  await expect(form.getByTestId("invoice-supplier-search")).toBeVisible();
  await form.getByTestId("invoice-supplier-search").fill(phone.slice(-7));
  await form.getByTestId("invoice-supplier-option").filter({ hasText: supplier.name }).click();
  await expect(form.getByTestId("invoice-supplier-picked")).toHaveAttribute("data-supplier-id", supplier.id);
  expect(searches.some((query) => query.includes(`q=${phone.slice(-7)}`))).toBe(true);
  // Opening stock at 7,000 is the cost to start from (never purchased yet).
  const line = form.getByTestId("invoice-line").first();
  await expect(line.getByTestId("line-cost")).toHaveValue("7000");
  await line.getByTestId("line-cost").fill("8000");
  await line.getByTestId("line-packs").fill("2");
  await form.getByTestId("invoice-payment-owed").check();
  await form.getByTestId("invoice-review-button").click();
  await form.getByTestId("invoice-confirm").click();
  await expect(page.getByTestId("restock-result")).toBeVisible();
  const owedHref = (await page.getByTestId("restock-open-invoice").getAttribute("href")) ?? "";
  const owed = (await api(request, "GET", `/admin/purchase-invoices/${owedHref.split("/").pop()}`)).body;
  expect(owed).toMatchObject({ settlement_status: "open", remaining_currency: 16000, total_cost: 16000 });

  // 2. Paid now. The last cost now comes from that purchase; the supplier is the recent one.
  await page.goto(`/purchasing/invoices/new?restock=${product.id}`);
  form = page.getByTestId("invoice-form");
  await expect(form.getByTestId("invoice-supplier-picked")).toHaveAttribute("data-supplier-id", supplier.id);
  const last = await api(request, "GET", `/admin/purchase-costs/variants/${product.variants[0].id}/last`);
  expect(last.body).toMatchObject({ unit_cost: 8000, currency_code: "IQD", supplier: { id: supplier.id } });
  await expect(form.getByTestId("invoice-line").first().getByTestId("line-cost")).toHaveValue("8000");
  await form.getByTestId("invoice-line").first().getByTestId("line-packs").fill("3");
  await form.getByTestId("invoice-payment-now").check();
  await form.getByTestId("invoice-cash-account").selectOption(account);
  await expect(form.getByTestId("invoice-paid-amount")).toContainText("24,000");
  // Freight paid in USD on this IQD invoice: only the server knows the exact
  // total (17.9.0 pay_full_invoice_total), and paid now still works.
  await form.getByTestId("invoice-add-cost").click();
  await form.getByTestId("landed-kind").fill("Freight");
  await form.getByTestId("landed-currency").selectOption("USD");
  await form.getByTestId("landed-amount").fill("2");
  await expect(form.getByTestId("invoice-paid-amount")).toContainText("الخادم");
  await form.getByTestId("invoice-review-button").click();
  const posts: Array<{ path: string; payment: Record<string, unknown> }> = [];
  page.on("request", (sent) => {
    if (sent.method() === "POST" && /\/api\/proxy\/admin\/(purchase-invoices|supplier-payments)/.test(sent.url())) {
      posts.push({ path: new URL(sent.url()).pathname, payment: (sent.postDataJSON() as { payment?: Record<string, unknown> })?.payment ?? {} });
    }
  });
  await form.getByTestId("invoice-confirm").click();
  await expect(form.getByTestId("invoice-paid-now")).toHaveAttribute("data-settlement", "paid");
  expect(posts.map((post) => post.path)).toEqual(["/api/proxy/admin/purchase-invoices/paid-now"]);
  expect(posts[0].payment).toMatchObject({ pay_full_invoice_total: true });
  expect(posts[0].payment).not.toHaveProperty("amount");
  const paidHref = (await page.getByTestId("restock-open-invoice").getAttribute("href")) ?? "";
  const paid = (await api(request, "GET", `/admin/purchase-invoices/${paidHref.split("/").pop()}`)).body;
  // 3 × 8,000 + 2 USD × 1,500 = 27,000 IQD, all settled.
  expect(paid).toMatchObject({ settlement_status: "paid", remaining_currency: 0, total_cost: 27000 });

  // 3. "Recent" with nothing typed is the API's order: this supplier, just bought from, comes first.
  await page.goto("/purchasing/invoices/new");
  const picker = page.getByTestId("invoice-supplier");
  await expect(picker.getByTestId("invoice-supplier-option").first()).toHaveAttribute("data-supplier-id", supplier.id);

  // 4. A purchaser without cost.view sees the invoice total and balance, not the costs behind them.
  const buyer = await activateStaff(
    request,
    await createStaff(request, { permissionKeys: ["purchases.create", "suppliers.view", "inventory.view"], prefix: "buyer" }),
  );
  await switchUser(page, buyer.username, buyer.password);
  await page.goto(owedHref);
  await expect(page.getByTestId("invoice-total")).toContainText("16,000");
  await expect(page.getByTestId("invoice-remaining")).toContainText("16,000");
  await expect(page.getByTestId("invoice-total-iqd-value")).toHaveCount(0);
  await page.goto("/purchasing/invoices");
  await expect(page.getByTestId("invoice-row-total").first()).toBeVisible();
});

/* ---------------------------------------------------------- courier company */

test("a courier company: created, handed an order, delivers it with the cash, and hands the cash in", async ({ page, request }) => {
  test.setTimeout(180_000);
  const company = `شركة توصيل ${run}`;
  const account = await till(request);
  const order = await placeOrder(request);

  await uiLoginAsAdmin(page);
  await page.goto("/delivery-parties");
  await page.getByTestId("party-add-courier_company").check();
  const form = page.getByTestId("courier-form");
  await form.getByTestId("courier-submit").click();
  await expect(form).toContainText("أدخل اسم الشركة.");
  await form.getByTestId("courier-name").fill(company);
  await form.getByTestId("courier-phone").fill(randomWorkPhone());
  await form.getByTestId("courier-contact").fill("أبو علي");
  await form.getByTestId("courier-submit").click();
  await expect(page.getByTestId("courier-name")).toHaveValue("");
  let partyId = "";
  await expect
    .poll(async () => {
      const found = await api(request, "GET", `/admin/delivery-parties?kind=courier_company&q=${encodeURIComponent(company)}&per_page=5`);
      partyId = (found.body.data as Array<{ id: string; name: string }>).find((row) => row.name === company)?.id ?? "";
      return partyId;
    })
    .not.toBe("");
  const party = (await api(request, "GET", `/admin/courier-companies?q=${encodeURIComponent(company)}`)).body.data[0];
  expect(party).toMatchObject({ kind: "courier_company", contact_person: "أبو علي", user_id: null });
  // The list shows it with its kind and contact person.
  await page.goto(`/delivery-parties?kind=courier_company&q=${encodeURIComponent(company)}`);
  const row = page.getByTestId("parties-table").locator("tr").filter({ hasText: company });
  await expect(row.getByTestId("party-kind")).toHaveAttribute("data-kind", "courier_company");
  await expect(row.getByTestId("party-contact")).toHaveText("أبو علي");

  // Hand the order over to the company, then deliver it with the whole amount collected.
  await page.goto(`/orders/${order.id}`);
  for (const action of ["accept", "prepare", "markReady"]) {
    await page.getByTestId(`order-action-${action}`).click();
    await confirmDialog(page);
  }
  await page.getByTestId("party-search").fill(company);
  const option = page.locator('[data-testid="party-option"]').filter({ hasText: company }).first();
  await expect(option).toHaveAttribute("data-kind", "courier_company");
  await expect(option).toContainText("شركة توصيل");
  await option.click();
  await page.getByTestId("assign-submit").click();
  await expect(page.getByTestId("order-action-dispatch")).toBeEnabled();
  await page.getByTestId("order-action-dispatch").click();
  await confirmDialog(page);
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "dispatched");
  await page.getByTestId("order-action-deliver").click();
  const deliver = page.locator("dialog[open]");
  await expect(deliver.getByTestId("collection-fields")).toBeVisible();
  const due = digits(await deliver.getByTestId("collection-due").textContent());
  await deliver.getByTestId("collection-confirmed").check();
  await deliver.getByTestId("confirm-submit").click();
  await expect(page.getByTestId("order-detail")).toHaveAttribute("data-status", "delivered");

  // The company hands the cash in: a cash receipt allocated to the order.
  await page.goto(`/finance/cash-receipts/new?party_id=${partyId}`);
  await expect(page.getByTestId("receive-form")).toBeVisible();
  expect(digits(await page.getByTestId("receive-cash-held").textContent())).toBe(due);
  await page.getByTestId("receive-cash-account").selectOption(account);
  await page.getByTestId("receive-all-held").click();
  await page.getByTestId("allocation-auto").click();
  await page.getByTestId("receive-review-button").click();
  await page.getByTestId("receive-confirm").click();
  await expect(page.getByTestId("posting-done")).toBeVisible();
  const custody = await api(request, "GET", `/admin/delivery-parties/${partyId}/custody`);
  expect(custody.body.cash.amount).toBe(0);
  const receipts = await api(request, "GET", `/admin/cash-receipts?party_id=${partyId}&per_page=5`);
  expect(receipts.body.data[0]).toMatchObject({ allocated_amount_iqd: Number(due), unallocated_amount_iqd: 0 });
});
