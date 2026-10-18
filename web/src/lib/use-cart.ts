"use client";

import { useSyncExternalStore } from "react";
import { cartItemCount, cartTotals, lineTotal, type CartTotals } from "./cart";
import type { Cart } from "./api";
import { cartStore, lineId, type AppliedCoupon, type CartLine, type CartState } from "./cart-store";
import { lineUnits } from "./quantity";
import { tierProgress, type TierProgress } from "./delivery";

/**
 * Subscribe to the raw store. Reading through useSyncExternalStore — rather
 * than an effect that copies localStorage into component state — is what keeps
 * hydration flash-free: the hydration pass renders the server snapshot, then
 * React adopts the already-loaded client snapshot in the same commit.
 */
export function useCartState(): CartState {
  return useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getSnapshot,
    cartStore.getServerSnapshot,
  );
}

/** One row as the cart page and the checkout review render it. */
export interface CartViewLine extends CartLine {
  /** False when the server says the line cannot be bought right now. */
  available: boolean;
  /** True when this device has never seen the product behind a server line. */
  unresolved: boolean;
  /**
   * What this row costs. Server-backed this is the server's own `line_total`,
   * passed through rather than multiplied out here — the row has to show the
   * number the customer is charged, not one the client agrees with.
   */
  line_total: number;
}

export interface CartView {
  lines: CartViewLine[];
  totals: CartTotals;
  hydrated: boolean;
  /** True while the server cart is the authority for lines and totals. */
  isServerBacked: boolean;
  /** A server mutation is in flight. */
  pending: boolean;
  /** The coupon code on the cart, whichever side owns it. */
  couponCode: string | null;
  /** A guest's validated coupon (its type and value price the guest cart). */
  guestCoupon: AppliedCoupon | null;
  /**
   * The automatic discount's progress bar, from the server cart. Null for a
   * guest (tiers come only with a signed-in cart) or when no tier applies.
   */
  tiers: TierProgress | null;
}

/**
 * The cart as the UI needs it, from whichever side is authoritative.
 *
 * Signed in, lines and every total come from the server response untouched —
 * the customer is charged the server's arithmetic, so showing anything the
 * client worked out would be showing a number that is not the price. The only
 * thing joined in locally is presentation: the server sends ids and money, not
 * names or artwork.
 *
 * Signed out, there is no server cart to read, so the guest totals are
 * computed here from the stored lines.
 */
export function useCart(): CartView {
  const state = useCartState();

  if (!state.server) {
    // Rows kept only as presentation detail sit at quantity 0 and are not in
    // anybody's basket.
    const basket = state.lines.filter((line) => line.quantity > 0);
    return {
      lines: basket.map((line) => ({
        ...line,
        available: true,
        unresolved: false,
        // No server to ask while signed out, so the guest cart does its own
        // arithmetic — the only place in the app that still does.
        line_total: lineTotal(line),
      })),
      totals: cartTotals(basket, state.coupon),
      hydrated: state.hydrated,
      isServerBacked: false,
      pending: state.pending,
      couponCode: state.coupon?.code ?? null,
      guestCoupon: state.coupon,
      tiers: null,
    };
  }

  const details = new Map(state.lines.map((line) => [line.id, line]));
  const server = state.server;

  const lines: CartViewLine[] = (server.items ?? []).map((item) => {
    const id = lineId(item.product_id ?? "", item.variant_id ?? null);
    // Details are cached per product+variant when this device added the line,
    // and per product when they were fetched for a line it had never seen.
    // Without the second lookup a variant line would stay `unresolved`, and
    // the effect that resolves it would re-run forever.
    const known =
      details.get(id) ?? details.get(lineId(item.product_id ?? "", null));

    return {
      id,
      product_id: item.product_id ?? "",
      variant_id: item.variant_id ?? null,
      name_ar: known?.name_ar ?? "",
      name_en: known?.name_en ?? "",
      image_url: known?.image_url ?? null,
      variant_label: known?.variant_label ?? null,
      // Money comes from the server, never from the cached line: the cached
      // price is what the product cost when it was added, and the server has
      // already repriced it at the current server time.
      unit_price: item.unit_price ?? 0,
      regular_price: known?.regular_price ?? null,
      available_qty: item.available_qty ?? 0,
      base_unit: known?.base_unit,
      whole_units_only: known?.whole_units_only,
      quantity: item.quantity ?? 0,
      available: item.available ?? true,
      unresolved: known === undefined,
      line_total: item.line_total ?? 0,
    };
  });

  return {
    lines,
    // Read without a delivery location, the server cart's fee is 0: pending.
    totals: serverTotals(server, lines, false),
    hydrated: state.hydrated,
    isServerBacked: true,
    pending: state.pending,
    couponCode: server.coupon_code ?? null,
    guestCoupon: null,
    tiers: lines.length > 0 ? tierProgress(server) : null,
  };
}

/**
 * The totals block from a priced cart — the server's, or a guest cart priced
 * the same way. `deliveryKnown` says whether a delivery location priced it;
 * until one did, the delivery line is pending and the total is before delivery.
 */
export function serverTotals(
  cart: Pick<Cart, "subtotal" | "delivery_fee" | "discount" | "coupon_discount" | "tier_discount" | "applied_tier" | "total">,
  lines: ReadonlyArray<Pick<CartLine, "quantity">>,
  deliveryKnown: boolean,
): CartTotals {
  return {
    itemCount: lines.reduce((sum, line) => sum + lineUnits(line.quantity), 0),
    subtotal: cart.subtotal ?? 0,
    deliveryFee: cart.delivery_fee ?? 0,
    deliveryPending: lines.length > 0 && !deliveryKnown,
    discount: cart.discount ?? 0,
    couponDiscount: cart.coupon_discount ?? 0,
    tierDiscount: cart.tier_discount ?? 0,
    tierPercent: cart.applied_tier?.percent ?? null,
    total: cart.total ?? 0,
  };
}

/** Total units in the cart — the header badge and the tab bar read this. */
export function useCartCount(): number {
  const state = useCartState();
  return state.server
    ? (state.server.items ?? []).reduce(
        (sum, item) => sum + lineUnits(item.quantity ?? 0),
        0,
      )
    : cartItemCount(state.lines.filter((line) => line.quantity > 0));
}
