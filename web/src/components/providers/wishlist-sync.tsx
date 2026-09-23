"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { setWishlistSync, wishlistStore } from "@/lib/wishlist-store";

/**
 * Connects the wishlist store to the contract once a customer signs in.
 *
 * Renders nothing: it is the seam described in wishlist-store.ts, mounted high
 * enough that a heart tapped anywhere on the storefront reaches the account.
 * While signed out the adapter is absent and the list stays on the device.
 */
export function WishlistSync() {
  const { isAuthenticated, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      // Sign-out leaves the device list alone: a shopper who signs out has not
      // asked to forget what they saved, and it syncs up again on sign-in.
      setWishlistSync(null);
      return;
    }

    setWishlistSync({
      add: async (productId) => {
        await api.addWishlistItem(productId);
      },
      remove: async (productId) => {
        await api.removeWishlistItem(productId);
      },
    });

    // Merge what the account already holds with anything hearted as a guest.
    // The revision is captured before the request so a response that the
    // shopper has already overtaken is dropped rather than applied.
    let cancelled = false;
    wishlistStore.hydrate();
    const since = wishlistStore.revision();
    api
      .listWishlist()
      .then((items) => {
        if (cancelled) return;
        wishlistStore.adoptRemote(
          items.map((item) => item.product_id ?? "").filter(Boolean),
          since,
        );
      })
      .catch(() => {
        /* Offline: the local list is still shown and syncs on the next change. */
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, ready]);

  return null;
}
