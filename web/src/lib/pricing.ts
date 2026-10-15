import type { Cart, PublicDiscountTierSettings } from "./api";

/* ---------------------------------------------------------------------------
 * A guest's cart priced exactly as the API prices it (backend
 * orders/cart-pricing.ts → calculateCartTotals), from the public reads of
 * API 16.2: the governorate's delivery fee and the active discount tiers.
 *
 * A signed-in cart is priced by the server (GET /cart?governorate_id= or
 * ?address_id=) and never by this; checkout stays the authority either way.
 * The point of mirroring the arithmetic is that a guest sees, before signing
 * in, the very figures the server will charge:
 *
 * - money is held in minor units of the sales currency (the API: whole IQD)
 *   and every rounding is half away from zero;
 * - the coupon (percentage of the subtotal, or a fixed amount) is capped at
 *   the subtotal;
 * - the highest tier at or below the subtotal is the candidate; without
 *   coupon stacking it applies only when it takes off more than the coupon
 *   (then the coupon does not apply); with stacking both apply, together
 *   capped at the subtotal;
 * - total = subtotal − discount + delivery fee.
 * ------------------------------------------------------------------------- */

export interface PricedLine {
  unit_price: number;
  quantity: number;
}

export interface GuestCoupon {
  code: string;
  type: "percentage" | "fixed";
  value: number;
}

export type PricedCart = Pick<
  Cart,
  "subtotal" | "discount" | "coupon_discount" | "tier_discount" | "applied_tier" | "next_tier" | "delivery_fee" | "total"
>;

/** A decimal as an integer scaled by 10^scale, extra digits rounded half away from zero (as the API). */
function scaled(value: number, scale: number): number {
  const negative = value < 0;
  const [whole, fraction = ""] = Math.abs(value).toFixed(Math.max(scale + 4, 6)).split(".");
  let result = Number(`${whole}${fraction.slice(0, scale).padEnd(scale, "0")}`);
  if ((fraction[scale] ?? "0") >= "5") result += 1;
  return negative ? -result : result;
}

function divideRoundHalfAway(numerator: number, denominator: number): number {
  const negative = numerator < 0;
  const rounded = Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator);
  return negative ? -rounded : rounded;
}

export function priceGuestCart({
  lines,
  coupon = null,
  deliveryFee = 0,
  tiers = null,
  precision = 0,
}: {
  lines: readonly PricedLine[];
  coupon?: GuestCoupon | null;
  deliveryFee?: number;
  tiers?: Pick<PublicDiscountTierSettings, "tiers" | "coupon_stacking_enabled"> | null;
  /** Decimal places of the sales currency: 0 for IQD (the API's policy). */
  precision?: number;
}): PricedCart {
  const minor = (value: number) => scaled(value, precision);
  const money = (value: number) => value / 10 ** precision;
  const percentOf = (amountMinor: number, percent: number) => divideRoundHalfAway(amountMinor * scaled(percent, 2), 10_000);

  const subtotal = lines.reduce(
    (sum, line) => sum + divideRoundHalfAway(minor(line.unit_price) * scaled(line.quantity, 3), 1000),
    0,
  );
  const couponMinor = coupon ? (coupon.type === "percentage" ? percentOf(subtotal, coupon.value) : minor(coupon.value)) : 0;
  const cappedCoupon = Math.min(Math.max(couponMinor, 0), subtotal);

  const rows = (tiers?.tiers ?? []).map((tier) => ({ min: minor(Number(tier.min_subtotal)), percent: Number(tier.percent) }));
  const candidate = rows.filter((tier) => tier.min <= subtotal).sort((a, b) => b.min - a.min)[0] ?? null;
  const next = rows.filter((tier) => tier.min > subtotal).sort((a, b) => a.min - b.min)[0] ?? null;
  const candidateDiscount = candidate ? percentOf(subtotal, candidate.percent) : 0;
  const stacking = tiers?.coupon_stacking_enabled ?? false;
  const tierWins = candidateDiscount > cappedCoupon;
  const applied = candidate && (stacking || tierWins) ? candidate : null;
  const appliedCoupon = stacking || !tierWins ? cappedCoupon : 0;
  const appliedTier = applied ? candidateDiscount : 0;
  const discount = Math.min(appliedCoupon + appliedTier, subtotal);
  const couponShare = Math.min(appliedCoupon, discount);
  const delivery = minor(deliveryFee);

  return {
    subtotal: money(subtotal),
    discount: money(discount),
    coupon_discount: money(couponShare),
    tier_discount: money(discount - couponShare),
    // The guest has no tier id; the bar and the summary line read min/percent only.
    applied_tier: applied ? { id: "", min_subtotal: money(applied.min), percent: applied.percent } : null,
    next_tier: next ? { min_subtotal: money(next.min), percent: next.percent, amount_remaining: money(next.min - subtotal) } : null,
    delivery_fee: money(delivery),
    total: money(subtotal - discount + delivery),
  };
}

/** The sales currency's decimal places: the API prices in whole dinars. */
export function currencyPrecision(currency: string): number {
  return currency === "IQD" ? 0 : 2;
}
