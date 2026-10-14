import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { API, adminApiToken, bearer, requireLiveApi, uiLoginAsAdmin } from "./helpers";
import { PNG_1X1, catalogWorkbook, zip, type ProductLine } from "./xlsx";

/**
 * The Excel catalog import, the bulk-image ZIP and the product list at scale,
 * in Arabic at tablet width, through the BFF against a real API (15.1):
 *
 *   preview writes nothing → a double-clicked commit is one import → the
 *   products are listed; a file with errors (cell references, filters, the
 *   report download); updating by SKU; "create missing" categories and
 *   brands; a Stock sheet → one opening-stock document; a ZIP with matched
 *   and unmatched pictures; a background (>500 rows) preview; and, over a few
 *   thousand seeded products, server-side filters, SKU search, sorting and a
 *   500-product bulk change.
 *
 * Every SKU and name is unique to the run, so the suite repeats on one database.
 */

test.describe.configure({ mode: "serial" });
// An action on a missing or hidden control fails instead of waiting out the test.
test.use({ actionTimeout: 30_000 });

const RUN = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
const TABLET = { width: 820, height: 1180 };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DEPARTMENT = "Electronics";
const SUBCATEGORY = "Phones & Accessories";
const LOCATION = "A-01-01-01";

test.beforeEach(async ({ request, page }) => {
  await requireLiveApi(request);
  await page.setViewportSize(TABLET);
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.documentElement.appendChild(style);
  });
});

/* ------------------------------------------------------------ helpers */

