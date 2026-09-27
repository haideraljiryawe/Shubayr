import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Smoke test for the server cart and COD checkout, against the REAL backend.
 *
 * Runs only when the API is reachable, so the rest of the suite stays hermetic.
 * It talks to the API directly rather than through a page: what is under test
 * here is the contract the storefront now depends on — server repricing,
 * server totals, idempotent placement and cancellation — and a Node-side
 * request is not subject to the browser's CORS rules.
 *
 * Start the stack with `docker compose --profile full up -d` and seed it.
 */

import {
  API,
  awaitQuota,
  bearer as auth,
  customerToken as signIn,
  requireLiveApi,
} from "./live-api";

/** Leave the cart empty so each test starts from a known basket. */
async function emptyCart(request: APIRequestContext, token: string) {
  const cart = await (
    await request.get(`${API}/cart`, { headers: auth(token) })
  ).json();
  for (const item of cart.items ?? []) {
    await request.delete(`${API}/cart/items/${item.id}`, {
      headers: auth(token),
    });
  }
}

/**
 * A product the seed always carries, with a known active discount.
 *
 * The variant matters: the seed puts all stock on variants and leaves the
 * variantless SKU at zero, so an add without one is refused for want of stock.
 */
const EARBUDS = "40000000-0000-4000-8000-000000000001";
const EARBUDS_VARIANT = "50000000-0000-4000-8000-000000000001";

