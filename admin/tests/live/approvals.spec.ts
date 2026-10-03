import { expect, test, type APIRequestContext } from "@playwright/test";
import { activateStaff, adminApiToken, API, bearer, createStaff, requireLiveApi, switchUser, uiLoginAsAdmin } from "./helpers";

/**
 * A below-cost linked-price publish (contract 11.0): the proposer's publish
 * becomes an approval request, the proposer can't decide it, and a second
 * approver approves it with a reason — without the client ever saying who
 * proposed it (the server takes that from the session).
 *
 * The approved publish records a USD rate. It is dated ten minutes back, so
 * every later spec's own rate (catalog five minutes back, finance and
 * purchasing at "now") stays the latest.
 */

test.describe.configure({ mode: "serial" });

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
const CATEGORY = "30000000-0000-4000-8000-000000000023";
const LOCATION = "90000000-0000-4000-8000-000000000002";

async function api(request: APIRequestContext, method: "GET" | "POST" | "PUT", path: string, data?: unknown) {
  const response = await request.fetch(`${API}${path}`, { method, headers: bearer(await adminApiToken(request)), data });
  return { status: response.status(), body: await response.json().catch(() => null) };
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
}

/** The rate form's effective time, in store time, `minutes` back. */
function minutesAgo(minutes: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(Date.now() - minutes * 60_000))
    .replace(" ", "T");
}

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request);
});

test("a below-cost linked-price publish waits for another approver; the proposer is refused, a second approver approves", async ({ page, request }) => {
  test.setTimeout(240_000);
  // Rounding off, so 12 USD at 1,000 is exactly 12,000 IQD.
  const settings = await api(request, "GET", "/admin/settings");
  const originalRounding = (settings.body.settings.sale_rounding_multiple as string | null) ?? "0";
  expect((await api(request, "PUT", "/admin/settings", { settings: { sale_rounding_multiple: "0" } })).status).toBe(200);
  let linked: { productId: string; variantId: string; sku: string } | null = null;
  try {
    // A USD rate to price from, then a SKU linked to 12 USD that cost 50,000 IQD.
    const setup = await api(request, "POST", "/admin/exchange-rates", {
      currency_code: "USD",
      rate: "1500",
      basis: 1,
      effective_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      reason: `Approvals spec ${run}`,
    });
    expect(setup.status, JSON.stringify(setup.body)).toBe(201);
    const sku = `APPR-${run}`;
    const created = await api(request, "POST", "/admin/products", {
      category_id: CATEGORY,
      name_en: `Approval ${run}`,
      name_ar: `موافقة ${run}`,
      price: 18000,
      discount_type: null,
      tracks_expiry: false,
      status: "active",
      published: true,
      variants: [{ sku, base_unit: "piece", whole_units_only: true, pricing_mode: "linked", reference_currency_code: "USD", reference_price: 12 }],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const productId = created.body.id as string;
    const variantId = created.body.variants[0].id as string;
    linked = { productId, variantId, sku };
    const opening = await api(request, "POST", "/admin/inventory/openings", {
      operation_id: `appr-open-${run}`,
      document_date: today(),
      lines: [{ variant_id: variantId, location_id: LOCATION, quantity: "1", unit_cost_iqd: "50000" }],
    });
    expect(opening.status, JSON.stringify(opening.body)).toBe(201);
    const publishedPrice = async () => (await api(request, "GET", `/admin/products/${productId}`)).body.variants[0].published_price as number;
    const before = await publishedPrice();

    // The proposer (admin) publishes 1 USD = 1,000 IQD: 12,000 < 50,000 cost.
    await uiLoginAsAdmin(page);
    await page.goto("/finance/currencies");
    await page.getByTestId("rate-currency").selectOption("USD");
    await page.getByTestId("rate-value").fill("1000");
    await page.getByTestId("rate-effective").fill(minutesAgo(10));
    await page.getByTestId("rate-reason").fill(`Clearance ${run}`);
    await page.getByTestId("rate-submit").click();
    await expect(page.locator(`[data-testid="preview-row"][data-sku="${sku}"]`).getByTestId("preview-new")).toHaveText("12,000 IQD");
    await page.getByTestId("rate-publish").click();
    const waiting = page.getByTestId("price-approval-waiting");
    await expect(waiting).toBeVisible();
    await expect(waiting.getByRole("button")).toHaveCount(0);
    const requestId = (await waiting.getAttribute("data-request"))!;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await publishedPrice()).toBe(before);

    // The proposer can't decide their own request.
    await page.getByTestId("price-approval-link").click();
    await page.waitForURL(new RegExp(`/finance/price-approvals/${requestId}$`));
    const decided: string[] = [];
    page.on("request", (sent) => {
      if (sent.url().includes("/price-publish-approvals/")) decided.push(sent.postData() ?? "");
    });
    await page.getByTestId("price-approval-reason").fill("Approving my own clearance");
    await page.getByTestId("price-approval-approve").click();
    await expect(page.getByTestId("price-approval-own")).toBeVisible();
    // Nothing in what was sent names who proposed it.
    expect(decided.length).toBeGreaterThan(0);
    for (const body of decided) {
      expect(body).not.toMatch(/originator|proposed_by|initiator/);
    }
    expect(await publishedPrice()).toBe(before);

    // A second approver approves it with a reason.
    const approver = await activateStaff(request, await createStaff(request, { presets: ["super_admin"], prefix: "priceok" }));
    await switchUser(page, approver.username, approver.password);
    await page.goto(`/finance/price-approvals/${requestId}`);
    await page.getByTestId("price-approval-reason").fill("Clearance agreed with the owner");
    await page.getByTestId("price-approval-approve").click();
    const result = page.getByTestId("price-approval-decided");
    await expect(result).toHaveAttribute("data-status", "approved");
    await expect(result.getByTestId("price-approval-breaches")).toContainText(sku);
    await expect.poll(publishedPrice).toBe(12000);
  } finally {
    // Every USD-linked SKU is repriced by every USD publish: left linked, this
    // SKU (cost 50,000) would send any later publish (the catalog spec's) to
    // approval. Give it a fixed price above its cost.
    if (linked) {
      const fixed = await request.fetch(`${API}/admin/products/${linked.productId}`, {
        method: "PATCH",
        headers: bearer(await adminApiToken(request)),
        data: { variants: [{ id: linked.variantId, sku: linked.sku, base_unit: "piece", whole_units_only: true, pricing_mode: "fixed", selling_price: 60000 }] },
      });
      expect(fixed.status(), await fixed.text()).toBe(200);
    }
    await api(request, "PUT", "/admin/settings", { settings: { sale_rounding_multiple: originalRounding } });
  }
});
