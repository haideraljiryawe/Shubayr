"use client";

import { useSyncExternalStore } from "react";
import { cartItemCount, cartTotals, type CartTotals } from "./cart";
import { DELIVERY_FEE } from "./config";
import { cartStore, lineId, type CartLine, type CartState } from "./cart-store";

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
      })),
      totals: cartTotals(basket, state.coupon, DELIVERY_FEE),
      hydrated: state.hydrated,
      isServerBacked: false,
      pending: state.pending,
      couponCode: state.coupon?.code ?? null,
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
      quantity: item.quantity ?? 0,
      available: item.available ?? true,
      unresolved: known === undefined,
    };
  });

  return {
    lines,
    totals: {
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: server.subtotal ?? 0,
      deliveryFee: server.delivery_fee ?? 0,
      discount: server.discount ?? 0,
      total: server.total ?? 0,
    },
    hydrated: state.hydrated,
    isServerBacked: true,
    pending: state.pending,
    couponCode: server.coupon_code ?? null,
  };
}

/** Total units in the cart — the header badge and the tab bar read this. */
export function useCartCount(): number {
  const state = useCartState();
  return state.server
    ? (state.server.items ?? []).reduce(
        (sum, item) => sum + (item.quantity ?? 0),
        0,
      )
    : cartItemCount(state.lines.filter((line) => line.quantity > 0));
}
