import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { API, KNOWN_PASSWORD, activateStaff, adminApiToken, bearer, createStaff, uiLogin } from "../live/helpers";

/**
 * PR A17 (account-menu role, delete preview, real bulk delete) photographed
 * in Arabic and English at a wide and a narrow width. Writes
 * docs/reviews/web-admin-2026-10-22/a17-evidence/. Run it against a
 * throwaway, seeded database: it creates a staff member and products (some
 * deleted, others archived).
 *
 *   ADMIN_LIVE_API=http://localhost:8000/api/v1 npx playwright test --config playwright.visual.config.ts tests/visual/a17.spec.ts
 */

test.describe.configure({ mode: "serial" });

const OUT = join(__dirname, "..", "..", "..", "docs", "reviews", "web-admin-2026-10-22", "a17-evidence");
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
  const fixed = "goto" in target ? "" : ", [data-testid='top-bar']";
  await page.addStyleTag({ content: `nextjs-portal, [data-testid='toast']${fixed} { display: none !important; }` });
  const path = join(OUT, `${name}.png`);
  if ("goto" in target) await (target as Page).screenshot({ path, animations: "disabled", caret: "hide", fullPage: true });
  else await (target as Locator).screenshot({ path, animations: "disabled", caret: "hide" });
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
    variants: [{ sku: `VIS17-${label}-${run}`, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed" }],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  if (stocked) {
    const opening = await api(request, "POST", "/admin/inventory/openings", {
      operation_id: `vis17-open-${label}-${run}`,
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
  // Two presets, so the role line shows a list.
  staff = await activateStaff(request, await createStaff(request, { presets: ["super_admin", "accountant"], prefix: "vis17" }));
});

for (const locale of LOCALES) {
  for (const size of WIDTHS) {
    const tag = `${locale}.${size.name}`;
    const key = `${locale}${size.name[0]}`;

    test(`A17 screens ${tag}`, async ({ page, request }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await uiLogin(page, staff!.username, KNOWN_PASSWORD);
      await useLocale(page, locale);

      // The role under the name: in the top bar (wide) and in the open menu.
      await page.goto("/");
      await page.getByTestId("account-menu").click();
      await expect(page.getByTestId("account-role")).toBeVisible();
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      // The trigger and the open menu together, wherever the direction puts them.
      const boxes = [await page.getByTestId("account-menu").boundingBox(), await page.getByTestId("account-menu-content").boundingBox()];
      const left = Math.max(0, Math.min(...boxes.map((box) => box!.x)) - 16);
      const right = Math.min(size.width, Math.max(...boxes.map((box) => box!.x + box!.width)) + 16);
      const bottom = Math.max(...boxes.map((box) => box!.y + box!.height)) + 16;
      await page.screenshot({
        path: join(OUT, `account-menu-role.${tag}.png`),
        animations: "disabled",
        caret: "hide",
        clip: { x: left, y: 0, width: right - left, height: bottom },
      });
      await page.keyboard.press("Escape");

      // Single delete, never used: deleted for good (red button).
      const unused = await product(request, `U${key}`, false);
      await page.goto(`/catalog/products/${unused.id}`);
      await page.getByTestId("product-delete").click();
      const dialog = page.getByTestId("confirm-dialog");
      await expect(dialog.getByTestId("product-delete-preview")).toHaveAttribute("data-outcome", "delete");
      await shot(dialog, `single-delete.${tag}`);
      await dialog.getByTestId("confirm-cancel").click();

      // Single delete, with stock history: archived, with why (not red).
      const kept = await product(request, `K${key}`, true);
      await page.goto(`/catalog/products/${kept.id}`);
      await page.getByTestId("product-delete").click();
      await expect(dialog.getByTestId("product-delete-preview")).toHaveAttribute("data-outcome", "archive");
      await shot(dialog, `single-archive.${tag}`);
      await dialog.getByTestId("confirm-cancel").click();

      // Single delete the server says can't be processed: only Close. (Stubbed:
      // a real single preview answers 404 for a product that is gone.)
      await page.route(`**/api/proxy/admin/products/${kept.id}/delete-preview`, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: kept.id, outcome: "failed", reasons: ["product_not_found"] }) }),
      );
      await page.getByTestId("product-delete").click();
      await expect(dialog.getByTestId("product-delete-preview")).toHaveAttribute("data-outcome", "failed");
      await expect(dialog.getByTestId("confirm-close")).toBeVisible();
      await shot(dialog, `single-failed.${tag}`);
      await dialog.getByTestId("confirm-close").click();
      await page.unroute(`**/api/proxy/admin/products/${kept.id}/delete-preview`);

      // Bulk: two never used, one with history, one deleted meanwhile.
      await product(request, `Z${key}A`, false);
      await product(request, `Z${key}B`, false);
      await product(request, `Z${key}C`, true);
      const gone = await product(request, `Z${key}D`, false);
      await page.goto(`/catalog/products?q=${encodeURIComponent(`Z${key}`)}`);
      const rows = page.getByTestId("products-table").locator("tr").filter({ hasText: run });
      await expect(rows).toHaveCount(4);
      for (const row of await rows.all()) await row.getByTestId("product-select").check();
      expect((await api(request, "POST", `/admin/products/${gone.id}/delete`)).status).toBe(201);
      await page.getByTestId("bulk-delete").click();
      const preview = dialog.getByTestId("bulk-preview");
      await expect(preview).toHaveAttribute("data-state", "ready");
      await expect(preview).toHaveAttribute("data-failed", "1");
      await dialog.getByTestId("bulk-preview-archive").locator("summary").click();
      await dialog.getByTestId("bulk-preview-failed").locator("summary").click();
      await shot(dialog, `bulk-summary.${tag}`);
      await dialog.getByTestId("confirm-submit").click();
      const outcome = page.getByTestId("product-delete-outcome");
      await expect(outcome).toHaveAttribute("data-deleted", "2");
      await expect(outcome).toHaveAttribute("data-archived", "1");
      await shot(outcome, `bulk-result.${tag}`);
    });
  }
}
