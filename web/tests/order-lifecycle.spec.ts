import { expect, test, type Page } from "@playwright/test";
import { ApiError } from "../src/lib/api";
import {
  acceptedPriceVersions,
  cancelMode,
  priceChangeDelta,
  priceChanges,
  reductionProposal,
} from "../src/lib/order-lifecycle";

/**
 * Order lifecycle v2 for the shopper (API 10.0): the PRICE_CHANGED answer,
 * cancel-while-pending versus a cancellation request, and the store's
 * reduced-quantity proposal. The rules run here in Node; the request flow runs
 * against the mock fixtures, where SB-1039 (`sb-1039`) is out for delivery.
 */

const PHONE = "07701234567";
const OTP = "123456";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByTestId("auth-phone").fill(PHONE);
  await page.getByTestId("auth-send-otp").click();
  await page.getByTestId("auth-code").fill(OTP);
  await page.getByTestId("auth-verify").click();
  await expect(page.getByTestId("header-account")).toBeVisible();
}

test.describe("price changes (409 PRICE_CHANGED)", () => {
  const refusal = new ApiError(409, "Prices changed", "PRICE_CHANGED", [
    {
      field: "items.0.variant_id",
      code: "PRICE_CHANGED",
      message: "Price changed",
      variant_id: "v-up",
      product_id: "p-up",
      sku: "SKU-UP",
      old_price: 10000,
      new_price: 12500,
      old_price_version: "3",
      new_price_version: "4",
    },
    {
      field: "items.1.variant_id",
      code: "PRICE_CHANGED",
      message: "Price changed",
      variant_id: "v-down",
      sku: "SKU-DOWN",
      old_price: 8000,
      new_price: 7000,
      old_price_version: "1",
      new_price_version: "2",
    },
  ]);

  test("lists every SKU old → new with its direction", () => {
    expect(priceChanges(refusal)).toEqual([
      { variantId: "v-up", productId: "p-up", sku: "SKU-UP", oldPrice: 10000, newPrice: 12500, newPriceVersion: "4", direction: "up" },
      { variantId: "v-down", productId: null, sku: "SKU-DOWN", oldPrice: 8000, newPrice: 7000, newPriceVersion: "2", direction: "down" },
    ]);
  });

  test("accepting resubmits exactly the new price versions", () => {
    expect(acceptedPriceVersions(priceChanges(refusal)!)).toEqual([
      { variant_id: "v-up", price_version: "4" },
      { variant_id: "v-down", price_version: "2" },
    ]);
  });

  test("the total moves by the change times the quantity", () => {
    const changes = priceChanges(refusal)!;
    expect(priceChangeDelta(changes, new Map([["v-up", 2], ["v-down", 1]]))).toBe(2 * 2500 - 1000);
  });

  test("any other refusal is not a price change", () => {
    expect(priceChanges(new ApiError(409, "Out of stock", "INSUFFICIENT_STOCK"))).toBeNull();
    expect(priceChanges(new ApiError(422, "Bad", "PRICE_CHANGED"))).toBeNull();
    expect(priceChanges(new ApiError(409, "No rows", "PRICE_CHANGED"))).toBeNull();
    expect(priceChanges(null)).toBeNull();
  });
});

test.describe("cancelling", () => {
  test("pending cancels directly; later statuses ask the store", () => {
    expect(cancelMode({ status: "pending" })).toBe("cancel");
    for (const status of ["confirmed", "preparing", "ready_for_dispatch", "dispatched", "failed"] as const) {
      expect(cancelMode({ status })).toBe("request");
    }
    for (const status of ["delivered", "cancelled", "rejected", "returned"] as const) {
      expect(cancelMode({ status })).toBe("none");
    }
  });

  test("a pending request waits; a denied one may be asked again", () => {
    const at = "2026-10-01T10:00:00Z";
    expect(
      cancelMode({ status: "preparing", cancellation_request: { status: "pending", reason: "x", requested_at: at, resolved_at: null, resolution_note: null } }),
    ).toBe("waiting");
    expect(
      cancelMode({ status: "preparing", cancellation_request: { status: "denied", reason: "x", requested_at: at, resolved_at: at, resolution_note: "Already packed" } }),
    ).toBe("request");
  });
});

test("a reduction proposal reads from attention_details", () => {
  expect(reductionProposal({ attention_details: null })).toBeNull();
  expect(
    reductionProposal({
      attention_details: {
        short_lines: [],
        reduction_proposal: { order_item_id: "oi-1", old_quantity: 3, new_quantity: 1, reason: "Only one left", status: "pending", requested_by: "11111111-1111-4111-8111-111111111111", requested_at: "2026-10-01T10:00:00Z" },
      },
    }),
  ).toEqual({ orderItemId: "oi-1", oldQuantity: 3, newQuantity: 1, reason: "Only one left", status: "pending" });
});

test("an order past pending offers a cancellation request and shows its status", async ({ page }) => {
  await signIn(page);
  await page.goto("/account/orders/sb-1039");

  // Out for delivery: no direct cancel, only a request to the store.
  await expect(page.getByTestId("order-cancel")).toHaveCount(0);
  await page.getByTestId("order-request-cancel").click();
  const submit = page.getByTestId("order-request-cancel-submit");
  await expect(submit).toBeDisabled();
  await page.getByTestId("order-request-cancel-reason").fill("Ordered the wrong size");
  await submit.click();

  const status = page.getByTestId("order-cancel-request-status");
  await expect(status).toHaveAttribute("data-status", "pending");
  await expect(status).toContainText("Ordered the wrong size");
  // A request is already waiting: nothing to ask again.
  await expect(page.getByTestId("order-request-cancel")).toHaveCount(0);
});

test("the order says what was paid on delivery, and still does after a reload", async ({ page }) => {
  await signIn(page);
  // SB-1035 was paid 5 short (the fixture), SB-1028 in full, SB-1039 is on its way.
  await page.goto("/account/orders/sb-1035");
  const collection = page.getByTestId("order-collection");
  await expect(collection).toHaveAttribute("data-result", "short");
  await expect(page.getByTestId("order-collection-remaining")).toContainText("5");
  // The shopper's words only: nothing about couriers, custody or shortfalls.
  await expect(collection).not.toContainText(/مندوب|عهدة|عجز|courier|agent|custody|shortfall/i);
  await page.reload();
  await expect(page.getByTestId("order-collection")).toHaveAttribute("data-result", "short");

  await page.goto("/account/orders/sb-1028");
  await expect(page.getByTestId("order-collection")).toHaveAttribute("data-result", "full");
  await expect(page.getByTestId("order-collection-remaining")).toHaveCount(0);

  await page.goto("/account/orders/sb-1039");
  await expect(page.getByTestId("order-collection")).toHaveCount(0);
});
