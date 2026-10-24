import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { API, KNOWN_PASSWORD, activateStaff, adminApiToken, bearer, createStaff, uiLogin } from "../live/helpers";

/**
 * PR A16 (VIS-019, product delete, change password, VIS-020 PDF export) photographed in Arabic
 * and English at a wide and a narrow width, each shot preceded by the rule
 * it shows. Writes docs/reviews/web-admin-2026-10-22/a16-evidence/. Run it
 * against a throwaway, seeded database: it creates a staff member and a few
 * products (one deleted, others archived).
 *
 *   ADMIN_LIVE_API=http://localhost:8000/api/v1 npx playwright test --config playwright.visual.config.ts tests/visual/a16.spec.ts
 */

test.describe.configure({ mode: "serial" });

const OUT = join(__dirname, "..", "..", "..", "docs", "reviews", "web-admin-2026-10-22", "a16-evidence");
const LOCALES = ["ar", "en"] as const;
const WIDTHS = [
  { name: "wide", width: 1440, height: 900 },
  { name: "narrow", width: 390, height: 844 },
] as const;
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";
const run = Date.now().toString(36);

async function useLocale(page: Page, locale: string) {
  const url = new URL(test.info().project.use.baseURL ?? "http://localhost:3300");
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, domain: url.hostname, path: "/" }]);
}

async function shot(target: Page | Locator, name: string) {
  const page = "goto" in target ? (target as Page) : (target as Locator).page();
  // Fixed bars would cover a tall element while it is photographed in parts.
  const fixed = "goto" in target ? "" : ", [data-testid='top-bar']";
  await page.addStyleTag({ content: `nextjs-portal, [data-testid='toast']${fixed} { display: none !important; }` });
  const path = join(OUT, `${name}.png`);
  if ("goto" in target) await (target as Page).screenshot({ path, animations: "disabled", caret: "hide", fullPage: true });
  else await (target as Locator).screenshot({ path, animations: "disabled", caret: "hide" });
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page-wide horizontal overflow").toBeLessThanOrEqual(1);
}

