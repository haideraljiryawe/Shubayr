import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  API,
  bearer,
  customerToken,
  requireLiveApi,
  signIn,
  staffToken,
  stockedProduct,
  CUSTOMER_E164,
} from "./live-api";

/**
 * Delivery by governorate and the automatic discount, in the store against a
 * real API (15.0):
 *
 * - the tier progress bar below, at and above each threshold, with the
 *   automatic discount on its own line, in the cart and at checkout;
 * - a governorate no active zone serves: marked in the address form, refused
 *   by name, and a saved address there cannot continue.
 *
 * Both change store-wide pricing (discount tiers, Halabja's zone), so they run
 * alone after the parallel specs (@global) and put everything back.
 */

async function admin(request: APIRequestContext) {
  return bearer(await staffToken(request));
}

async function clearCart(request: APIRequestContext, headers: Record<string, string>) {
  const cart = await (await request.get(`${API}/cart`, { headers })).json();
  for (const item of cart.items ?? []) await request.delete(`${API}/cart/items/${item.id}`, { headers });
}

test.beforeEach(async ({ request }) => {
  await requireLiveApi(request, "delivery pricing");
});

test("the discount progress bar below, at and above each tier", { tag: "@global" }, async ({ page, request }) => {
  const staff = await admin(request);
  const product = await stockedProduct(request, "tier", 10); // 15,000 IQD each
  const tierIds: string[] = [];
  const customer = bearer(await customerToken(request));
  try {
    // Thresholds unique to this run, right at two and three units.
    const stamp = (Date.now() % 997) + 1;
    for (const [min, percent] of [
      [30_000 + stamp, 5],
      [45_000 + stamp, 10],
    ] as const) {
      const created = await request.post(`${API}/admin/discount-tiers`, { headers: staff, data: { min_subtotal_iqd: min, percent } });
      expect(created.status(), await created.text()).toBe(201);
      tierIds.push((await created.json()).id);
    }
    // Two units are 30,000: just below the first tier.
    await clearCart(request, customer);
    const added = await request.post(`${API}/cart/items`, {
      headers: customer,
      data: { product_id: product.id, variant_id: product.variant, quantity: 2 },
    });
    expect(added.ok(), await added.text()).toBe(true);

    await signIn(page, "/cart");
    await page.goto("/cart");
    const bar = page.getByTestId("tier-progress");
    await expect(bar).toHaveAttribute("data-kind", "next");
    await expect(bar.getByTestId("tier-progress-text")).toContainText(`${stamp}`);
    await expect(bar.getByTestId("tier-progress-text")).toContainText("لتحصل على خصم 5٪");
    await expect(bar.getByTestId("tier-progress-current")).toHaveCount(0);
    await expect(page.getByTestId("summary-tier-discount")).toHaveCount(0);
    await expect(page.getByTestId("summary-delivery")).toHaveText("حسب المحافظة");

    // Three units (45,000) pass the first tier: 5% applied, 10% next.
    await page.getByRole("button", { name: "زيادة الكمية" }).click();
    await expect(bar.getByTestId("tier-progress-text")).toContainText("لتحصل على خصم 10٪");
    await expect(bar.getByTestId("tier-progress-current")).toHaveText("خصمك الحالي 5٪");
    await expect(page.getByTestId("summary-tier-discount")).toContainText("2,250");
    await expect(page.getByTestId("cart-summary")).toContainText("خصم تلقائي 5٪");

    // Four units (60,000): the top tier — "You're getting 10% off".
    await page.getByRole("button", { name: "زيادة الكمية" }).click();
    await expect(bar).toHaveAttribute("data-kind", "top");
    await expect(bar.getByTestId("tier-progress-text")).toHaveText("تحصل على خصم 10٪");
    await expect(page.getByTestId("summary-tier-discount")).toContainText("6,000");
    const cart = await (await request.get(`${API}/cart`, { headers: customer })).json();
    expect(cart).toMatchObject({ subtotal: 60_000, tier_discount: 6_000, discount_source: "tier", next_tier: null });

    // The checkout's review shows the same bar and line.
    await page.getByTestId("cart-checkout").click();
    await page.getByTestId("address-submit").click();
    await expect(page.getByTestId("tier-progress")).toHaveAttribute("data-kind", "top");
    await expect(page.getByTestId("summary-tier-discount")).toContainText("6,000");
  } finally {
    for (const id of tierIds) await request.delete(`${API}/admin/discount-tiers/${id}`, { headers: staff });
    await clearCart(request, customer);
  }
});

