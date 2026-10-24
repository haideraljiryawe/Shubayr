import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { API, adminApiToken, bearer, uiLoginAsAdmin } from "../live/helpers";

/**
 * PR A15 (VIS-021 / 008 / 009 / 022 / 023 / 016A), photographed in Arabic
 * and English at a wide and a narrow width — each shot preceded by the rule
 * it shows. Writes docs/reviews/web-admin-2026-10-22/a15-evidence/. Run it
 * against a throwaway, seeded database: it uploads a few pictures and leaves
 * an invoice draft only until it discards it at the end; nothing is saved.
 *
 *   ADMIN_LIVE_API=http://localhost:8111/api/v1 npx playwright test --config playwright.visual.config.ts tests/visual/images-invoice.spec.ts
 */

test.describe.configure({ mode: "serial" });

const OUT = join(__dirname, "..", "..", "..", "docs", "reviews", "web-admin-2026-10-22", "a15-evidence");
const LOCALES = ["ar", "en"] as const;
const WIDTHS = [
  { name: "wide", width: 1440, height: 900 },
  { name: "narrow", width: 390, height: 844 },
] as const;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  let crc = ~0;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(~crc >>> 0, 0);
  return Buffer.concat([length, body, sum]);
}

/** A test picture: a coloured field with a darker band across the middle, so crops are visible. */
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    const band = Math.abs(y - height / 2) < height / 10;
    for (let x = 0; x < width; x += 1) {
      const edge = x < width / 12 || x > (width * 11) / 12;
      row.set(band ? [r / 3, g / 3, b / 3] : edge ? [240, 240, 240] : [r, g, b], 1 + x * 3);
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

async function useLocale(page: Page, locale: string) {
  const url = new URL(test.info().project.use.baseURL ?? "http://localhost:3300");
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, domain: url.hostname, path: "/" }]);
}

async function shot(target: Page | Locator, name: string) {
  const page = "goto" in target ? (target as Page) : (target as Locator).page();
  await page.addStyleTag({ content: "nextjs-portal, [data-testid='toast'] { display: none !important; }" });
  const path = join(OUT, `${name}.png`);
  if ("goto" in target) await (target as Page).screenshot({ path, animations: "disabled", caret: "hide" });
  else await (target as Locator).screenshot({ path, animations: "disabled", caret: "hide" });
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page-wide horizontal overflow").toBeLessThanOrEqual(1);
}

