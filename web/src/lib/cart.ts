import type { Locale } from "@/i18n/routing";
import type { AppliedCoupon, CartLine } from "./cart-store";
import { lineUnits } from "./quantity";

/* ---------------------------------------------------------------------------
 * Cart money. Pure functions over the stored lines so the cart page, the
 * checkout review and the tests all compute the same numbers from one place.
 *
 * Every result is rounded to two decimals at the point it is produced. Money is
 * summed as floating point here (the amounts are small and the backend is the
 * authority on the charged total), so rounding each step keeps 0.1 + 0.2 out of
 * the rendered string.
 * ------------------------------------------------------------------------- */

/** Round to cents, avoiding the 1.005 → 1.00 case of naive Math.round. */
export function money(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * The row's product name in the reading locale, falling back to the other one
 * so a line saved before a translation existed still has something to show.
 */
export function lineName(line: CartLine, locale: Locale): string {
  const preferred = locale === "ar" ? line.name_ar : line.name_en;
  return preferred || line.name_ar || line.name_en || "";
}

export function lineTotal(line: CartLine): number {
  return money(line.unit_price * line.quantity);
}

export function cartSubtotal(lines: CartLine[]): number {
  return money(lines.reduce((sum, line) => sum + lineTotal(line), 0));
}

/** Items, not units: 1.5 kg of one product is one item on the badge. */
export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineUnits(line.quantity), 0);
}

/**
 * Discount a coupon takes off a subtotal. A percentage coupon scales; a fixed
 * one is capped at the subtotal so a large voucher on a small cart can never
 * produce a negative total.
 */
export function couponDiscount(
  subtotal: number,
  coupon: AppliedCoupon | null,
): number {
  if (!coupon || subtotal <= 0) return 0;
  const raw =
    coupon.type === "percentage"
      ? (subtotal * coupon.value) / 100
      : coupon.value;
  return money(Math.min(Math.max(raw, 0), subtotal));
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  /**
   * True while the delivery fee is not known yet: it is the fee of the zone
   * serving the order's governorate (API 15.0), and the cart has no address.
   * The total is then before delivery.
   */
  deliveryPending: boolean;
  /** Everything taken off the goods: the coupon and/or the automatic tier. */
  discount: number;
  /** The coupon's share of `discount`. */
  couponDiscount: number;
  /** The automatic tier's share of `discount` (server cart only). */
  tierDiscount: number;
  /** The tier applied, for its own line ("automatic discount 5%"). */
  tierPercent: number | null;
  total: number;
}

/**
 * A guest's totals block, in the mockup's order: المجموع الفرعي · رسوم التوصيل ·
 * الخصم · الإجمالي. The delivery fee depends on the governorate, chosen at
 * checkout, so the guest total is before delivery.
 */
export function cartTotals(
  lines: CartLine[],
  coupon: AppliedCoupon | null,
): CartTotals {
  const subtotal = cartSubtotal(lines);
  const discount = couponDiscount(subtotal, coupon);

  return {
    itemCount: cartItemCount(lines),
    subtotal,
    deliveryFee: 0,
    deliveryPending: lines.length > 0,
    discount,
    couponDiscount: discount,
    tierDiscount: 0,
    tierPercent: null,
    total: money(Math.max(0, subtotal - discount)),
  };
}