test("a governorate with no delivery zone: marked, refused by name, and not continued with", { tag: "@global" }, async ({ page, request }) => {
  const staff = await admin(request);
  const customer = bearer(await customerToken(request));
  const governorates = (await (await request.get(`${API}/admin/governorates`, { headers: staff })).json()) as Array<{
    id: string;
    code: string;
    delivery_zone: { id: string } | null;
  }>;
  const halabja = governorates.find((row) => row.code === "halabja")!;
  const homeId = halabja.delivery_zone?.id ?? null;
  let addressId: string | null = null;
  const product = await stockedProduct(request, "zone", 3);
  try {
    // Halabja leaves its zone: not served.
    if (homeId) {
      const home = (await (await request.get(`${API}/admin/delivery-zones`, { headers: staff })).json()).find(
        (zone: { id: string }) => zone.id === homeId,
      ) as { governorates: Array<{ id: string }> };
      const released = await request.patch(`${API}/admin/delivery-zones/${homeId}`, {
        headers: staff,
        data: { governorate_ids: home.governorates.filter((row) => row.id !== halabja.id).map((row) => row.id) },
      });
      expect(released.ok(), await released.text()).toBe(true);
    }
    const created = await request.post(`${API}/addresses`, {
      headers: customer,
      data: { governorate_id: halabja.id, label: "بيت حلبجة", city: "حلبجة", area: "المركز", street: "شارع 1", contact_phone: CUSTOMER_E164 },
    });
    expect(created.ok(), await created.text()).toBe(true);
    addressId = (await created.json()).id;
    // The API refuses it too — the store just says so first.
    await clearCart(request, customer);
    await request.post(`${API}/cart/items`, { headers: customer, data: { product_id: product.id, variant_id: product.variant, quantity: 1 } });
    const refused = await request.post(`${API}/orders`, { headers: customer, data: { address_id: addressId, payment_method: "cod" } });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("DELIVERY_ZONE_NOT_SERVED");

    await signIn(page, "/checkout");
    await page.goto("/checkout");
    // The saved Halabja address: named, and Continue is not offered.
    const radio = page.locator(`[data-testid="saved-address-option"][value="${addressId}"]`);
    const option = page.getByTestId("saved-addresses").locator("li", { has: radio });
    await radio.check();
    await expect(option.getByTestId("saved-address-unserved")).toHaveText("لا نوصل إلى حلبجة بعد.");
    await expect(page.getByTestId("address-submit")).toBeDisabled();

    // A new address in Halabja: marked in the list and refused by name.
    await page.getByTestId("use-new-address").click();
    const select = page.getByTestId("address-governorate");
    const halabjaOption = select.locator(`option[value="${halabja.id}"]`);
    await expect(halabjaOption).toContainText("لا نوصل إليها بعد");
    await select.selectOption(halabja.id);
    await page.getByTestId("address-city").fill("حلبجة");
    await page.getByTestId("address-area").fill("المركز");
    await page.getByTestId("address-street").fill("شارع 2");
    await page.getByTestId("address-submit").click();
    await expect(page.getByText("لا نوصل إلى حلبجة بعد. اختر محافظة أخرى.")).toBeVisible();
    await expect(page.getByTestId("place-order")).toHaveCount(0);
  } finally {
    if (addressId) await request.delete(`${API}/addresses/${addressId}`, { headers: customer });
    if (homeId) {
      const home = (await (await request.get(`${API}/admin/delivery-zones`, { headers: staff })).json()).find(
        (zone: { id: string }) => zone.id === homeId,
      ) as { governorates: Array<{ id: string }> };
      await request.patch(`${API}/admin/delivery-zones/${homeId}`, {
        headers: staff,
        data: { governorate_ids: [...new Set([...home.governorates.map((row) => row.id), halabja.id])] },
      });
    }
    await clearCart(request, customer);
  }
});