async function api(request: APIRequestContext, method: "GET" | "POST", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

type Import = { id: string; status: string; preview: { counts: Record<string, number> } | null; opening_id: string | null };

/** Uploads a workbook straight to the API and waits for its check. */
async function apiPreview(request: APIRequestContext, file: Buffer, createMissing = false): Promise<Import> {
  const response = await request.post(`${API}/admin/catalog-imports/preview?create_missing=${createMissing}`, {
    headers: bearer(await adminApiToken(request)),
    multipart: { file: { name: "seed.xlsx", mimeType: XLSX, buffer: file } },
  });
  expect(response.status(), await response.text()).toBe(201);
  let item = (await response.json()) as Import;
  for (let tries = 0; ["queued", "validating"].includes(item.status) && tries < 120; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    item = (await api(request, "GET", `/admin/catalog-imports/${item.id}`)).body as Import;
  }
  expect(item.status).toBe("ready");
  return item;
}

async function apiImport(request: APIRequestContext, file: Buffer, createMissing = false): Promise<Import> {
  const item = await apiPreview(request, file, createMissing);
  const commit = await api(request, "POST", `/admin/catalog-imports/${item.id}/commit`, { operation_id: `seed-${item.id}` });
  expect(commit.status, JSON.stringify(commit.body)).toBe(201);
  return item;
}

type Product = {
  id: string;
  name_ar: string;
  category_id: string;
  status: string;
  images: unknown[];
  variants: Array<{ sku: string; effective_price: number }>;
};

async function products(request: APIRequestContext, query: string): Promise<{ total: number; data: Product[] }> {
  const { status, body } = await api(request, "GET", `/admin/products?${query}`);
  expect(status).toBe(200);
  return body as { total: number; data: Product[] };
}

async function productBySku(request: APIRequestContext, sku: string): Promise<Product | undefined> {
  const page = await products(request, `q=${encodeURIComponent(sku)}&per_page=20`);
  return page.data.find((product) => product.variants.some((variant) => variant.sku === sku));
}

async function hydrated(page: Page, testId: string) {
  await page.waitForFunction((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    return !!element && Object.keys(element).some((key) => key.startsWith("__reactProps"));
  }, testId);
}

/** Uploads a workbook on the import screen and waits for its preview. */
async function uploadWorkbook(page: Page, file: Buffer, { createMissing = false, name = "catalog.xlsx" } = {}) {
  await page.goto("/catalog/import");
  await hydrated(page, "import-file");
  await page.getByTestId("import-file").setInputFiles({ name, mimeType: XLSX, buffer: file });
  if (createMissing) await page.getByTestId("import-create-missing").check();
  await page.getByTestId("import-check").click();
  await expect(page.getByTestId("import-current")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await hydrated(page, "import-filter-all");
}

const line = (sku: string, patch: Partial<ProductLine> = {}): ProductLine => ({
  category1: DEPARTMENT,
  category2: SUBCATEGORY,
  nameAr: `منتج ${sku}`,
  nameEn: `Product ${sku}`,
  sku,
  price: 10000,
  status: "hidden",
  ...patch,
});

/* ------------------------------------------------------------ the import */

test("preview writes nothing; a double-clicked commit is one import; the products are listed", async ({ page, request }) => {
  const file = catalogWorkbook([
    // Two variants of one product (same names, category and brand) …
    line(`${RUN}-A1`, { nameAr: `قميص ${RUN}`, nameEn: `Shirt ${RUN}`, attributes: "color=red;size=M" }),
    line(`${RUN}-A2`, { nameAr: `قميص ${RUN}`, nameEn: `Shirt ${RUN}`, attributes: "color=blue;size=M", price: 12000 }),
    // … another product, and one with no status (a warning: it stays hidden).
    line(`${RUN}-B1`),
    line(`${RUN}-C1`, { status: "" }),
  ]);

  await uiLoginAsAdmin(page);
  await uploadWorkbook(page, file);

  await expect(page.getByTestId("import-filter-create")).toHaveAttribute("data-count", "3");
  await expect(page.getByTestId("import-filter-warning")).toHaveAttribute("data-count", "1");
  await expect(page.getByTestId("import-filter-error")).toHaveAttribute("data-count", "0");
  await page.getByTestId("import-filter-warning").click();
  await expect(page.getByTestId("import-row")).toHaveCount(1);
  await expect(page.getByTestId("import-row").first()).toHaveAttribute("data-sku", `${RUN}-C1`);
  await expect(page.getByTestId("import-issue-cell")).toHaveText("Products+Variants!Q5");
  await expect(page.getByTestId("import-issue")).toHaveAttribute("data-code", "STATUS_DEFAULTED");

  // The preview wrote nothing.
  expect((await products(request, `q=${RUN}-&per_page=5`)).total).toBe(0);

  // A double click sends ONE commit; the result names what was applied.
  const commits: string[] = [];
  page.on("request", (candidate) => {
    if (candidate.method() === "POST" && candidate.url().includes("/commit")) commits.push(candidate.url());
  });
  await hydrated(page, "import-commit");
  await page.getByTestId("import-commit").dblclick();
  await expect(page.getByTestId("import-result")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("import-result-created")).toContainText("4");
  expect(commits).toHaveLength(1);

  // The commit's id is fixed per import: a replay answers the same import; another id is refused.
  const id = await page.getByTestId("import-current").getAttribute("data-id");
  const operationId = await page.evaluate((key) => sessionStorage.getItem(key), `shubayr.import-commit.${id}`);
  expect(operationId).toBeTruthy();
  const replay = await api(request, "POST", `/admin/catalog-imports/${id}/commit`, { operation_id: operationId });
  expect([200, 201]).toContain(replay.status);
  expect(replay.body.id).toBe(id);
  const second = await api(request, "POST", `/admin/catalog-imports/${id}/commit`, { operation_id: `other-${RUN}` });
  expect(second.status).toBe(409);
  expect(second.body.code).toBe("CATALOG_IMPORT_ALREADY_COMMITTED");

  // Three products, one of them with two variants.
  const imported = await products(request, `q=${RUN}-&per_page=20`);
  expect(imported.total).toBe(3);
  const shirt = await productBySku(request, `${RUN}-A2`);
  expect(shirt?.variants.map((variant) => variant.sku).sort()).toEqual([`${RUN}-A1`, `${RUN}-A2`]);
  expect(shirt?.status).toBe("hidden");

  // The product list finds it by a variant's SKU.
  await page.goto(`/catalog/products?q=${RUN}-A2`);
  await expect(page.getByTestId("product-link")).toHaveCount(1);
  await expect(page.getByTestId("product-link")).toHaveText(`قميص ${RUN}`);

  // The history shows who ran it, its state and counts.
  await page.goto(`/catalog/import?id=${id}`);
  await expect(page.getByTestId("import-result")).toBeVisible();
  const row = page.locator(`[data-testid="import-history-row"][data-id="${id}"]`);
  await expect(row).toHaveAttribute("data-status", "completed");
  await expect(row.getByTestId("import-history-who")).toHaveText("أنت");
  await expect(row.getByTestId("import-history-counts")).toContainText("4 جديد");
});

test("a file with errors writes nothing, shows each cell, and its report downloads", async ({ page, request }) => {
  const file = catalogWorkbook([
    line(`${RUN}-E1`),
    line(`${RUN}-E2`, { price: "" }),
    line(`${RUN}-E3`, { category2: `Nowhere ${RUN}` }),
    line(`${RUN}-E4`, { whole: "maybe" }),
  ]);
  await uiLoginAsAdmin(page);
  await uploadWorkbook(page, file, { name: "errors.xlsx" });

  await expect(page.getByTestId("import-filter-error")).toHaveAttribute("data-count", "3");
  await expect(page.getByTestId("import-filter-create")).toHaveAttribute("data-count", "1");
  await page.getByTestId("import-filter-error").click();
  await expect(page.getByTestId("import-row")).toHaveCount(3);
  const cells = await page.getByTestId("import-issue-cell").allTextContents();
  expect(cells).toEqual(expect.arrayContaining(["Products+Variants!L3", "Products+Variants!B4", "Products+Variants!K5"]));
  const codes = await page.getByTestId("import-issue").evaluateAll((items) => items.map((item) => item.getAttribute("data-code")));
  expect(codes).toEqual(expect.arrayContaining(["PRICE_REQUIRED", "CATEGORY_NOT_FOUND", "BOOLEAN_INVALID"]));
  // Explained in Arabic, with the fix.
  await expect(page.locator('[data-testid="import-issue"][data-code="BOOLEAN_INVALID"]')).toContainText("اكتب نعم أو لا");

  // Search by SKU narrows the rows.
  await page.getByTestId("import-search").fill(`${RUN}-E3`);
  await expect(page.getByTestId("import-row")).toHaveCount(1);

  // Nothing was written, not even the valid row.
  expect((await products(request, `q=${RUN}-E&per_page=5`)).total).toBe(0);

  // The validation report downloads as a CSV Excel opens in UTF-8.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("import-report").click()]);
  expect(download.suggestedFilename()).toMatch(/^shubayr-import-[0-9a-f]{8}-report\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks);
  expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = csv.toString("utf8");
  expect(text).toContain('"sheet","row","sku"');
  expect(text).toContain("Products+Variants!L3");
  expect(text).toContain("CATEGORY_NOT_FOUND");

  // Applying would apply the one valid row only.
  await expect(page.getByTestId("import-commit")).toContainText("صف واحد");
});

test("a row whose SKU exists updates that product", async ({ page, request }) => {
  const sku = `${RUN}-U1`;
  await apiImport(request, catalogWorkbook([line(sku, { nameAr: `قديم ${RUN}`, price: 5000 })]));
  expect((await productBySku(request, sku))?.variants[0].effective_price).toBe(5000);

  await uiLoginAsAdmin(page);
  await uploadWorkbook(page, catalogWorkbook([line(sku, { nameAr: `جديد ${RUN}`, price: 7500 })]));
  await expect(page.getByTestId("import-filter-update")).toHaveAttribute("data-count", "1");
  await expect(page.getByTestId("import-row").first()).toHaveAttribute("data-action", "update");
  await page.getByTestId("import-commit").click();
  await expect(page.getByTestId("import-result-updated")).toContainText("1");

  const product = await productBySku(request, sku);
  expect(product?.name_ar).toBe(`جديد ${RUN}`);
  expect(product?.variants[0].effective_price).toBe(7500);
  expect((await products(request, `q=${sku}&per_page=5`)).total).toBe(1);
});

test("“create missing” adds hidden categories (two levels) and the brand", async ({ page, request }) => {
  const department = `Imported ${RUN} | مستورد ${RUN}`;
  const subcategory = `Sub ${RUN} | فرعي ${RUN}`;
  const brand = `Brand ${RUN} | علامة ${RUN}`;
  const file = catalogWorkbook([line(`${RUN}-M1`, { category1: department, category2: subcategory, brand })]);

  await uiLoginAsAdmin(page);
  // Without the option: the row is an error naming the missing category and brand.
  await uploadWorkbook(page, file);
  await expect(page.getByTestId("import-filter-error")).toHaveAttribute("data-count", "1");
  const codes = await page.getByTestId("import-issue").evaluateAll((items) => items.map((item) => item.getAttribute("data-code")));
  expect(codes).toEqual(expect.arrayContaining(["CATEGORY_NOT_FOUND", "BRAND_NOT_FOUND"]));
  await expect(page.getByTestId("import-commit-card")).toContainText("لا توجد صفوف سليمة");

  // With it: a new product, under new hidden categories and a new brand.
  await uploadWorkbook(page, file, { createMissing: true });
  await expect(page.getByTestId("import-filter-create")).toHaveAttribute("data-count", "1");
  await expect(page.getByTestId("import-filter-error")).toHaveAttribute("data-count", "0");
  await page.getByTestId("import-commit").click();
  await expect(page.getByTestId("import-result-created")).toContainText("1");

  const tree = (await api(request, "GET", "/admin/categories")).body as Array<{
    id: string;
    name_en: string;
    is_visible: boolean;
    children: Array<{ id: string; name_en: string; is_visible: boolean }>;
  }>;
  const root = tree.find((node) => node.name_en === `Imported ${RUN}`);
  expect(root?.is_visible).toBe(false);
  const child = root?.children.find((node) => node.name_en === `Sub ${RUN}`);
  expect(child?.is_visible).toBe(false);
  const product = await productBySku(request, `${RUN}-M1`);
  expect(product?.category_id).toBe(child?.id);
  const brands = (await api(request, "GET", `/admin/brands?q=${encodeURIComponent(`Brand ${RUN}`)}`)).body;
  const list = (Array.isArray(brands) ? brands : brands.data) as Array<{ name_en: string }>;
  expect(list.map((item) => item.name_en)).toContain(`Brand ${RUN}`);
});

test("a Stock sheet becomes one opening-stock document", async ({ page, request }) => {
  const sku = `${RUN}-S1`;
  const file = catalogWorkbook([line(sku)], [{ sku, location: LOCATION, quantity: 7, cost: 1500 }]);
  await uiLoginAsAdmin(page);
  await uploadWorkbook(page, file, { name: "stock.xlsx" });
  // The product row and its stock row.
  await expect(page.getByTestId("import-filter-create")).toHaveAttribute("data-count", "2");
  await expect(page.getByTestId("import-commit-card")).toContainText("مستند مخزون افتتاحي واحدًا");
  await page.getByTestId("import-commit").click();
  await expect(page.getByTestId("import-result-opening")).toBeVisible({ timeout: 60_000 });

  const id = await page.getByTestId("import-current").getAttribute("data-id");
  const item = (await api(request, "GET", `/admin/catalog-imports/${id}`)).body as Import;
  expect(item.opening_id).toBeTruthy();
  const opening = await api(request, "GET", `/admin/inventory/documents/opening/${item.opening_id}`);
  expect(opening.status).toBe(200);
  const lines = (opening.body as { lines: Array<{ quantity: number | string; unit_cost_iqd?: number | string }> }).lines;
  expect(lines).toHaveLength(1);
  expect(Number(lines[0].quantity)).toBe(7);
  expect(Number(lines[0].unit_cost_iqd)).toBe(1500);

  await page.getByTestId("import-result-opening").click();
  await expect(page).toHaveURL(new RegExp(`/inventory/documents/opening/${item.opening_id}`));
  await expect(page.getByText(sku).first()).toBeVisible();
});

/* ------------------------------------------------------------ bulk images */

test("a picture ZIP attaches matched files by SKU and lists the unmatched", async ({ page, request }) => {
  const archive = zip([
    { name: `${RUN}-A1.png`, data: PNG_1X1 },
    { name: `${RUN}-A1-2.png`, data: PNG_1X1 },
    { name: `${RUN}-B1.png`, data: PNG_1X1 },
    { name: `NOPE-${RUN}.png`, data: PNG_1X1 },
    { name: "notes.txt", data: Buffer.from("ignored") },
  ]);
  const shirt = await productBySku(request, `${RUN}-A1`);
  expect(shirt, "the first test imported the shirt").toBeTruthy();
  const before = shirt?.images.length ?? 0;

  await uiLoginAsAdmin(page);
  await page.goto("/catalog/images");
  await hydrated(page, "images-file");
  await page.getByTestId("images-file").setInputFiles({ name: "pictures.zip", mimeType: "application/zip", buffer: archive });
  await page.getByTestId("images-upload").click();
  await expect(page.getByTestId("images-result")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("images-matched-count")).toHaveAttribute("data-count", "3");
  await expect(page.getByTestId("images-unmatched-count")).toHaveAttribute("data-count", "1");
  await expect(page.getByTestId("images-matched-product")).toHaveCount(2);
  await expect(page.getByTestId("images-unmatched-file")).toHaveText(`NOPE-${RUN}.png`);

  expect((await productBySku(request, `${RUN}-A1`))?.images.length).toBe(before + 2);
  await page.locator(`[data-testid="images-matched-product"][data-sku="${RUN}-A1"]`).getByTestId("images-product-link").click();
  await expect(page).toHaveURL(new RegExp(`/catalog/products/${shirt?.id}`));
});

/* ------------------------------------------------------------ at scale */

const SCALE = 3000;
const CHUNK = 250;

test("thousands of products: background preview, server-side filters, SKU search, sort and a 500-product bulk change", async ({ page, request }) => {
  test.setTimeout(900_000);
  const prefix = `${RUN}-Z`;
  const sku = (index: number) => `${prefix}-${String(index).padStart(4, "0")}`;

  // Seed in chunks the API commits within its transaction limit (see the PR's backend gaps).
  for (let start = 0; start < SCALE; start += CHUNK) {
    const lines = Array.from({ length: CHUNK }, (_, offset) => {
      const index = start + offset;
      return line(sku(index), {
        nameAr: `صنف ${prefix} ${String(index).padStart(4, "0")}`,
        nameEn: `Item ${prefix} ${String(index).padStart(4, "0")}`,
        status: index % 3 === 0 ? "active" : "hidden",
        lowStock: 5,
      });
    });
    // The first chunk brings stock: 10 in stock, 10 low.
    const stock =
      start === 0
        ? [
            ...Array.from({ length: 10 }, (_, i) => ({ sku: sku(i + 1), location: LOCATION, quantity: 50, cost: 1000 })),
            ...Array.from({ length: 10 }, (_, i) => ({ sku: sku(i + 101), location: LOCATION, quantity: 2, cost: 1000 })),
          ]
        : undefined;
    await apiImport(request, catalogWorkbook(lines, stock));
  }
  // Two of them get pictures.
  const pictures = await request.post(`${API}/admin/catalog-images/bulk?operation_id=scale-${RUN}`, {
    headers: bearer(await adminApiToken(request)),
    multipart: {
      file: { name: "scale.zip", mimeType: "application/zip", buffer: zip([{ name: `${sku(7)}.png`, data: PNG_1X1 }, { name: `${sku(8)}.png`, data: PNG_1X1 }]) },
    },
  });
  expect(pictures.status()).toBe(201);

  const all = await products(request, `q=${prefix}&per_page=1`);
  expect(all.total).toBe(SCALE);

  await uiLoginAsAdmin(page);

  // A large file is checked in the background, with progress, and writes nothing.
  const big = catalogWorkbook(Array.from({ length: 600 }, (_, index) => line(`${RUN}-Q-${index}`)));
  await page.goto("/catalog/import");
  await hydrated(page, "import-file");
  await page.getByTestId("import-file").setInputFiles({ name: "big.xlsx", mimeType: XLSX, buffer: big });
  const [previewResponse] = await Promise.all([
    page.waitForResponse((candidate) => candidate.url().includes("/api/catalog-imports/preview")),
    page.getByTestId("import-check").click(),
  ]);
  expect(((await previewResponse.json()) as Import).status).toBe("queued");
  await expect(page.getByTestId("import-current")).toHaveAttribute("data-status", "ready", { timeout: 120_000 });
  await expect(page.getByTestId("import-filter-create")).toHaveAttribute("data-count", "600");
  await expect(page.getByTestId("import-row")).toHaveCount(50);
  await expect(page.getByTestId("import-next-page")).toBeEnabled();
  expect((await products(request, `q=${RUN}-Q&per_page=1`)).total).toBe(0);

  const range = page.getByTestId("table-range");
  const listed = async () => Number(((await range.textContent()) ?? "").replace(/[^\d\s]/g, " ").trim().split(/\s+/).pop());

  // Server-side filters over the whole catalog, not the first page.
  await page.goto(`/catalog/products?q=${prefix}`);
  await expect.poll(listed).toBe(SCALE);
  await page.goto(`/catalog/products?q=${prefix}&status=active`);
  await expect.poll(listed).toBe(SCALE / 3);
  await page.goto(`/catalog/products?q=${prefix}&stock=low_stock`);
  await expect.poll(listed).toBe(10);
  await page.goto(`/catalog/products?q=${prefix}&stock=in_stock`);
  await expect.poll(listed).toBe(10);
  await page.goto(`/catalog/products?q=${prefix}&image=with`);
  await expect.poll(listed).toBe(2);

  // Search finds one SKU among thousands.
  await page.goto(`/catalog/products?q=${sku(2345)}`);
  await expect(page.getByTestId("product-link")).toHaveCount(1);
  await expect(page.getByTestId("product-link")).toHaveText(`صنف ${prefix} 2345`);

  // Sorted by SKU in the database.
  await page.goto(`/catalog/products?q=${prefix}&status=hidden`);
  await hydrated(page, "sort-sku");
  await page.getByTestId("sort-sku").click();
  await expect(page).toHaveURL(/sort=sku/);
  await expect(page.getByTestId("product-link").first()).toHaveText(`صنف ${prefix} 0001`);

  // A bulk move of every matching product the API takes at once (500 of 2,000).
  const tree = (await api(request, "GET", "/admin/categories")).body as Array<{ name_en: string; children: Array<{ id: string }> }>;
  const target = tree.find((node) => node.name_en === DEPARTMENT)?.children.find((child) => child.id !== all.data[0].category_id);
  expect(target, "a second seeded subcategory").toBeTruthy();
  await hydrated(page, "products-select-all");
  await page.getByTestId("products-select-all").check();
  await page.getByTestId("bulk-select-matching").click();
  await expect(page.getByTestId("bulk-count")).toContainText("500");
  await page.getByTestId("bulk-category").selectOption(target!.id);
  await page.getByTestId("bulk-category-apply").click();
  await expect(page.getByTestId("bulk-outcome")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("bulk-outcome")).toContainText("500");
  await expect(page.locator('[data-testid="bulk-result"][data-status="updated"]')).toHaveCount(500);
  expect((await products(request, `q=${prefix}&category_id=${target!.id}&per_page=1`)).total).toBe(500);
});
