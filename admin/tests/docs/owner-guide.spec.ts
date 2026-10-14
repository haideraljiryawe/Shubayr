import { deflateSync } from "node:zlib";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { API, KNOWN_PASSWORD, activateStaff, adminApiToken, bearer, createStaff, placeOrder, uiLogin } from "../live/helpers";
import { catalogWorkbook, zip } from "../live/xlsx";

/**
 * The owner's guide screenshots (docs/owner-guide), in Arabic and English.
 *
 * Not a test: it builds a small, realistic demo store through the API once
 * (departments, brands, a phone with pictures and variants, zones, tiers),
 * then photographs each screen the guide walks through. Run it against a
 * throwaway database — see playwright.docs.config.ts.
 */

test.describe.configure({ mode: "serial" });

const OUT = join(__dirname, "..", "..", "..", "docs", "owner-guide", "images");
const LOCALES = ["ar", "en"] as const;
type Locale = (typeof LOCALES)[number];

/* ------------------------------------------------------------ demo pictures */

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** A soft vertical gradient with a rounded "device" in the middle — a stand-in product photo. */
function photo(size: number, top: [number, number, number], device: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const rows: Buffer[] = [];
  const left = size * 0.32;
  const right = size * 0.68;
  const upper = size * 0.14;
  const lower = size * 0.86;
  const radius = size * 0.06;
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    const shade = 1 - (y / size) * 0.25;
    for (let x = 0; x < size; x += 1) {
      const dx = Math.max(left + radius - x, 0, x - (right - radius));
      const dy = Math.max(upper + radius - y, 0, y - (lower - radius));
      const inside = x >= left && x <= right && y >= upper && y <= lower && dx * dx + dy * dy <= radius * radius;
      const color = inside ? device : (top.map((value) => Math.round(255 - (255 - value) * shade)) as [number, number, number]);
      row.set(color, 1 + x * 3);
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------ demo data */

async function call(request: APIRequestContext, method: "GET" | "POST" | "PATCH" | "PUT", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body };
}

async function upload(request: APIRequestContext, name: string, buffer: Buffer): Promise<string> {
  const response = await request.post(`${API}/media/images`, {
    headers: bearer(await adminApiToken(request)),
    multipart: { file: { name, mimeType: "image/png", buffer } },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).public_url as string;
}

interface Category {
  id: string;
  slug: string;
  children?: Category[];
}

async function category(request: APIRequestContext, nameAr: string, nameEn: string, slug: string, parentId: string | null) {
  const tree = (await call(request, "GET", "/admin/categories")).body as Category[];
  const all = tree.flatMap((node) => [node, ...(node.children ?? [])]);
  const found = all.find((node) => node.slug === slug);
  if (found) return found.id;
  const created = await call(request, "POST", "/admin/categories", { name_ar: nameAr, name_en: nameEn, slug, parent_id: parentId });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body.id as string;
}

async function brand(request: APIRequestContext, nameAr: string, nameEn: string, slug: string) {
  const list = (await call(request, "GET", `/admin/brands?q=${slug}`)).body.data as Array<{ id: string; slug: string }>;
  const found = list.find((row) => row.slug === slug);
  if (found) return found.id;
  const created = await call(request, "POST", "/admin/brands", { name_ar: nameAr, name_en: nameEn, slug });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return created.body.id as string;
}

const demo: { phone?: string; owner?: string } = {};

/** Every shot is taken as the store owner, not the development admin. */
async function loginOwner(page: Page) {
  await uiLogin(page, demo.owner!, KNOWN_PASSWORD);
  await expect(page.getByTestId("dashboard")).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  await mkdir(OUT, { recursive: true });
  test.setTimeout(240_000);
  // Two departments with their subcategories, and two brands.
  const electronics = await category(request, "إلكترونيات", "Electronics", "electronics-demo", null);
  const phones = await category(request, "هواتف", "Phones", "phones-demo", electronics);
  await category(request, "إكسسوارات", "Accessories", "accessories-demo", electronics);
  const clothing = await category(request, "ملابس", "Clothing", "clothing-demo", null);
  await category(request, "قمصان", "Shirts", "shirts-demo", clothing);
  const samsung = await brand(request, "سامسونج", "Samsung", "samsung-demo");

  // The owner: every permission, a real name in the header.
  const owner = await activateStaff(request, await createStaff(request, { presets: ["super_admin"], prefix: "owner" }));
  await call(request, "PATCH", "/admin/staff/" + owner.id, { name: "صاحب المتجر", reason: "Owner guide screenshots" });
  demo.owner = owner.username;
  await brand(request, "أبل", "Apple", "apple-demo");

  // A phone with three pictures and two colours, in the store and in stock.
  const products = (await call(request, "GET", `/admin/products?q=${encodeURIComponent("Galaxy A15")}`)).body.data as Array<{ id: string }>;
  if (products.length) {
    demo.phone = products[0].id;
  } else {
    const images = [
      await upload(request, "a15-black.png", photo(720, [210, 225, 240], [30, 34, 40])),
      await upload(request, "a15-blue.png", photo(720, [220, 235, 250], [40, 80, 150])),
      await upload(request, "a15-side.png", photo(720, [235, 235, 235], [90, 95, 105])),
    ];
    const created = await call(request, "POST", "/admin/products", {
      category_id: phones,
      brand_id: samsung,
      name_ar: "هاتف سامسونج Galaxy A15",
      name_en: "Samsung Galaxy A15",
      description: "شاشة 6.5 بوصة، ذاكرة 128 غيغابايت، بطارية 5000 ملي أمبير.",
      price: 285000,
      discount_type: null,
      tracks_expiry: false,
      status: "active",
      published: true,
      images: images.map((url) => ({ url })),
      variants: [
        { sku: "GALAXY-A15-BLACK", attributes: { "اللون": "أسود" }, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed", low_stock_threshold: 2 },
        { sku: "GALAXY-A15-BLUE", attributes: { "اللون": "أزرق" }, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed", low_stock_threshold: 2 },
      ],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    demo.phone = created.body.id;
  }

  // Two more, hidden, for the list and its bulk actions.
  for (const [ar, en, price, colour] of [
    ["سماعات لاسلكية Buds", "Wireless Buds", 45000, [245, 245, 245]],
    ["شاحن سريع 25 واط", "25W Fast Charger", 18000, [60, 60, 66]],
  ] as const) {
    const exists = (await call(request, "GET", `/admin/products?q=${encodeURIComponent(en)}`)).body.data.length;
    if (exists) continue;
    const created = await call(request, "POST", "/admin/products", {
      category_id: phones,
      brand_id: samsung,
      name_ar: ar,
      name_en: en,
      price,
      discount_type: null,
      tracks_expiry: false,
      status: "hidden",
      published: false,
      images: [{ url: await upload(request, en + ".png", photo(480, [230, 238, 244], [...colour] as [number, number, number])) }],
      variants: [{ sku: `DEMO-${en.replace(/\W+/g, "-").toUpperCase()}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
  }

  // Delivery zones: Baghdad, the other governorates, Halabja left out (the warning).
  const zones = (await call(request, "GET", "/admin/delivery-zones")).body as Array<{ id: string; name_en: string; governorates: Array<{ id: string; code: string }> }>;
  const governorates = (await call(request, "GET", "/admin/governorates")).body as Array<{ id: string; code: string }>;
  const baghdad = governorates.find((row) => row.code === "baghdad")!;
  const halabja = governorates.find((row) => row.code === "halabja")!;
  if (!zones.some((zone) => zone.name_en === "Baghdad")) {
    for (const zone of zones) {
      await call(request, "PATCH", `/admin/delivery-zones/${zone.id}`, {
        name_ar: "باقي المحافظات",
        name_en: "Other governorates",
        fee_iqd: 6000,
        governorate_ids: zone.governorates.filter((row) => row.id !== baghdad.id && row.id !== halabja.id).map((row) => row.id),
      });
    }
    const created = await call(request, "POST", "/admin/delivery-zones", { name_ar: "بغداد", name_en: "Baghdad", fee_iqd: 3000, governorate_ids: [baghdad.id] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
  }

  // Automatic discount tiers.
  const tiers = (await call(request, "GET", "/admin/discount-tiers")).body as Array<{ min_subtotal: number }>;
  for (const [min, percent] of [
    [150_000, 5],
    [300_000, 10],
  ] as const) {
    if (!tiers.some((tier) => tier.min_subtotal === min)) {
      await call(request, "POST", "/admin/discount-tiers", { min_subtotal_iqd: min, percent });
    }
  }
});

/* ------------------------------------------------------------ helpers */

async function useLocale(page: Page, locale: Locale) {
  const url = new URL(test.info().project.use.baseURL ?? "http://localhost:3300");
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, domain: url.hostname, path: "/" }]);
}

async function shot(target: Page | Locator, name: string, locale: Locale, fullPage = false) {
  const path = join(OUT, `${name}.${locale}.png`);
  const page = "goto" in target ? (target as Page) : (target as Locator).page();
  // Added right before the shot: an earlier style would not survive hydration.
  await page.addStyleTag({
    content: [
      "nextjs-portal, [data-testid='toast'] { display: none !important; }",
      // A stitched long shot would paint the sticky save bar mid-page.
      "[data-testid='product-editor'] .sticky { position: static !important; }",
    ].join(" "),
  });
  if ("screenshot" in target && "goto" in target) {
    await target.waitForLoadState("networkidle").catch(() => undefined);
    await target.screenshot({ path, fullPage, animations: "disabled", caret: "hide" });
  } else {
    await (target as Locator).screenshot({ path, animations: "disabled", caret: "hide" });
  }
}

async function hydrated(page: Page, testId: string) {
  await page.waitForFunction((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    return !!element && Object.keys(element).some((key) => key.startsWith("__reactProps"));
  }, testId);
}

/* ------------------------------------------------------------ the guide, per language */

for (const locale of LOCALES) {
  test.describe(`owner guide (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      await useLocale(page, locale);
    });

    test(`1 · first sign-in and the password change (${locale})`, async ({ page, request }) => {
      await page.goto("/login");
      await page.getByTestId("login-username").fill("owner");
      await shot(page, "01-login", locale);
      const staff = await createStaff(request, { presets: ["super_admin"], prefix: "guide" });
      await uiLogin(page, staff.username, staff.password);
      await expect(page.getByTestId("forced-password-change")).toBeVisible();
      await page.getByTestId("current-password").fill(staff.password);
      await page.getByTestId("new-password").fill("Shubayr-Owner!2026");
      await page.getByTestId("confirm-password").fill("Shubayr-Owner!2026");
      await shot(page, "01-change-password", locale);
    });

    test(`2 · categories and brands (${locale})`, async ({ page }) => {
      await loginOwner(page);
      await page.goto("/catalog/categories");
      await expect(page.locator('[data-testid="department-electronics-demo"]')).toBeVisible();
      await shot(page.locator('[data-testid="department-electronics-demo"]'), "02-categories", locale);
      await page.goto("/catalog/brands");
      await page.getByTestId("brand-new").click();
      await page.getByTestId("brand-name-ar").fill("شاومي");
      await page.getByTestId("brand-name-en").fill("Xiaomi");
      await shot(page.getByTestId("brand-form"), "02-brand-new", locale);
    });

    test(`3 · a product: pictures, variants, prices, visibility (${locale})`, async ({ page }) => {
      await loginOwner(page);
      await page.goto(`/catalog/products/${demo.phone}`);
      await hydrated(page, "product-editor");
      await expect(page.getByTestId("product-images-tile-2")).toHaveAttribute("data-phase", "ready");
      // The top of the page: Duplicate and Opening stock, then the stock per variant.
      await shot(page, "03-product-top", locale);
      await shot(page.getByTestId("product-editor"), "03-product", locale);
    });

    test(`4 · opening stock (${locale})`, async ({ page }) => {
      await loginOwner(page);
      await page.goto(`/inventory/openings/new?product=${demo.phone}`);
      await hydrated(page, "opening-form");
      const lines = page.getByTestId("opening-line");
      await expect(lines).toHaveCount(2);
      for (let index = 0; index < 2; index += 1) {
        const line = lines.nth(index);
        const location = line.getByTestId("opening-location");
        if (!(await location.inputValue())) await location.selectOption({ index: 1 });
        await line.getByTestId("opening-quantity").fill(String(8 + index * 4));
        await line.getByTestId("opening-cost").fill("240000");
      }
      await shot(page.getByTestId("opening-form"), "04-opening-stock", locale);
    });

    test(`5 · bulk actions in the product list (${locale})`, async ({ page }) => {
      await loginOwner(page);
      await page.goto("/catalog/products?status=hidden");
      await hydrated(page, "products-table");
      const rows = page.getByTestId("products-table").getByTestId("table-row");
      await expect(rows.first()).toBeVisible();
      await page.getByTestId("products-select-all").check();
      await expect(page.getByTestId("bulk-bar")).toBeVisible();
      await shot(page, "05-bulk", locale);
    });

    test(`6 · Excel import and bulk images (${locale})`, async ({ page }) => {
      await loginOwner(page);
      // A workbook as an owner fills it: new accessories, one row missing its
      // price and one without a status. Previewed only — nothing is applied.
      const accessory = { category1: "إلكترونيات", category2: "إكسسوارات", brand: "سامسونج", status: "hidden" };
      const workbook = catalogWorkbook([
        { ...accessory, nameAr: "كفر سيليكون A15", nameEn: "A15 Silicone Case", sku: "CASE-A15-BLK", attributes: "اللون=أسود", price: 12000 },
        { ...accessory, nameAr: "كفر سيليكون A15", nameEn: "A15 Silicone Case", sku: "CASE-A15-BLU", attributes: "اللون=أزرق", price: 12000 },
        { ...accessory, nameAr: "واقي شاشة زجاجي", nameEn: "Glass Screen Protector", sku: "GLASS-A15", price: "" },
        { ...accessory, nameAr: "كابل USB-C متر", nameEn: "USB-C Cable 1 m", sku: "CABLE-USBC-1M", price: 7000, status: "" },
      ]);
      await page.goto("/catalog/import");
      await hydrated(page, "import-file");
      await page.getByTestId("import-file").setInputFiles({
        name: locale === "ar" ? "منتجات-جديدة.xlsx" : "new-products.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: workbook,
      });
      await page.getByTestId("import-check").click();
      await expect(page.getByTestId("import-current")).toHaveAttribute("data-status", "ready");
      await expect(page.getByTestId("import-filter-error")).toHaveAttribute("data-count", "1");
      await shot(page.getByTestId("catalog-import"), "06-import", locale);

      // Pictures named by SKU: one matches a product, one does not.
      await page.goto("/catalog/images");
      await hydrated(page, "images-file");
      await page.getByTestId("images-file").setInputFiles({
        name: "pictures.zip",
        mimeType: "application/zip",
        buffer: zip([
          { name: "DEMO-WIRELESS-BUDS-2.png", data: photo(480, [236, 240, 246], [250, 250, 250]) },
          { name: "CASE-A15-RED.png", data: photo(480, [244, 236, 236], [200, 60, 60]) },
        ]),
      });
      await page.getByTestId("images-upload").click();
      await expect(page.getByTestId("images-result")).toBeVisible();
      await shot(page, "06-images", locale);
    });

    test(`7 · delivery zones and discount tiers (${locale})`, async ({ page }) => {
      await loginOwner(page);
      await page.goto("/settings/delivery-zones");
      await expect(page.getByTestId("zone-card").first()).toBeVisible();
      await shot(page, "07-delivery-zones", locale);
      await page.goto("/settings/discounts");
      await expect(page.getByTestId("tier-row").first()).toBeVisible();
      await shot(page, "07-discount-tiers", locale);
    });

    test(`8 · confirming an order (${locale})`, async ({ page, request }) => {
      await loginOwner(page);
      const order = await placeOrder(request);
      await page.goto(`/orders/${order.id}`);
      await page.getByTestId("order-action-accept").click();
      const dialog = page.getByTestId("confirm-dialog");
      await dialog.getByTestId("customer-contacted").check();
      await dialog.getByTestId("customer-contact-note").fill(locale === "ar" ? "اتصلت بالزبون وأكد العنوان والطلب." : "Called the customer; address and order confirmed.");
      await dialog.getByTestId("adjusted-delivery-fee").fill("8000");
      await dialog.getByTestId("delivery-fee-adjustment-reason").fill(locale === "ar" ? "منطقة بعيدة عن المركز." : "Far from the city centre.");
      await expect(dialog.getByTestId("delivery-fee-preview")).toBeVisible();
      await shot(dialog, "08-confirm-order", locale);
      await page.keyboard.press("Escape");
    });

    test(`9 · staff and permissions (${locale})`, async ({ page }) => {
      await loginOwner(page);
      await page.goto("/staff/new");
      await expect(page.locator("form").first()).toBeVisible();
      await shot(page, "09-staff-new", locale);
    });
  });
}
