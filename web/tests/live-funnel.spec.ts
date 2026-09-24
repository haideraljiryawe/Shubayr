import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The purchase funnel end to end, in a browser, against the real API.
 *
 * Browse -> guest basket -> sign in (the guest cart replays exactly once) ->
 * a saved address -> COD placement -> confirmation -> the order in the list ->
 * snapshots on its detail -> its delivery status.
 *
 * Run with `npm run test:live` against a seeded stack; every test skips itself
 * when nothing answers, so the suite is safe to run with no backend.
 */

import {
  API,
  ADMIN_E164,
  CUSTOMER_E164,
  CUSTOMER_LOCAL as PHONE_LOCAL,
  awaitQuota,
  customerToken as token,
  reachable,
  signIn,
  tokenFor,
} from "./live-api";

/**
 * A product whose stock sits on a VARIANT.
 *
 * The seed leaves the variantless SKU at zero, so an add that ignores the
 * variant is refused for want of stock — the storefront has to key
 * availability off the variant, and this test walks the path that proves it.
 */
const EARBUDS = "40000000-0000-4000-8000-000000000001";

/**
 * Take a product off sale, or put it back.
 *
 * Hiding it is how this suite manufactures an unavailable line without racing
 * real stock: the cart reprices to `available: false, available_qty: 0` and
 * checkout answers 409, which is the same state a sell-out produces.
 */
async function setProductStatus(
  request: APIRequestContext,
  productId: string,
  status: "active" | "hidden",
): Promise<void> {
  const admin = await tokenFor(request, ADMIN_E164);
  const response = await request.patch(`${API}/admin/products/${productId}`, {
    headers: { Authorization: `Bearer ${admin}` },
    data: { status },
  });
  expect(response.ok()).toBe(true);
}

/** Start every test from an empty server cart, so quantities mean something. */
async function emptyServerCart(request: APIRequestContext): Promise<void> {
  const access = await token(request);
  const headers = { Authorization: `Bearer ${access}` };
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const item of cart.items ?? []) {
    await request.delete(`${API}/cart/items/${item.id}`, { headers });
  }
  if (cart.coupon_code) await request.delete(`${API}/cart/coupon`, { headers });
}

/** Put one earbuds line in the guest basket, choosing the in-stock variant. */
async function addEarbudsAsGuest(page: Page): Promise<void> {
  await page.goto(`/product/${EARBUDS}`);

  // Stock is on the VARIANTS: the seed leaves the variantless SKU at zero, so
  // the CTA only becomes live once one is chosen. Pick the first in-stock
  // swatch rather than blindly the first, which may be the sold-out one.
  const swatches = page.locator("fieldset button[aria-pressed]");
  const count = await swatches.count();
  for (let index = 0; index < count; index += 1) {
    await swatches.nth(index).click();
    if (await page.locator('[data-testid="pdp-add-to-cart"]:visible').isEnabled()) {
      break;
    }
  }

  const add = page.locator('[data-testid="pdp-add-to-cart"]:visible');
  await expect(add).toBeEnabled();
  await add.click();
}

