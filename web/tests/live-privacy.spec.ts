import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import {
  API,
  CUSTOMER_E164,
  CUSTOMER_LOCAL,
  OTHER_CUSTOMER_E164,
  OTHER_CUSTOMER_LOCAL,
  awaitQuota,
  bearer,
  requireLiveApi,
  signIn,
  stockedProduct,
  tokenFor,
} from "./live-api";

/**
 * Two shoppers on the store at once never see each other's data. The store
 * caches its public catalogue reads across requests (src/lib/server-data.ts);
 * nothing personal is read on its server, and personal pages are no-store.
 * Each shopper here has a different product in their cart and opens their
 * cart and account in their own browser, one after the other and side by side.
 */

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "the live privacy spec");
  await awaitQuota(request);
});

/** Leave exactly `product` in the shopper's server cart. */
async function cartOf(request: APIRequestContext, phone: string, product: { id: string; variant: string }) {
  const headers = bearer(await tokenFor(request, phone));
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const row of cart.items ?? []) await request.delete(`${API}/cart/items/${row.id}`, { headers });
  const added = await request.post(`${API}/cart/items`, { headers, data: { product_id: product.id, variant_id: product.variant, quantity: 1 } });
  expect(added.ok(), await added.text()).toBe(true);
}

async function shopper(browser: Browser, phoneLocal: string, next: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await signIn(page, next, phoneLocal);
  return page;
}

test("two signed-in shoppers each see only their own cart and account", async ({ browser, request }) => {
  const mine = await stockedProduct(request, "PRIVATE-A");
  const theirs = await stockedProduct(request, "PRIVATE-B");
  const mineName = (await (await request.get(`${API}/products/${mine.id}`)).json()).name_ar as string;
  const theirsName = (await (await request.get(`${API}/products/${theirs.id}`)).json()).name_ar as string;
  await cartOf(request, CUSTOMER_E164, mine);
  await cartOf(request, OTHER_CUSTOMER_E164, theirs);

  const first = await shopper(browser, CUSTOMER_LOCAL, "/cart");
  const second = await shopper(browser, OTHER_CUSTOMER_LOCAL, "/cart");

  // Side by side: each cart holds its own product only.
  for (const [page, own, other] of [
    [first, mineName, theirsName],
    [second, theirsName, mineName],
  ] as const) {
    await expect(page.getByTestId("cart-summary")).toHaveAttribute("data-server-priced", "true");
    await expect(page.getByTestId("cart-items")).toContainText(own);
    await expect(page.getByTestId("cart-items")).not.toContainText(other);
  }

  // One after the other on the same paths: the account shows its own phone.
  for (const [page, phone, other] of [
    [first, CUSTOMER_E164, OTHER_CUSTOMER_E164],
    [second, OTHER_CUSTOMER_E164, CUSTOMER_E164],
  ] as const) {
    const response = await page.goto("/account");
    expect(response?.headers()["cache-control"] ?? "").toMatch(/no-store/);
    await expect(page.getByTestId("account-phone")).toHaveText(phone);
    await expect(page.locator("body")).not.toContainText(other);
    await page.reload();
    await expect(page.getByTestId("account-phone")).toHaveText(phone);
  }

  await first.context().close();
  await second.context().close();
});
