import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  API,
  AGENT_E164,
  awaitQuota,
  bearer,
  customerToken,
  requireLiveApi,
  signIn,
  staffToken,
  tokenFor,
  customerAddress,
} from "./live-api";

/** A count as the page prints it: the same digits, thousands grouped or not. */
function grouped(value: number): RegExp {
  return new RegExp(`^${String(value).split("").join("[,٬]?")}$`);
}

/**
 * The account extras, in a browser, against the real API: returns, loyalty,
 * writing reviews, and notification preferences.
 *
 * Every test that needs a delivered order MINTS ONE rather than reusing the
 * seed. Returns are irreversible — a returned quantity is spent for good — so
 * a suite that leaned on the seeded order would pass once and then slowly
 * poison itself. Minting costs a handful of requests and makes the run
 * repeatable, which matters more.
 *
 * The wishlist has its own live spec (live-wishlist.spec.ts).
 */

/** Stock sits on the variant; the variantless SKU is seeded at zero. */
const EARBUDS = "40000000-0000-4000-8000-000000000001";
const EARBUDS_VARIANT = "50000000-0000-4000-8000-000000000001";

interface DeliveredOrder {
  id: string;
  orderItemId: string;
  /** How many units the single line carries, so a partial return is possible. */
  quantity: number;
}

/**
 * Place an order and walk it all the way to `delivered`.
 *
 * Staff can only drive an order as far as `dispatched`; `delivered` is the
 * assigned agent's to set, and setting it advances the order in the same
 * transaction. So this borrows three identities in turn, which is also a
 * decent end-to-end check that the fulfilment chain still works.
 */
async function mintDeliveredOrder(
  request: APIRequestContext,
  quantity = 2,
): Promise<DeliveredOrder> {
  const customer = await customerToken(request);
  const admin = await staffToken(request);
  const agent = await tokenFor(request, AGENT_E164);

  // Start from an empty cart so the order contains exactly this line.
  const cart = await (
    await request.get(`${API}/cart`, { headers: bearer(customer) })
  ).json();
  for (const item of cart.items ?? []) {
    await request.delete(`${API}/cart/items/${item.id}`, {
      headers: bearer(customer),
    });
  }
  await request.post(`${API}/cart/items`, {
    headers: bearer(customer),
    data: { product_id: EARBUDS, variant_id: EARBUDS_VARIANT, quantity },
  });

  const placed = await request.post(`${API}/orders`, {
    headers: {
      ...bearer(customer),
      "Idempotency-Key": `live-account-${Date.now()}-${Math.random()}`,
    },
    data: { address_id: await customerAddress(request), payment_method: "cod" },
  });
  expect(placed.ok()).toBe(true);
  const order = await placed.json();
  let orderVersion = order.version as number;

  for (const status of ["confirmed", "preparing", "ready_for_dispatch"]) {
    const moved = await request.patch(
      `${API}/admin/orders/${order.id}/status`,
      { headers: bearer(admin), data: { status, version: orderVersion } },
    );
    expect(moved.ok()).toBe(true);
    orderVersion = ((await moved.json()) as { version: number }).version;
  }

  const me = await (
    await request.get(`${API}/me`, { headers: bearer(agent) })
  ).json();
  await request.patch(`${API}/deliveries/${order.delivery_id}/assign`, {
    headers: bearer(admin),
    data: { agent_id: me.id },
  });
  for (const status of ["out_for_delivery", "delivered"]) {
    const moved = await request.patch(`${API}/deliveries/${order.delivery_id}`, {
      headers: bearer(agent),
      data: {
        status,
        order_version: orderVersion,
        // API 12.0: delivered says what was collected — here, all of it.
        ...(status === "delivered"
          ? {
              operation_id: `live-account-${order.delivery_id}`,
              collection_confirmation: "confirmed",
              collected_amount: String(order.total),
            }
          : {}),
      },
    });
    expect(moved.ok()).toBe(true);
    orderVersion = ((await moved.json()) as { order_version: number }).order_version;
  }

  const fresh = await (
    await request.get(`${API}/orders/${order.id}`, { headers: bearer(customer) })
  ).json();
  expect(fresh.status).toBe("delivered");

  return {
    id: fresh.id,
    orderItemId: fresh.items[0].id,
    quantity: fresh.items[0].quantity,
  };
}

