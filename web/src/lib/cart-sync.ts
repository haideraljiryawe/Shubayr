"use client";

import { useEffect } from "react";
import { api, isLive } from "./api";
import { useAuth } from "./auth";
import { cartStore } from "./cart-store";
import { workRoleOf } from "./work-account";

/**
 * Connects the cart store to the server cart once a customer signs in.
 *
 * Renders nothing. While signed out the store stays local and the shopper
 * keeps a guest cart in their browser; on sign-in the guest lines are replayed
 * through POST /cart/items — the merge the contract prescribes — and from then
 * on the server's repriced cart is the authority for lines, availability and
 * every total.
 */
export function CartSync() {
  const { isAuthenticated, ready, user } = useAuth();
  // A work account has no server cart: the API answers 403
  // WORK_ACCOUNT_SHOPPING_FORBIDDEN, so there is nothing to attach to.
  const shopper = isAuthenticated && !workRoleOf(user);

  useEffect(() => {
    // With the cart domain mocked there is no server cart to attach to, and
    // reaching for one would put a network call into a run that is meant to
    // be hermetic.
    if (!ready || !isLive("cart")) return;

    if (!shopper) {
      // Signing out drops the server view but keeps whatever is on the device,
      // so the basket a shopper built does not vanish under them.
      cartStore.detachServerCart();
      return;
    }

    let cancelled = false;
    void cartStore.attachServerCart(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [shopper, ready]);

  return null;
}

/**
 * Resolve the display details of server lines this device has never seen —
 * a basket built on another device carries ids, not names.
 *
 * The cart response is deliberately lean (ids, prices, availability), so the
 * names and images come from the catalogue, which is live.
 */
const requestedDetails = new Set<string>();

export function useCartLineDetails(productIds: string[]) {
  const key = [...new Set(productIds)].sort().join(",");

  useEffect(() => {
    if (!isLive("catalog")) return;
    // Ask once per product. A lookup that comes back empty — the product was
    // pulled from the catalogue — must not be retried on every render.
    const missing = (key ? key.split(",") : [])
      .filter(Boolean)
      .filter((id) => !requestedDetails.has(id));
    if (missing.length === 0) return;
    for (const id of missing) requestedDetails.add(id);

    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        api.getProduct(id).then(
          (product) => [id, product] as const,
          // A product pulled from the catalogue after it was carted still has
          // a server line; the row renders without artwork rather than failing.
          () => null,
        ),
      ),
    ).then((entries) => {
      if (cancelled) return;
      for (const entry of entries) {
        if (entry) cartStore.rememberProduct(entry[1]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key]);
}
