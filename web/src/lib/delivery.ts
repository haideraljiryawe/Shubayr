import type { Address, Cart, Governorate } from "./api";

/* ---------------------------------------------------------------------------
 * Delivery by governorate and the automatic order discount (API 15.0), kept
 * pure for the cart and checkout.
 *
 * - The delivery fee is the fee of the zone serving the address's
 *   governorate, charged on the order. The cart has no address, so its
 *   delivery line says "by governorate" and its total is before delivery.
 * - A governorate with no active zone is not served: checkout says so
 *   instead of letting the order fail at the end. An address saved before
 *   governorates existed has none and is asked for one first.
 * - The tier discount comes from the server cart (signed in): what the
 *   highest tier reached takes off, and how far the next one is.
 * ------------------------------------------------------------------------- */

export function governorateName(governorate: Pick<Governorate, "name_ar" | "name_en">, locale: string): string {
  return (locale === "ar" ? governorate.name_ar : governorate.name_en) || governorate.name_ar || governorate.name_en;
}

export type DeliveryProblem = "missingGovernorate" | "unserved";

/** Why an address cannot be delivered to, or null when it can. */
export function deliveryProblem(
  address: Pick<Address, "governorate_id">,
  governorates: ReadonlyMap<string, Governorate>,
): DeliveryProblem | null {
  if (!address.governorate_id) return "missingGovernorate";
  const governorate = governorates.get(address.governorate_id);
  // A governorate the store no longer lists (deactivated) is not served either.
  if (!governorate || !governorate.is_served) return "unserved";
  return null;
}

/** The API's checkout refusals that belong to the address step. */
export const ADDRESS_REFUSALS = ["ADDRESS_GOVERNORATE_REQUIRED", "DELIVERY_ZONE_NOT_SERVED"] as const;
export type AddressRefusal = (typeof ADDRESS_REFUSALS)[number];

export function isAddressRefusal(code: string | undefined): code is AddressRefusal {
  return (ADDRESS_REFUSALS as readonly string[]).includes(code ?? "");
}

export type TierProgress =
  | { kind: "next"; remaining: number; percent: number; reached: number; current: number | null }
  | { kind: "top"; percent: number };

/**
 * The progress bar: how much more the next tier needs (and how far along the
 * subtotal is, 0–1), or that the top tier is reached. Null when no tier is
 * configured above or at this subtotal.
 */
export function tierProgress(
  cart: Pick<Cart, "subtotal" | "applied_tier" | "next_tier"> | null,
): TierProgress | null {
  if (!cart) return null;
  const next = cart.next_tier;
  if (next) {
    const target = Number(next.min_subtotal) || 0;
    const subtotal = Number(cart.subtotal) || 0;
    return {
      kind: "next",
      remaining: Math.max(0, Number(next.amount_remaining) || 0),
      percent: next.percent,
      reached: target > 0 ? Math.min(1, Math.max(0, subtotal / target)) : 1,
      current: cart.applied_tier?.percent ?? null,
    };
  }
  return cart.applied_tier ? { kind: "top", percent: cart.applied_tier.percent } : null;
}

/** A percent as shoppers read it: "5", "7.5". */
export function percentText(percent: number, locale: string): string {
  return percent.toLocaleString(locale === "ar" ? "ar-IQ" : "en-US", { maximumFractionDigits: 2 });
}
