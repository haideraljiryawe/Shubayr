import {
  calculateLineTotal,
  calculatePercentageAmount,
  computeProductPricing,
  minorUnitsToMoney,
  moneyToMinorUnits,
  type ProductPricingInput,
} from '../catalog/pricing';

type Decimalish = number | string | { toString(): string };

export type CartCoupon = {
  code: string;
  type: string;
  value: Decimalish;
  usage_limit: number | null;
  used_count: number;
  expires_at: Date | null;
};

export const MAX_CART_ITEM_QUANTITY = 99;
export const CART_DELIVERY_FEE = 0;

export function cartUnitPrice(
  product: ProductPricingInput,
  variantDelta: Decimalish = 0,
  at: Date = new Date(),
): number {
  const effective = computeProductPricing(product, at).effective_price;
  const minor = moneyToMinorUnits(effective) + moneyToMinorUnits(variantDelta);
  return minorUnitsToMoney(minor > 0n ? minor : 0n);
}

export function activeCoupon(
  coupon: CartCoupon | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!coupon) return false;
  if (coupon.expires_at && coupon.expires_at.getTime() <= at.getTime())
    return false;
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit)
    return false;
  const value = Number(coupon.value.toString());
  return (
    Number.isFinite(value) &&
    value > 0 &&
    (coupon.type === 'fixed' || (coupon.type === 'percentage' && value <= 100))
  );
}

export function calculateCartTotals(
  lines: ReadonlyArray<{ unit_price: Decimalish; quantity: number }>,
  coupon: CartCoupon | null = null,
  at: Date = new Date(),
) {
  const subtotalMinor = lines.reduce(
    (sum, line) =>
      sum +
      moneyToMinorUnits(calculateLineTotal(line.unit_price, line.quantity)),
    0n,
  );
  const subtotal = minorUnitsToMoney(subtotalMinor);
  const discountMinor = activeCoupon(coupon, at)
    ? coupon!.type === 'percentage'
      ? moneyToMinorUnits(calculatePercentageAmount(subtotal, coupon!.value))
      : moneyToMinorUnits(coupon!.value)
    : 0n;
  const appliedDiscount =
    discountMinor > subtotalMinor ? subtotalMinor : discountMinor;
  const deliveryMinor = moneyToMinorUnits(CART_DELIVERY_FEE);
  return {
    subtotal,
    discount: minorUnitsToMoney(appliedDiscount),
    delivery_fee: CART_DELIVERY_FEE,
    total: minorUnitsToMoney(subtotalMinor - appliedDiscount + deliveryMinor),
  };
}
