"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/providers/theme-provider";
import { ApiError, api, type Cart, type CartDeliverySelector, type Governorate, type PublicDiscountTierSettings } from "./api";
import type { CartTotals } from "./cart";
import { tierProgress, type DeliveryProblem, type TierProgress } from "./delivery";
import type { DeliveryLocation } from "./delivery-location";
import { currencyPrecision, priceGuestCart } from "./pricing";
import { serverTotals, useCartState, type CartView } from "./use-cart";
import { useResource } from "./use-resource";

/* ---------------------------------------------------------------------------
 * The cart's money with the delivery fee in it, for a delivery location
 * (API 16.2). One hook for the cart page and checkout, so the two always show
 * the same total.
 *
 * - Signed in: the server prices it — GET /cart?address_id= (a saved
 *   address) or ?governorate_id= — and its figures are shown as they come.
 *   An unserved governorate (DELIVERY_ZONE_NOT_SERVED) or a saved address
 *   without one (ADDRESS_GOVERNORATE_REQUIRED) comes back as a problem.
 * - A guest: the governorate's public fee and the public tiers, priced with
 *   the server's own arithmetic (lib/pricing.ts). Checkout stays the
 *   authority: once signed in, the server's figures replace these.
 * - No location yet: the delivery line is pending ("by governorate") and the
 *   total is before delivery.
 * ------------------------------------------------------------------------- */

export interface DeliveryPricing {
  totals: CartTotals;
  tiers: TierProgress | null;
  problem: DeliveryProblem | null;
  /** The governorate pricing applies to, when known (for messages). */
  governorateId: string | null;
  /** The figures are the server's (signed in, with a location). */
  serverPriced: boolean;
  /** The server is pricing a location right now. */
  loading: boolean;
  governorates: ReadonlyMap<string, Governorate>;
  governoratesReady: boolean;
}

/** What makes a priced cart stale: its lines, its coupon, its location. */
function cartKey(cart: Cart | null, selector: CartDeliverySelector | null): string {
  if (!cart || !selector) return "";
  const items = (cart.items ?? []).map((item) => `${item.id}:${item.quantity}:${item.unit_price}`).join(",");
  return `${JSON.stringify(selector)}|${cart.coupon_code ?? ""}|${cart.subtotal}|${items}`;
}

export function useDeliveryPricing(view: CartView, location: DeliveryLocation): DeliveryPricing {
  const { currency } = useTheme();
  const serverCart = useCartState().server;
  const governorateList = useResource<Governorate[]>(() => api.listGovernorates(), []);
  const governorates = new Map((governorateList.data ?? []).map((item) => [item.id, item]));
  const governoratesReady = governorates.size > 0;
  const tierSettings = useResource<PublicDiscountTierSettings | null>(
    () => (view.isServerBacked ? Promise.resolve(null) : api.listDiscountTiers()),
    [view.isServerBacked],
  );

  const selector: CartDeliverySelector | null = view.isServerBacked
    ? location.addressId
      ? { address_id: location.addressId }
      : location.governorateId
        ? { governorate_id: location.governorateId }
        : null
    : null;
  const key = cartKey(serverCart, selector);
  const [priced, setPriced] = useState<{ key: string; cart: Cart | null; problem: DeliveryProblem | null } | null>(null);

  useEffect(() => {
    if (!key || !selector) return;
    let active = true;
    api.getCart(selector).then(
      (cart) => {
        if (active) setPriced({ key, cart, problem: null });
      },
      (cause: unknown) => {
        if (!active) return;
        const code = cause instanceof ApiError ? cause.code : undefined;
        const problem: DeliveryProblem | null =
          code === "DELIVERY_ZONE_NOT_SERVED" ? "unserved" : code === "ADDRESS_GOVERNORATE_REQUIRED" ? "missingGovernorate" : null;
        // Anything else (a deleted address, the network): no fee yet, not a refusal.
        setPriced({ key, cart: null, problem });
      },
    );
    return () => {
      active = false;
    };
    // `selector` is part of `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const base = {
    governorates,
    governoratesReady,
    governorateId: location.governorateId,
  };

  if (view.isServerBacked) {
    const current = priced && priced.key === key ? priced : null;
    if (selector && current?.cart) {
      return {
        ...base,
        totals: serverTotals(current.cart, view.lines, true),
        tiers: view.lines.length > 0 ? tierProgress(current.cart) : null,
        problem: null,
        serverPriced: true,
        loading: false,
      };
    }
    return {
      ...base,
      totals: view.totals,
      tiers: view.tiers,
      problem: current?.problem ?? null,
      serverPriced: true,
      loading: Boolean(selector) && !current,
    };
  }

  // A guest: the public fee and tiers, with the server's arithmetic.
  const governorate = location.governorateId ? governorates.get(location.governorateId) : undefined;
  const problem: DeliveryProblem | null =
    location.governorateId && governoratesReady && (!governorate || !governorate.is_served) ? "unserved" : null;
  const fee = governorate?.is_served && governorate.delivery_fee !== null ? Number(governorate.delivery_fee) : null;
  const guest = priceGuestCart({
    lines: view.lines.map((line) => ({ unit_price: line.unit_price, quantity: line.quantity })),
    coupon: view.guestCoupon,
    deliveryFee: fee ?? 0,
    tiers: tierSettings.data,
    precision: currencyPrecision(currency),
  });
  return {
    ...base,
    totals: serverTotals(guest, view.lines, fee !== null),
    tiers: view.lines.length > 0 ? tierProgress(guest) : null,
    problem,
    serverPriced: false,
    loading: false,
  };
}
