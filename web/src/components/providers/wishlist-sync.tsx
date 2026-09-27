"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { wishlistStore } from "@/lib/wishlist-store";

/**
 * Switches the wishlist store between the device list and the account's.
 *
 * Renders nothing; it is mounted high enough that a heart tapped anywhere on
 * the storefront reaches the account. Signing in replays the guest picks once
 * and adopts GET /wishlist; signing out drops the account's list from the
 * device. The replay-once and StrictMode guarantees live in the store, not
 * here, so this effect is safe to run as often as React likes — there is
 * deliberately no cleanup that could cancel a replay half-way.
 */
export function WishlistSync() {
  const { isAuthenticated, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated) void wishlistStore.attachAccount();
    else wishlistStore.detachAccount();
  }, [isAuthenticated, ready]);

  return null;
}
