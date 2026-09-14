"use client";

import { useEffect, useSyncExternalStore } from "react";
import { wishlistStore, type WishlistState } from "./wishlist-store";

/**
 * Subscribe to the wishlist. Reading through useSyncExternalStore — rather
 * than an effect that copies localStorage into component state — is what keeps
 * hydration flash-free: the hydration pass renders the server snapshot, then
 * React adopts the already-loaded client snapshot in the same commit.
 */
export function useWishlist(): WishlistState {
  useEffect(() => {
    wishlistStore.hydrate();
  }, []);

  return useSyncExternalStore(
    wishlistStore.subscribe,
    wishlistStore.getSnapshot,
    wishlistStore.getServerSnapshot,
  );
}

/** Whether one product is saved. Used by every heart on the storefront. */
export function useIsWishlisted(productId: string | undefined): boolean {
  const { ids } = useWishlist();
  return productId ? ids.includes(productId) : false;
}

/** Total saved products — the account menu badge reads this. */
export function useWishlistCount(): number {
  return useWishlist().ids.length;
}