test.describe("live purchase funnel", () => {
  test.beforeEach(async ({ request, page }) => {
    test.skip(
      !(await reachable(request)),
      `No API at ${API} — start the backend to run the live funnel test.`,
    );
    await awaitQuota(request);
    await emptyServerCart(request);

    // Nothing carries over between tests: no session, no guest basket.
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("a guest basket survives sign-in, replayed exactly once", async ({
    page,
    request,
  }) => {
    await addEarbudsAsGuest(page);
    await page.goto("/cart");

    // Guest side: the browser holds the basket and prices it itself.
    await expect(page.getByTestId("cart-items")).toBeVisible();
    await expect(page.getByTestId("cart-items").locator("> li")).toHaveCount(1);

    await signIn(page, "/cart");

    // Back on the cart the server is now the authority — and the single guest
    // line must have become a single server line. Two would mean the replay
    // ran twice, which is the StrictMode double-effect bug.
    await page.goto("/cart");
    await expect(page.getByTestId("cart-summary")).toHaveAttribute(
      "data-server-priced",
      "true",
    );
    await expect(page.getByTestId("cart-items").locator("> li")).toHaveCount(1);

    // And a reload must not replay it again either.
    await page.reload();
    await expect(page.getByTestId("cart-items").locator("> li")).toHaveCount(1);

    // The row count alone would survive a replay that merely doubled the
    // QUANTITY on the one line, which is exactly what the StrictMode bug did.
    // So the server cart is read directly and the quantity pinned at one.
    const access = await token(request);
    const cart = await (
      await request.get(`${API}/cart`, {
        headers: { Authorization: `Bearer ${access}` },
      })
    ).json();
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(1);
  });

  test("a coupon is applied and removed server-side, repricing both ways", async ({
    page,
  }) => {
    await addEarbudsAsGuest(page);
    await signIn(page, "/cart");

    await expect(page.getByTestId("cart-summary")).toHaveAttribute(
      "data-server-priced",
      "true",
    );

    const total = page.getByTestId("summary-total");
    const before = (await total.textContent()) ?? "";

    await page.getByTestId("coupon-input").fill("SHUBAYR10");
    await page.getByTestId("coupon-apply").click();

    // The discount row only exists once the server says there is one.
    await expect(page.getByTestId("summary-discount")).toBeVisible();
    await expect(total).not.toHaveText(before);

    // The control this PR could finally offer: DELETE /cart/coupon.
    await page.getByTestId("coupon-remove").click();
    await expect(page.getByTestId("summary-discount")).toHaveCount(0);
    await expect(total).toHaveText(before);
  });

  test("COD checkout places one real order and shows its number", async ({
    page,
    request,
  }) => {
    await addEarbudsAsGuest(page);
    // Signing in replays the guest basket onto the server cart on the way.
    await signIn(page, "/checkout");

    // A signed-in customer picks from the address book rather than typing.
    await expect(page.getByTestId("saved-addresses")).toBeVisible();
    await page.getByTestId("address-submit").click();

    await expect(page.getByTestId("place-order")).toBeVisible();
    await page.getByTestId("place-order").click();

    await expect(page.getByTestId("order-confirmation")).toBeVisible({
      timeout: 30000,
    });
    const number = (
      await page.getByTestId("order-number").first().textContent()
    )?.trim();
    expect(number).toMatch(/^ORD-/);

    // The server consumed its cart; the storefront must agree.
    await page.goto("/cart");
    await expect(page.getByTestId("cart-items")).toHaveCount(0);

    // Exactly one order carries that number — a double-submit would have
    // produced two, and the idempotency key is what stops it.
    const access = await token(request);
    const orders = await (
      await request.get(`${API}/orders?per_page=50`, {
        headers: { Authorization: `Bearer ${access}` },
      })
    ).json();
    const matching = (orders.data ?? []).filter(
      (order: { order_number?: string }) => order.order_number === number,
    );
    expect(matching).toHaveLength(1);

    // The order is in the customer's own list, and its detail renders from the
    // snapshots the order captured rather than from live catalogue data.
    await page.goto("/account/orders");
    await expect(page.getByTestId("order-list")).toContainText(number ?? "");

    // The row for THIS order, not whichever happens to sort first.
    await page
      .getByTestId("order-row")
      .filter({ hasText: number ?? "" })
      .first()
      .click();
    await page.waitForURL(/\/account\/orders\/[^/]+$/);

    await expect(page.getByTestId("order-number")).toContainText(number ?? "");
    await expect(page.getByTestId("order-address")).toBeVisible();
    await expect(page.getByTestId("order-total")).toBeVisible();
    await expect(page.getByTestId("order-tracking")).toBeVisible();

    // A brand-new order has a delivery nobody has picked up yet.
    await expect(page.getByTestId("delivery-status")).toHaveAttribute(
      "data-stage",
      "assigned",
    );
  });

  test("a double submit yields one order, not two", async ({
    page,
    request,
  }) => {
    await addEarbudsAsGuest(page);
    await signIn(page, "/checkout");
    await expect(page.getByTestId("saved-addresses")).toBeVisible();
    await page.getByTestId("address-submit").click();

    const access = await token(request);
    const countOrders = async (): Promise<number> =>
      (
        await (
          await request.get(`${API}/orders?per_page=50`, {
            headers: { Authorization: `Bearer ${access}` },
          })
        ).json()
      ).total as number;

    const before = await countOrders();

    // Two clicks as fast as the browser will deliver them. The button disables
    // itself on the first, so this is the real-world double-tap rather than a
    // synthetic replay of the request.
    const place = page.getByTestId("place-order");
    await place.click();
    await place.click({ force: true, timeout: 2000 }).catch(() => undefined);

    await expect(page.getByTestId("order-confirmation")).toBeVisible({
      timeout: 30000,
    });
    expect(await countOrders()).toBe(before + 1);
  });

  test("an address is created with an E.164 phone from a local number", async ({
    page,
    request,
  }) => {
    await signIn(page, "/account/addresses");

    await expect(page.getByTestId("address-add")).toBeVisible();
    await page.getByTestId("address-add").click();

    const label = `Live ${Date.now().toString(36)}`;
    await page.getByTestId("address-label").fill(label);
    await page.getByTestId("address-city").fill("بغداد");
    await page.getByTestId("address-area").fill("الكرادة");
    await page.getByTestId("address-street").fill("شارع 62");

    // Typed the way an Iraqi customer writes it. The server requires E.164, so
    // what lands on the API must be the normalised form.
    await page.getByTestId("address-phone").fill(PHONE_LOCAL);
    await page.getByTestId("address-save").click();

    await expect(page.getByTestId("address-list")).toContainText(label);

    const access = await token(request);
    const addresses = await (
      await request.get(`${API}/addresses?per_page=50`, {
        headers: { Authorization: `Bearer ${access}` },
      })
    ).json();
    const created = (addresses.data ?? []).find(
      (entry: { label?: string }) => entry.label === label,
    );
    expect(created).toBeTruthy();
    expect(created.contact_phone).toBe(CUSTOMER_E164);

    // Tidy up, so a re-run does not silt the account up with addresses.
    await request.delete(`${API}/addresses/${created.id}`, {
      headers: { Authorization: `Bearer ${access}` },
    });
  });

  test("a malformed phone is refused before it reaches the API", async ({
    page,
  }) => {
    await signIn(page, "/account/addresses");
    await expect(page.getByTestId("address-add")).toBeVisible();
    await page.getByTestId("address-add").click();

    await page.getByTestId("address-label").fill("Bad phone");
    await page.getByTestId("address-city").fill("بغداد");
    await page.getByTestId("address-area").fill("الكرادة");
    await page.getByTestId("address-street").fill("شارع 62");
    await page.getByTestId("address-phone").fill("123");

    let posted = false;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/addresses")) {
        posted = true;
      }
    });

    await page.getByTestId("address-save").click();

    // The editor stays open with the field marked, and nothing was sent.
    await expect(page.getByTestId("address-editor")).toBeVisible();
    expect(posted).toBe(false);
  });

  test("an unavailable line is flagged and holds the cart's checkout", async ({
    page,
    request,
  }) => {
    await addEarbudsAsGuest(page);
    await signIn(page, "/cart");
    await expect(page.getByTestId("cart-summary")).toHaveAttribute(
      "data-server-priced",
      "true",
    );
    await expect(page.getByTestId("cart-checkout")).toBeVisible();

    try {
      // The product goes off sale while the basket already holds it.
      await setProductStatus(request, EARBUDS, "hidden");
      await page.reload();

      // The row says which line is the problem, and the CTA is not a link any
      // more, because there is nothing behind it that could succeed.
      await expect(page.getByTestId("cart-unavailable-banner")).toBeVisible();
      await expect(page.getByTestId("cart-line-unavailable")).toHaveCount(1);
      await expect(page.getByTestId("cart-checkout")).toHaveCount(0);
      await expect(page.getByTestId("cart-checkout-blocked")).toBeDisabled();
    } finally {
      await setProductStatus(request, EARBUDS, "active");
    }

    // Put back on sale, the cart is buyable again without any other action.
    await page.reload();
    await expect(page.getByTestId("cart-unavailable-banner")).toHaveCount(0);
    await expect(page.getByTestId("cart-checkout")).toBeVisible();
  });

  test("a sell-out during checkout bounces back to the cart, line flagged", async ({
    page,
    request,
  }) => {
    await addEarbudsAsGuest(page);
    await signIn(page, "/checkout");
    await expect(page.getByTestId("saved-addresses")).toBeVisible();
    await page.getByTestId("address-submit").click();
    await expect(page.getByTestId("place-order")).toBeVisible();

    try {
      // Sold out between reaching review and pressing the button — the race
      // POST /orders answers 409 for.
      await setProductStatus(request, EARBUDS, "hidden");
      await page.getByTestId("place-order").click();

      // Not an error beside a dead button: the shopper is returned to the one
      // screen that can show them which line to fix.
      await page.waitForURL(/\/cart$/, { timeout: 30000 });
      await expect(page.getByTestId("cart-unavailable-banner")).toBeVisible();
      await expect(page.getByTestId("cart-line-unavailable")).toHaveCount(1);
    } finally {
      await setProductStatus(request, EARBUDS, "active");
    }
  });

  test("tracking shows the delivery's own stage for every seeded order", async ({
    page,
    request,
  }) => {
    const access = await token(request);
    const orders = await (
      await request.get(`${API}/orders?per_page=50`, {
        headers: { Authorization: `Bearer ${access}` },
      })
    ).json();

    /** Order status -> the delivery stage the customer should be shown. */
    const expected: Record<string, string> = {
      pending: "assigned",
      confirmed: "assigned",
      preparing: "assigned",
      ready_for_dispatch: "assigned",
      dispatched: "out_for_delivery",
      delivered: "delivered",
      failed: "failed",
    };

    await signIn(page, "/account/orders");

    // The seed carries an order in each stage, so this walks them all rather
    // than asserting one and hoping the mapping holds for the rest.
    const seen = new Set<string>();
    for (const order of orders.data ?? []) {
      const stage = expected[order.status as string];
      if (!stage || seen.has(stage)) continue;
      seen.add(stage);

      await page.goto(`/account/orders/${order.id}`);
      await expect(page.getByTestId("delivery-status")).toHaveAttribute(
        "data-stage",
        stage,
      );
      await expect(page.getByTestId("order-tracking")).toBeVisible();
    }

    // Anything less and this test would be quietly asserting almost nothing.
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