async function expectSquare(target: Locator) {
  const box = (await target.boundingBox())!;
  expect(Math.abs(box.width - box.height), "square").toBeLessThan(2);
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

for (const locale of LOCALES) {
  for (const size of WIDTHS) {
    const tag = `${locale}.${size.name}`;

    test(`images and invoice ${tag}`, async ({ page, request }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await useLocale(page, locale);
      await uiLoginAsAdmin(page);

      // VIS-021 + VIS-008: a portrait product photo opens in the shared editor —
      // centred, Image size at its midpoint, the result square.
      await page.goto("/catalog/products/new");
      const images = page.getByTestId("product-images");
      await expect(images.getByTestId("product-images-guidance")).toBeVisible();
      await images.getByTestId("product-images-input").setInputFiles([
        { name: "portrait.png", mimeType: "image/png", buffer: png(900, 1500, [196, 92, 60]) },
        { name: "landscape.png", mimeType: "image/png", buffer: png(1500, 900, [60, 120, 190]) },
      ]);
      const editor = page.getByTestId("product-images-editor");
      await expect(editor.getByTestId("product-images-editor-cropper-zoom")).toHaveValue("50");
      await expect(editor.getByTestId("product-images-editor-output-size")).toHaveText("900 × 900");
      await expectSquare(editor.getByTestId("product-images-editor-cropper-frame"));
      await shot(editor, `image-editor.${tag}`);
      // Zoomed out: the whole picture with even white margins, still a square file.
      await editor.getByTestId("product-images-editor-cropper-zoom-out").click();
      await editor.getByTestId("product-images-editor-cropper-zoom-out").click();
      await expect(editor.getByTestId("product-images-editor-margins")).toBeVisible();
      await shot(editor, `image-editor-zoomed-out.${tag}`);
      await editor.getByTestId("product-images-editor-confirm").click();
      await editor.getByTestId("product-images-editor-confirm").click();
      await expect(editor).toBeHidden();
      for (const index of [0, 1]) {
        await expect(images.getByTestId(`product-images-tile-${index}`)).toHaveAttribute("data-phase", "ready", { timeout: 60_000 });
        await expectSquare(images.getByTestId(`product-images-square-${index}`));
        // Order and delete sit below the square, never on it.
        const square = (await images.getByTestId(`product-images-square-${index}`).boundingBox())!;
        const controls = (await images.getByTestId(`product-images-controls-${index}`).boundingBox())!;
        expect(controls.y).toBeGreaterThanOrEqual(square.y + square.height - 1);
      }
      await expectNoPageOverflow(page);
      await shot(page.getByTestId("images-section"), `product-images.${tag}`);
      // The deletion question, with the approved copy.
      await images.getByTestId("product-images-remove-1").click();
      const ask = page.getByRole("dialog");
      await expect(ask).toContainText(locale === "ar" ? "حذف الصورة؟" : "Delete image?");
      await shot(ask, `image-remove.${tag}`);
      await ask.getByRole("button", { name: locale === "ar" ? "إلغاء" : "Cancel" }).click();

      // VIS-009: the category previews — both languages side by side (stacked only
      // when narrow), square artwork, the child tile on its own row.
      await page.goto("/catalog/categories");
      await page.getByTestId("category-new").click();
      const form = page.getByTestId("category-form");
      await form.getByTestId("category-name-ar").fill("أدوات المطبخ");
      await form.getByTestId("category-name-en").fill("Kitchen tools");
      await form.getByTestId("category-description-ar").fill("كل ما تحتاجه لمطبخك");
      await form.getByTestId("category-description-en").fill("Everything for your kitchen");
      await form.getByTestId("category-image-input").setInputFiles({ name: "kitchen.png", mimeType: "image/png", buffer: png(1500, 1000, [210, 150, 60]) });
      await page.getByTestId("category-image-editor-confirm").click();
      await expect(page.getByTestId("category-image-editor")).toBeHidden();
      for (const lang of ["ar", "en"]) await expectSquare(form.getByTestId(`category-preview-art-${lang}`));
      const ar = (await form.getByTestId("category-preview-card-ar").boundingBox())!;
      const en = (await form.getByTestId("category-preview-card-en").boundingBox())!;
      if (size.name === "wide") expect(Math.abs(ar.y - en.y)).toBeLessThan(2);
      await expectSquare(form.getByTestId("category-preview-tile"));
      await form.getByTestId("category-preview").scrollIntoViewIfNeeded();
      await shot(form.getByTestId("category-image"), `category-preview.${tag}`);
      await page.getByTestId("dialog-close").click();

      // Brands: the logo goes through the same editor and is saved square.
      await page.goto("/catalog/brands");
      await page.getByTestId("brand-new").click();
      const brand = page.getByTestId("brand-form");
      await brand.getByTestId("brand-logo-input").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png(600, 1000, [30, 30, 30]) });
      await expect(page.getByTestId("brand-logo-editor-output-size")).toHaveText("600 × 600");
      await shot(page.getByTestId("brand-logo-editor"), `brand-logo-editor.${tag}`);
      await page.getByTestId("brand-logo-editor-confirm").click();
      await expect(brand.getByTestId("brand-logo-tile-0")).toHaveAttribute("data-phase", "ready", { timeout: 60_000 });
      await expectSquare(brand.getByTestId("brand-logo-square-0"));
      await shot(brand, `brand-logo.${tag}`);
      await page.getByTestId("dialog-close").click();

      // VIS-008: the bulk ZIP page says non-square pictures are centre-cropped.
      await page.goto("/catalog/images");
      await expect(page.getByTestId("images-square-notice")).toBeVisible();
      await shot(page.getByTestId("images-square-notice").locator("xpath=ancestor::*[contains(@class,'flex-col')][1]"), `bulk-zip.${tag}`);

      // VIS-022 / 023: one product editor above a compact list of invoice products.
      const token = await adminApiToken(request);
      const products = (await (await request.get(`${API}/admin/products?per_page=3&status=active`, { headers: bearer(token) })).json()).data as Array<{
        name_ar: string;
        name_en: string;
        variants: Array<{ sku: string }>;
      }>;
      const [first, second] = products;
      await page.goto("/purchasing/invoices/new");
      const invoice = page.getByTestId("invoice-editor");
      const search = invoice.getByTestId("line-sku-search");
      await search.fill(`ZZQ-${Date.now()}`);
      await expect(invoice.getByTestId("line-sku-state")).toHaveAttribute("data-state", "none");
      await shot(invoice, `invoice-search-none.${tag}`);
      for (const [product, packs, cost] of [
        [first, "4", "12500"],
        [second, "2", "30000"],
        [first, "1", "12000"],
      ] as const) {
        await invoice.getByTestId("line-sku-search").fill(locale === "ar" ? product.name_ar : product.name_en);
        await invoice.locator(`[data-testid="line-sku-option"][data-sku="${product.variants[0].sku}"]`).click();
        await invoice.getByTestId("line-packs").fill(packs);
        await invoice.getByTestId("line-cost").fill(cost);
        await invoice.getByTestId("invoice-editor-submit").click();
      }
      const rows = page.getByTestId("invoice-line");
      await expect(rows).toHaveCount(3);
      await rows.nth(1).getByTestId("line-edit").click();
      await expect(invoice).toHaveAttribute("data-mode", "edit");
      await expect(rows.nth(1)).toHaveAttribute("data-editing", "true");
      await expectNoPageOverflow(page);
      await shot(page.getByTestId("invoice-products-section"), `invoice-products.${tag}`);
      await rows.nth(2).getByTestId("line-remove").click();
      const remove = page.getByRole("dialog");
      await expect(remove).toContainText(locale === "ar" ? "إزالة المنتج من الفاتورة؟" : "Remove product from invoice?");
      await shot(remove, `invoice-remove.${tag}`);
      await remove.getByRole("button", { name: locale === "ar" ? "إلغاء" : "Cancel" }).click();
      await expect(page.getByTestId("draft-status")).toHaveAttribute("data-status", "saved");
      await page.getByTestId("draft-discard").click();
      await expect(rows).toHaveCount(0);

      // VIS-016A: the pick-list guidance sits with its own controls.
      await page.goto("/orders");
      const pick = page.getByTestId("pick-controls");
      if (await pick.count()) {
        await expect(pick.getByTestId("pick-batch-disabled")).toBeDisabled();
        await expect(pick.getByTestId("pick-hint")).toBeVisible();
        await shot(pick, `orders-pick.${tag}`);
        await page.getByTestId("order-select").first().check();
        await expect(pick).toHaveAttribute("data-state", "selected");
        await shot(pick, `orders-pick-selected.${tag}`);
      }
    });
  }
}