test.describe("live cart and COD checkout", () => {
  test.beforeEach(async ({ request }) => {
    await requireLiveApi(request, "the live smoke test");
    await awaitQuota(request);
  });

  test("the server reprices the cart and owns every total", async ({
    request,
  }) => {
    const token = await signIn(request);
    await emptyCart(request, token);

    const added = await (
      await request.post(`${API}/cart/items`, {
        headers: auth(token),
        data: { product_id: EARBUDS, variant_id: EARBUDS_VARIANT, quantity: 2 },
      })
    ).json();

    expect(added.items).toHaveLength(1);
    const line = added.items[0];
    expect(line.quantity).toBe(2);
    // The price is the catalogue's current effective_price, not anything the
    // client asked for — the request carried no money at all.
    expect(line.unit_price).toBeGreaterThan(0);
    expect(line.line_total).toBeCloseTo(line.unit_price * 2, 2);
    expect(added.subtotal).toBeCloseTo(line.line_total, 2);
    expect(added.total).toBeCloseTo(
      added.subtotal + added.delivery_fee - added.discount,
      2,
    );
    // Availability travels with the line, so the UI can refuse checkout.
    expect(line).toHaveProperty("available");
    expect(line).toHaveProperty("available_qty");

    // Changing the quantity reprices the whole cart.
    const updated = await (
      await request.patch(`${API}/cart/items/${line.id}`, {
        headers: auth(token),
        data: { quantity: 3 },
      })
    ).json();
    expect(updated.items[0].quantity).toBe(3);
    expect(updated.subtotal).toBeCloseTo(line.unit_price * 3, 2);

    const removed = await request.delete(`${API}/cart/items/${line.id}`, {
      headers: auth(token),
    });
    expect(removed.status()).toBe(204);
  });

  test("a coupon is applied by the server, not priced by the client", async ({
    request,
  }) => {
    const token = await signIn(request);
    await emptyCart(request, token);
    await request.post(`${API}/cart/items`, {
      headers: auth(token),
      data: { product_id: EARBUDS, variant_id: EARBUDS_VARIANT, quantity: 1 },
    });

    const validated = await request.post(`${API}/coupons/validate`, {
      headers: auth(token),
      data: { code: "SHUBAYR10" },
    });
    test.skip(
      validated.status() === 404,
      "No SHUBAYR10 coupon in this database — the seed carries none.",
    );
    expect(validated.ok()).toBe(true);

    const cart = await (
      await request.get(`${API}/cart`, { headers: auth(token) })
    ).json();
    expect(cart.coupon_code).toBe("SHUBAYR10");
    expect(cart.discount).toBeGreaterThan(0);
    expect(cart.total).toBeCloseTo(
      cart.subtotal + cart.delivery_fee - cart.discount,
      2,
    );
  });

  test("a repeated Idempotency-Key returns the same order, never a second", async ({
    request,
  }) => {
    const token = await signIn(request);
    await emptyCart(request, token);
    await request.post(`${API}/cart/items`, {
      headers: auth(token),
      data: { product_id: EARBUDS, variant_id: EARBUDS_VARIANT, quantity: 1 },
    });

    const addresses = await (
      await request.get(`${API}/addresses`, { headers: auth(token) })
    ).json();
    const addressId = addresses.data?.[0]?.id;
    expect(addressId, "the seed should carry a saved address").toBeTruthy();

    const key = `web-test-${Date.now()}`;
    const body = { address_id: addressId, payment_method: "cod" };

    const first = await request.post(`${API}/orders`, {
      headers: { ...auth(token), "Idempotency-Key": key },
      data: body,
    });
    expect(first.status()).toBe(201);
    const order = await first.json();

    // The retry a double-submit or a dropped response would produce. The cart
    // has already been consumed, so without idempotency this would fail — and
    // worse, a fresh cart would have produced a second order.
    const replay = await request.post(`${API}/orders`, {
      headers: { ...auth(token), "Idempotency-Key": key },
      data: body,
    });
    expect(replay.ok()).toBe(true);
    expect((await replay.json()).id).toBe(order.id);

    // Exactly one order carries this number.
    const list = await (
      await request.get(`${API}/orders?per_page=100`, { headers: auth(token) })
    ).json();
    const matching = list.data.filter(
      (candidate: { id: string }) => candidate.id === order.id,
    );
    expect(matching).toHaveLength(1);
  });

  test("an order can be cancelled while its status allows it", async ({
    request,
  }) => {
    const token = await signIn(request);
    await emptyCart(request, token);
    await request.post(`${API}/cart/items`, {
      headers: auth(token),
      data: { product_id: EARBUDS, variant_id: EARBUDS_VARIANT, quantity: 1 },
    });

    const addresses = await (
      await request.get(`${API}/addresses`, { headers: auth(token) })
    ).json();
    const placed = await (
      await request.post(`${API}/orders`, {
        headers: {
          ...auth(token),
          "Idempotency-Key": `web-cancel-${Date.now()}`,
        },
        data: { address_id: addresses.data[0].id, payment_method: "cod" },
      })
    ).json();
    expect(placed.status).toBe("pending");

    // Tracking exists from the moment the order does.
    const tracking = await (
      await request.get(`${API}/orders/${placed.id}/track`, {
        headers: auth(token),
      })
    ).json();
    expect(tracking.events.length).toBeGreaterThan(0);

    const cancelled = await request.post(`${API}/orders/${placed.id}/cancel`, {
      headers: auth(token),
    });
    expect(cancelled.ok()).toBe(true);
    expect((await cancelled.json()).status).toBe("cancelled");

    // Cancelling again is refused rather than silently repeated.
    const again = await request.post(`${API}/orders/${placed.id}/cancel`, {
      headers: auth(token),
    });
    expect(again.status()).toBe(409);
  });

  test("order reads carry the immutable item snapshots", async ({
    request,
  }) => {
    const token = await signIn(request);
    const list = await (
      await request.get(`${API}/orders?per_page=1`, { headers: auth(token) })
    ).json();
    test.skip(list.total === 0, "No orders for the seeded customer yet.");

    const detail = await (
      await request.get(`${API}/orders/${list.data[0].id}`, {
        headers: auth(token),
      })
    ).json();

    expect(detail.items.length).toBeGreaterThan(0);
    for (const item of detail.items) {
      // The snapshot fields the order screens render from, so a later rename
      // in the catalogue cannot rewrite order history.
      expect(item).toHaveProperty("product_name_ar");
      expect(item).toHaveProperty("product_name_en");
      expect(item).toHaveProperty("unit_price");
      expect(item).toHaveProperty("line_total");
    }
  });
});
