"use client";

import { useSyncExternalStore } from "react";
import { cartItemCount } from "./cart";
import { cartStore, type CartState } from "./cart-store";

/**
 * Subscribe to the guest cart. Reading through useSyncExternalStore — rather
 * than an effect that copies localStorage into component state — is what keeps
 * hydration flash-free: the hydration pass renders the server snapshot, then
 * React adopts the already-loaded client snapshot in the same commit.
 */
export function useCart(): CartState {
  return useSyncExternalStore(
    cartStore.subscribe,
    cartStore.getSnapshot,
    cartStore.getServerSnapshot,
  );
}

/** Total units in the cart — the header badge and the tab bar read this. */
export function useCartCount(): number {
  const { lines } = useCart();
  return cartItemCount(lines);
}