async function api(request: APIRequestContext, method: "GET" | "POST", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

async function product(request: APIRequestContext, label: string, stocked: boolean) {
  const created = await api(request, "POST", "/admin/products", {
    category_id: CATEGORY,
    name_en: `Desk lamp ${label} ${run}`,
    name_ar: `مصباح مكتب ${label} ${run}`,
    price: 25000,
    discount_type: null,
    tracks_expiry: false,
    status: "hidden",
    published: false,
    variants: [{ sku: `VIS-${label}-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  if (stocked) {
    const opening = await api(request, "POST", "/admin/inventory/openings", {
      operation_id: `vis-open-${label}-${run}`,
      document_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date()),
      lines: [{ variant_id: created.body.variants[0].id, location_id: LOCATION, quantity: "2", unit_cost_iqd: "15000" }],
    });
    expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  }
  return created.body as { id: string; name_ar: string; name_en: string };
}

let staff: { username: string } | null = null;

test.beforeAll(async ({ request }) => {
  await mkdir(OUT, { recursive: true });
  staff = await activateStaff(request, await createStaff(request, { presets: ["super_admin"], prefix: "vis16" }));
});

for (const locale of LOCALES) {
  for (const size of WIDTHS) {
    const tag = `${locale}.${size.name}`;

    test(`A16 screens ${tag}`, async ({ page, request }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await uiLogin(page, staff!.username, KNOWN_PASSWORD);
      await useLocale(page, locale);

      // VIS-019: readable names first in this language, key as a small hint.
      await page.goto("/presets/new");
      const picker = page.getByTestId("picker-permission_keys");
      await expect(picker.getByTestId("perm-name-orders.accept")).toHaveText(locale === "ar" ? "قبول الطلبات" : "Accept pending orders");
      await picker.getByTestId("perm-orders.accept").check();
      await picker.getByTestId("perm-orders.view").check();
      await expectNoPageOverflow(page);
      await shot(picker.locator('fieldset[data-group="orders"]'), `permissions.${tag}`);
      // A search in this language, Arabic typed without hamza.
      await picker.getByTestId("picker-permission_keys-search").fill(locale === "ar" ? "اسعار" : "prices");
      await expect(picker.getByTestId("perm-prices.change")).toBeVisible();
      await shot(picker, `permissions-search.${tag}`);

      // The staff editor's extra grants use the same names.
      await page.goto("/staff/new");
      await expect(page.getByTestId("perm-name-orders.view")).toBeVisible();
      await shot(page.getByTestId("picker-permission_keys").locator('fieldset[data-group="orders"]'), `staff-grants.${tag}`);

      // Product delete: the action on the product page and its confirmation.
      const kept = await product(request, `K${locale}${size.name[0]}`, true);
      await page.goto(`/catalog/products/${kept.id}`);
      await expect(page.getByTestId("product-delete")).toBeVisible();
      await expectNoPageOverflow(page);
      // The page header: title on one side, the actions (Delete product last) on the other.
      await shot(page.getByTestId("product-delete").locator("xpath=../.."), `product-delete-action.${tag}`);
      await page.getByTestId("product-delete").click();
      const confirm = page.getByTestId("confirm-dialog");
      await expect(confirm.getByTestId("product-delete-explain")).toBeVisible();
      await shot(confirm, `product-delete-confirm.${tag}`);
      // It has stock, so it is archived and the page says why.
      await confirm.getByTestId("confirm-submit").click();
      await expect(page.getByTestId("product-delete-outcome")).toHaveAttribute("data-archived", "1");
      await shot(page.getByTestId("product-delete-outcome"), `product-archived.${tag}`);

      // Bulk: one never used (deleted), one with history (archived).
      await product(request, `A${locale}${size.name[0]}`, false);
      await product(request, `B${locale}${size.name[0]}`, true);
      await page.goto(`/catalog/products?q=${encodeURIComponent(`${locale}${size.name[0]} ${run}`)}`);
      const rows = page.getByTestId("products-table").locator("tr").filter({ hasText: run });
      await expect(rows).toHaveCount(2);
      for (const row of await rows.all()) await row.getByTestId("product-select").check();
      await expect(page.getByTestId("bulk-delete")).toBeVisible();
      await shot(page.getByTestId("bulk-bar"), `bulk-bar.${tag}`);
      await page.getByTestId("bulk-delete").click();
      await shot(page.getByTestId("confirm-dialog"), `bulk-delete-confirm.${tag}`);
      await page.getByTestId("confirm-dialog").getByTestId("confirm-submit").click();
      const outcome = page.getByTestId("product-delete-outcome");
      await expect(outcome).toHaveAttribute("data-deleted", "1");
      await expect(outcome).toHaveAttribute("data-archived", "1");
      await shot(outcome, `bulk-delete-outcome.${tag}`);
      // The status filter: everything except archived by default.
      await page.goto("/catalog/products");
      await expectNoPageOverflow(page);
      await shot(page, `products-list.${tag}`);

      // Change password: show/hide on every field, the checklist live.
      await page.goto("/change-password?next=%2Fcatalog%2Fproducts");
      await page.getByTestId("new-password").fill("Shubayr2026");
      await page.getByTestId("new-password-toggle").click();
      await expect(page.getByTestId("new-password")).toHaveAttribute("type", "text");
      await expect(page.getByTestId("password-checklist").locator('[data-met="true"]').first()).toBeVisible();
      await expect(page.getByTestId("change-password-back")).toHaveAttribute("href", "/catalog/products");
      await expectNoPageOverflow(page);
      await shot(page, `change-password.${tag}`);

      // VIS-020: Export PDF on a report, its orientation choice, then the job.
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
      await page.goto(`/reports/sales?from=${day.slice(0, 8)}01&to=${day}&group_by=day`);
      await expect(page.getByTestId("report-export-pdf")).toBeVisible();
      await shot(page.getByTestId("report-export"), `report-export-actions.${tag}`);
      await page.getByTestId("report-export-pdf").click();
      const pdf = page.getByTestId("pdf-export-dialog");
      await pdf.getByTestId("pdf-orientation-landscape").click();
      await shot(pdf, `pdf-export-dialog.${tag}`);
      const download = page.waitForEvent("download", { timeout: 180_000 });
      await pdf.getByTestId("pdf-export-submit").click();
      await download;
      await expect(pdf.getByTestId("pdf-export-progress")).toHaveAttribute("data-state", "ready");
      await shot(pdf, `pdf-export-ready.${tag}`);
    });
  }
}
