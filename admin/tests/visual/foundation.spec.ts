import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { adminApiToken, savePreferredLanguage, uiLoginAsAdmin } from "../live/helpers";

/**
 * The shared design foundation, photographed in Arabic and English at a wide
 * and a narrow width — each shot preceded by the rule it shows.
 * See playwright.visual.config.ts.
 */

test.describe.configure({ mode: "serial" });

const OUT = join(__dirname, "..", "..", "..", "docs", "reviews", "web-admin-2026-10-22", "a13-evidence");
const LOCALES = ["ar", "en"] as const;
const WIDTHS = [
  { name: "wide", width: 1440, height: 900 },
  { name: "narrow", width: 390, height: 844 },
] as const;

/** This browser's language, and the admin's saved one (signing in applies it). */
async function useLocale(page: Page, locale: "ar" | "en") {
  const url = new URL(test.info().project.use.baseURL ?? "http://localhost:3300");
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, domain: url.hostname, path: "/" }]);
  await savePreferredLanguage(page.request, await adminApiToken(page.request), locale);
}

async function shot(target: Page | Locator, name: string) {
  const page = "goto" in target ? (target as Page) : (target as Locator).page();
  await page.addStyleTag({ content: "nextjs-portal, [data-testid='toast'] { display: none !important; }" });
  const path = join(OUT, `${name}.png`);
  if ("goto" in target) await (target as Page).screenshot({ path, animations: "disabled", caret: "hide" });
  else await (target as Locator).screenshot({ path, animations: "disabled", caret: "hide" });
}

/** No sideways scrolling of the whole page (tables and tab strips scroll inside themselves). */
async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page-wide horizontal overflow").toBeLessThanOrEqual(1);
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

// Leave the admin in Arabic, as the seed has it, for whatever runs next.
test.afterAll(async ({ request }) => {
  await savePreferredLanguage(request, await adminApiToken(request), "ar");
});

for (const locale of LOCALES) {
  for (const size of WIDTHS) {
    const tag = `${locale}.${size.name}`;

    test(`foundation ${tag}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await useLocale(page, locale);
      await uiLoginAsAdmin(page);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");

      // VIS-011/012/014: one table family — toolbar band, aligned headings,
      // the footer inside the card with the brief's copy.
      await page.goto("/catalog/products?per_page=10");
      const card = page.locator("section").filter({ has: page.getByTestId("table-footer") }).first();
      await expect(card.getByTestId("table-footer")).toBeVisible();
      await expect(card.locator("[data-table-toolbar]")).toBeVisible();
      const range = (await card.getByTestId("table-range").textContent()) ?? "";
      expect(range).toMatch(locale === "ar" ? /^(عرض \d+ إلى \d+ من أصل [\d,]+ سجلاً|إجمالي السجلات: [\d,]+|سجل واحد|لا توجد سجلات)$/ : /^(Showing \d+ to \d+ of [\d,]+ records|Total records: [\d,]+|1 record|No records)$/);
      const heads = await card.locator("thead th").evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).textAlign));
      expect(heads.filter((align) => align !== "end" && align !== "center").every((align) => align === "start")).toBe(true);
      await expect(page.locator("#table-go-to")).toHaveCount(0);
      await expectNoPageOverflow(page);
      await shot(card, `table.${tag}`);

      // VIS-015: the order tabs scroll sideways inside the strip, never vertically.
      await page.goto("/orders");
      const strip = page.getByTestId("orders-tab-list").locator("xpath=..");
      const metrics = await strip.evaluate((element) => ({
        vertical: element.scrollHeight - element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));
      expect(metrics.vertical).toBeLessThanOrEqual(0);
      expect(metrics.overflowY).toBe("hidden");
      await expectNoPageOverflow(page);
      await shot(strip.locator("xpath=.."), `tabs.${tag}`);

      // VIS-005/006/007/013: the product form — shared Select open with its
      // check mark, grouped price, and the action bar aligned to the form.
      await page.goto("/catalog/products/new");
      const editor = page.getByTestId("product-editor");
      await expect(editor).toBeVisible();
      const category = page.getByTestId("product-category");
      await category.click();
      const listbox = page.getByRole("listbox");
      await expect(listbox).toBeVisible();
      const box = (await listbox.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      await shot(page, `select-open.${tag}`);
      await page.getByRole("option").nth(1).click();
      await page.keyboard.press("Tab");
      await shot(category.locator("xpath=.."), `select-chosen.${tag}`);

      const price = page.getByTestId("product-price");
      await price.fill("1250000");
      await expect(price).toHaveValue("1,250,000");
      await price.focus();
      await shot(price.locator("xpath=.."), `amount-focus.${tag}`);

      const bar = page.getByTestId("product-actions");
      const formBox = (await editor.boundingBox())!;
      const barBox = (await bar.boundingBox())!;
      expect(Math.abs(barBox.x - formBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(barBox.x + barBox.width - (formBox.x + formBox.width))).toBeLessThanOrEqual(1);
      await expectNoPageOverflow(page);
      await shot(page, `action-bar.${tag}`);

      // VIS-010: a long dialog keeps its title and actions; only the body scrolls.
      await page.goto("/catalog/categories");
      await page.getByTestId("category-new").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const header = (await dialog.locator("header").boundingBox())!;
      const footer = (await dialog.locator("footer").boundingBox())!;
      expect(header.y).toBeGreaterThanOrEqual(0);
      expect(footer.y + footer.height).toBeLessThanOrEqual(size.height);
      const body = dialog.locator("[data-dialog-body]");
      await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
      expect((await dialog.locator("footer").boundingBox())!.y).toBe(footer.y);
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await page.mouse.wheel(0, 600);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
      await shot(page, `dialog.${tag}`);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      // VIS-024: the Excel picker speaks the interface language.
      await page.goto("/catalog/import");
      const picker = page.getByTestId("import-file-button");
      await expect(picker).toHaveText(locale === "ar" ? "اختيار ملف" : "Choose file");
      await expect(page.getByTestId("import-file-status")).toHaveText(locale === "ar" ? "لم يتم اختيار أي ملف" : "No file selected");
      await page.getByTestId("import-file").setInputFiles({ name: "منتجات-catalog March.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("x") });
      await expect(page.getByTestId("import-file-status")).toHaveText("منتجات-catalog March.xlsx");
      await expectNoPageOverflow(page);
      await shot(picker.locator("xpath=../.."), `file-picker.${tag}`);

      // VIS-014: a warehouse's own tools sit in the card's toolbar band, apart from its rows.
      await page.goto("/inventory/warehouses");
      const warehouse = page.getByTestId("warehouse-card").first();
      if (await warehouse.count()) {
        await expect(warehouse.locator("[data-table-toolbar]")).toBeVisible();
        await shot(warehouse, `warehouse.${tag}`);
      }
    });
  }
}