test.describe("live account extras", () => {
  test.beforeEach(async ({ request, page }) => {
    await requireLiveApi(request, "the live account tests");
    await awaitQuota(request);
    await page.goto("/");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test("a partial return carries a per-line reason and shows the server's refund", async ({
    page,
    request,
  }) => {
    const order = await mintDeliveredOrder(request, 2);

    await signIn(page, `/account/orders/${order.id}/return`);
    await expect(page.getByTestId("return-form")).toBeVisible();

    // Return one of the two units — the partial case.
    await page.getByTestId(`return-check-${order.orderItemId}`).check();
    await expect(
      page.getByTestId(`return-qty-${order.orderItemId}`),
    ).toBeVisible();

    // The contract requires a reason per LINE, and the form refuses without
    // one rather than spending a 422 to find out.
    await page.getByTestId("return-submit").click();
    await expect(page.getByTestId("return-error")).toBeVisible();

    await page
      .getByTestId(`return-line-reason-${order.orderItemId}`)
      .fill("Arrived damaged");
    await page.getByTestId("return-submit").click();

    // It lands on the list, newest first, awaiting review.
    await page.waitForURL(/\/account\/returns$/);
    const first = page.getByTestId("returns-list").locator("> li").first();
    await expect(first).toContainText("Arrived damaged");

    // The refund is the SERVER's, from the order line's immutable price — the
    // page renders it and never multiplies anything out.
    const customer = await customerToken(request);
    const returns = await (
      await request.get(`${API}/returns?per_page=5`, {
        headers: bearer(customer),
      })
    ).json();
    const mine = returns.data.find(
      (entry: { order_id: string }) => entry.order_id === order.id,
    );
    expect(mine).toBeTruthy();
    expect(mine.items[0].customer_reason).toBe("Arrived damaged");
    expect(mine.items[0].quantity).toBe(1);
    await expect(
      page.getByTestId(`return-refund-${mine.id}`),
    ).toBeVisible();

    // One unit is now spent, so the form offers only the remaining one.
    await page.goto(`/account/orders/${order.id}/return`);
    await expect(
      page.getByTestId(`return-eligible-${order.orderItemId}`),
    ).toBeVisible();
    await page.getByTestId(`return-check-${order.orderItemId}`).check();
    const stepper = page.getByTestId(`return-qty-${order.orderItemId}`);
    // The cap is one: the "+" is dead because there is nothing left to add.
    await expect(stepper.getByRole("button").last()).toBeDisabled();
  });

  test("loyalty renders the server's balance and ledger, and spends points", async ({
    page,
    request,
  }) => {
    // This worker's customer earns points the way every customer does: a
    // delivered order. (A new account starts with none to show or spend.)
    await mintDeliveredOrder(request, 1);
    const customer = await customerToken(request);
    const before = await (
      await request.get(`${API}/loyalty?per_page=1`, {
        headers: bearer(customer),
      })
    ).json();

    await signIn(page, "/account/points");

    // The balance on screen is the server's figure, not a sum of the page.
    await expect(page.getByTestId("points-balance")).toHaveText(
      grouped(before.points_balance),
    );
    await expect(page.getByTestId("points-ledger")).toBeVisible();

    // Spending one point is enough to prove the round trip, and cheap enough
    // that repeated runs never drain the account.
    await page.getByTestId("redeem-points").fill("1");
    await page.getByTestId("redeem-submit").click();

    await expect(page.getByTestId("points-balance")).toHaveText(
      grouped(before.points_balance - 1),
      { timeout: 15000 },
    );

    // Spending more than you hold is the server's refusal, surfaced as such.
    await page.getByTestId("redeem-points").fill("99999999");
    await page.getByTestId("redeem-submit").click();
    await expect(page.getByTestId("redeem-form").getByRole("alert")).toBeVisible();

    // And the balance did not move on a refused redemption.
    const after = await (
      await request.get(`${API}/loyalty?per_page=1`, {
        headers: bearer(customer),
      })
    ).json();
    expect(after.points_balance).toBe(before.points_balance - 1);
  });

  test("a purchased line can be reviewed, edited and deleted", async ({
    page,
    request,
  }) => {
    const order = await mintDeliveredOrder(request, 1);

    await signIn(page, `/account/orders/${order.id}`);

    // The line starts reviewable because OrderItem.reviewed is false.
    const open = page.getByTestId(`review-open-${order.orderItemId}`);
    await expect(open).toBeVisible();
    await open.click();

    const form = page.getByTestId(`review-form-${order.orderItemId}`);
    await form.getByTestId(`review-stars-${order.orderItemId}-star-4`).click();
    await form.getByRole("textbox").fill("Solid little earbuds.");
    await page.getByTestId(`review-submit-${order.orderItemId}`).click();

    // New reviews start pending moderation, which the badge reflects.
    const badge = page.getByTestId(`review-done-${order.orderItemId}`);
    await expect(badge).toHaveAttribute("data-status", "pending");
    await expect(open).toHaveCount(0);

    const customer = await customerToken(request);
    const reviewed = await (
      await request.get(`${API}/orders/${order.id}`, {
        headers: bearer(customer),
      })
    ).json();
    expect(reviewed.items[0].reviewed).toBe(true);

    // Edit: the review is still identifiable in this session, so the controls
    // are offered and PATCH /reviews/{id} is reachable.
    await page.getByTestId(`review-edit-${order.orderItemId}`).click();
    await form
      .getByTestId(`review-stars-${order.orderItemId}-star-5`)
      .click();
    await page.getByTestId(`review-submit-${order.orderItemId}`).click();
    await expect(badge).toHaveAttribute("data-status", "pending");

    // Delete: the line becomes reviewable again, and the server clears the flag.
    await page.getByTestId(`review-delete-${order.orderItemId}`).click();
    await expect(open).toBeVisible({ timeout: 15000 });

    const cleared = await (
      await request.get(`${API}/orders/${order.id}`, {
        headers: bearer(customer),
      })
    ).json();
    expect(cleared.items[0].reviewed).toBe(false);
  });

  test("a pending review is still the customer's to edit and delete after a reload", async ({
    page,
    request,
  }) => {
    const order = await mintDeliveredOrder(request, 1);
    const item = order.orderItemId;

    await signIn(page, `/account/orders/${order.id}`);
    await page.getByTestId(`review-open-${item}`).click();
    const form = page.getByTestId(`review-form-${item}`);
    await form.getByTestId(`review-stars-${item}-star-3`).click();
    await form.getByRole("textbox").fill("Waiting on a moderator.");
    await page.getByTestId(`review-submit-${item}`).click();
    const badge = page.getByTestId(`review-done-${item}`);
    await expect(badge).toHaveAttribute("data-status", "pending");

    // The reload is the whole point: nothing of this session survives it, and
    // the public product list is published-only, so only GET /me/reviews can
    // find this review again.
    await page.reload();
    await expect(badge).toHaveAttribute("data-status", "pending");
    await expect(page.getByTestId(`review-mine-${item}`)).toContainText(
      "Waiting on a moderator.",
    );
    await expect(page.getByTestId(`review-locked-${item}`)).toHaveCount(0);

    // Edit it after the reload…
    await page.getByTestId(`review-edit-${item}`).click();
    await form.getByTestId(`review-stars-${item}-star-5`).click();
    await form.getByRole("textbox").fill("Edited after a reload.");
    await page.getByTestId(`review-submit-${item}`).click();
    await expect(page.getByTestId(`review-mine-${item}`)).toContainText(
      "Edited after a reload.",
    );

    const customer = await customerToken(request);
    const mine = await (
      await request.get(`${API}/me/reviews?per_page=100`, {
        headers: bearer(customer),
      })
    ).json();
    const stored = mine.data.find(
      (review: { order_item_id: string }) => review.order_item_id === item,
    );
    expect(stored).toMatchObject({
      rating: 5,
      comment: "Edited after a reload.",
      status: "pending",
    });

    // …and delete it after another.
    await page.reload();
    await page.getByTestId(`review-delete-${item}`).click();
    await expect(page.getByTestId(`review-open-${item}`)).toBeVisible({
      timeout: 15000,
    });
    const gone = await (
      await request.get(`${API}/me/reviews?per_page=100`, {
        headers: bearer(customer),
      })
    ).json();
    expect(
      gone.data.some(
        (review: { order_item_id: string }) => review.order_item_id === item,
      ),
    ).toBe(false);
  });

  test("the customer sees a moderator's decision on their own review", async ({
    page,
    request,
  }) => {
    const order = await mintDeliveredOrder(request, 1);
    const item = order.orderItemId;
    const customer = await customerToken(request);
    const admin = await staffToken(request);

    const created = await request.post(`${API}/products/${EARBUDS}/reviews`, {
      headers: bearer(customer),
      data: { order_item_id: item, rating: 2, comment: "Moderate me." },
    });
    expect(created.ok()).toBe(true);
    const review = await created.json();

    const rejected = await request.post(
      `${API}/admin/reviews/${review.id}/moderate`,
      {
        headers: bearer(admin),
        data: { decision: "reject", reason: "Off-topic" },
      },
    );
    expect(rejected.ok()).toBe(true);

    await signIn(page, `/account/orders/${order.id}`);
    const badge = page.getByTestId(`review-done-${item}`);
    await expect(badge).toHaveAttribute("data-status", "rejected");
    // The moderator's reason reaches the author, with the way back.
    await expect(page.getByTestId(`review-rejected-${item}`)).toContainText(
      "Off-topic",
    );
    await expect(page.getByTestId(`review-edit-${item}`)).toBeVisible();

    const published = await request.post(
      `${API}/admin/reviews/${review.id}/moderate`,
      {
        headers: bearer(admin),
        data: { decision: "publish", reason: "Reconsidered" },
      },
    );
    expect(published.ok()).toBe(true);

    await page.reload();
    await expect(badge).toHaveAttribute("data-status", "published");
    await expect(page.getByTestId(`review-rejected-${item}`)).toHaveCount(0);
  });

  test("a notification preference is stored on the account, not the device", async ({
    page,
    request,
  }) => {
    const customer = await customerToken(request);
    const before = await (
      await request.get(`${API}/me/notification-preferences`, {
        headers: bearer(customer),
      })
    ).json();
    const promoPush = before.preferences.find(
      (entry: { type: string; channel: string }) =>
        entry.type === "promo" && entry.channel === "push",
    );
    const target = !promoPush.enabled;

    await signIn(page, "/account/notifications");
    await expect(page.getByTestId("notification-prefs")).toBeVisible();

    // Order-confirmation SMS is mandatory; the server refuses to turn it off,
    // so the UI does not offer an action that could only be rejected.
    const mandatory = page.getByTestId("notify-order_confirmed-sms");
    await expect(mandatory).toBeChecked();
    await expect(mandatory).toBeDisabled();

    // The sr-only input is driven by its enclosing label, which is the
    // visible switch a pointer actually hits.
    await page.locator('label:has([data-testid="notify-promo-push"])').click();
    await expect(page.getByTestId("notify-promo-push")).toBeChecked({
      checked: target,
      timeout: 15000,
    });

    // The real proof: it survives a reload, because it lives on the account
    // rather than in this browser's storage.
    await page.reload();
    await expect(page.getByTestId("notify-promo-push")).toBeChecked({
      checked: target,
    });

    const after = await (
      await request.get(`${API}/me/notification-preferences`, {
        headers: bearer(customer),
      })
    ).json();
    const stored = after.preferences.find(
      (entry: { type: string; channel: string }) =>
        entry.type === "promo" && entry.channel === "push",
    );
    expect(stored.enabled).toBe(target);

    // Put it back, so a re-run starts where this one did.
    await request.patch(`${API}/me/notification-preferences`, {
      headers: bearer(customer),
      data: {
        preferences: [
          { type: "promo", channel: "push", enabled: promoPush.enabled },
        ],
      },
    });
  });

  test("the server rejects an unknown preference type", async ({ request }) => {
    const customer = await customerToken(request);
    const response = await request.patch(
      `${API}/me/notification-preferences`,
      {
        headers: bearer(customer),
        data: {
          preferences: [
            { type: "not_a_real_type", channel: "push", enabled: true },
          ],
        },
      },
    );
    expect(response.status()).toBe(422);
  });
});
