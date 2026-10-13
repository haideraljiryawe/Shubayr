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

export type AutomaticDiscountTier = {
  id: string;
  min_subtotal_iqd: Decimalish;
  percent: Decimalish;
};

export type DiscountAllocationLine = {
  key: string;
  line_total: Decimalish;
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

export function skuUnitPrice(
  product: ProductPricingInput,
  variant:
    | {
        pricing_mode?: string;
        selling_price?: Decimalish | null;
        published_price?: Decimalish | null;
        price_delta?: Decimalish;
      }
    | null
    | undefined,
  at: Date = new Date(),
): number {
  const regular =
    variant?.pricing_mode === 'linked'
      ? (variant.published_price ?? product.price)
      : (variant?.selling_price ??
        minorUnitsToMoney(
          moneyToMinorUnits(product.price) +
            moneyToMinorUnits(variant?.price_delta ?? 0),
        ));
  return computeProductPricing({ ...product, price: regular }, at)
    .effective_price;
}

export function skuPriceVersion(
  product: { price_approved_at?: Date | string | null },
  variant: {
    id: string;
    price_version_id?: string | null;
    price_approved_at?: Date | string | null;
  },
  unitPrice: number,
): string {
  const marker =
    variant.price_version_id ??
    (variant.price_approved_at
      ? new Date(variant.price_approved_at).getTime()
      : product.price_approved_at
        ? new Date(product.price_approved_at).getTime()
        : 0);
  return `${(variant.id ?? 'legacy').slice(0, 8)}:${marker}:${unitPrice}`.slice(
    0,
    64,
  );
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
  deliveryFee: Decimalish = CART_DELIVERY_FEE,
  tiers: readonly AutomaticDiscountTier[] = [],
  stackCouponAndTier = false,
) {
  const subtotalMinor = lines.reduce(
    (sum, line) =>
      sum +
      moneyToMinorUnits(calculateLineTotal(line.unit_price, line.quantity)),
    0n,
  );
  const subtotal = minorUnitsToMoney(subtotalMinor);
  const couponDiscountMinor = activeCoupon(coupon, at)
    ? coupon!.type === 'percentage'
      ? moneyToMinorUnits(calculatePercentageAmount(subtotal, coupon!.value))
      : moneyToMinorUnits(coupon!.value)
    : 0n;
  const cappedCouponDiscount =
    couponDiscountMinor > subtotalMinor ? subtotalMinor : couponDiscountMinor;
  const qualifyingTiers = tiers
    .filter((tier) => moneyToMinorUnits(tier.min_subtotal_iqd) <= subtotalMinor)
    .sort((left, right) =>
      moneyToMinorUnits(right.min_subtotal_iqd) ===
      moneyToMinorUnits(left.min_subtotal_iqd)
        ? left.id.localeCompare(right.id)
        : moneyToMinorUnits(right.min_subtotal_iqd) >
            moneyToMinorUnits(left.min_subtotal_iqd)
          ? 1
          : -1,
    );
  const candidateTier = qualifyingTiers[0] ?? null;
  const candidateTierDiscount = candidateTier
    ? moneyToMinorUnits(
        calculatePercentageAmount(subtotal, candidateTier.percent),
      )
    : 0n;
  const nextTier = tiers
    .filter((tier) => moneyToMinorUnits(tier.min_subtotal_iqd) > subtotalMinor)
    .sort((left, right) =>
      moneyToMinorUnits(left.min_subtotal_iqd) ===
      moneyToMinorUnits(right.min_subtotal_iqd)
        ? left.id.localeCompare(right.id)
        : moneyToMinorUnits(left.min_subtotal_iqd) >
            moneyToMinorUnits(right.min_subtotal_iqd)
          ? 1
          : -1,
    )[0];
  const tierWins = candidateTierDiscount > cappedCouponDiscount;
  const appliedTier =
    candidateTier && (stackCouponAndTier || tierWins) ? candidateTier : null;
  const appliedCouponDiscount =
    stackCouponAndTier || !tierWins ? cappedCouponDiscount : 0n;
  const appliedTierDiscount = appliedTier ? candidateTierDiscount : 0n;
  const combinedDiscount = appliedCouponDiscount + appliedTierDiscount;
  const appliedDiscount =
    combinedDiscount > subtotalMinor ? subtotalMinor : combinedDiscount;
  const deliveryMinor = moneyToMinorUnits(deliveryFee);
  return {
    subtotal,
    discount: minorUnitsToMoney(appliedDiscount),
    coupon_discount: minorUnitsToMoney(
      appliedCouponDiscount > appliedDiscount
        ? appliedDiscount
        : appliedCouponDiscount,
    ),
    tier_discount: minorUnitsToMoney(
      appliedDiscount -
        (appliedCouponDiscount > appliedDiscount
          ? appliedDiscount
          : appliedCouponDiscount),
    ),
    discount_source:
      appliedCouponDiscount > 0n && appliedTierDiscount > 0n
        ? ('stacked' as const)
        : appliedTierDiscount > 0n
          ? ('tier' as const)
          : appliedCouponDiscount > 0n
            ? ('coupon' as const)
            : ('none' as const),
    applied_tier: appliedTier
      ? {
          id: appliedTier.id,
          min_subtotal: minorUnitsToMoney(
            moneyToMinorUnits(appliedTier.min_subtotal_iqd),
          ),
          percent: Number(appliedTier.percent.toString()),
        }
      : null,
    next_tier: nextTier
      ? {
          min_subtotal: minorUnitsToMoney(
            moneyToMinorUnits(nextTier.min_subtotal_iqd),
          ),
          percent: Number(nextTier.percent.toString()),
          amount_remaining: minorUnitsToMoney(
            moneyToMinorUnits(nextTier.min_subtotal_iqd) - subtotalMinor,
          ),
        }
      : null,
    delivery_fee: minorUnitsToMoney(deliveryMinor),
    total: minorUnitsToMoney(subtotalMinor - appliedDiscount + deliveryMinor),
  };
}

/** Allocates a whole-IQD order discount exactly across lines. */
export function allocateDiscountLargestRemainder(
  lines: readonly DiscountAllocationLine[],
  discount: Decimalish,
) {
  const prepared = lines.map((line) => ({
    ...line,
    minor: moneyToMinorUnits(line.line_total),
  }));
  const subtotal = prepared.reduce((sum, line) => sum + line.minor, 0n);
  const requested = moneyToMinorUnits(discount);
  const applied = requested > subtotal ? subtotal : requested;
  if (subtotal === 0n || applied === 0n) {
    return prepared.map((line) => ({
      key: line.key,
      discount_share: 0,
      net_line_total: minorUnitsToMoney(line.minor),
    }));
  }
  const allocations = prepared.map((line) => {
    const numerator = applied * line.minor;
    return {
      ...line,
      share: numerator / subtotal,
      remainder: numerator % subtotal,
    };
  });
  let unitsLeft =
    applied - allocations.reduce((sum, line) => sum + line.share, 0n);
  for (const line of [...allocations].sort((left, right) => {
    if (left.remainder === right.remainder)
      return left.key.localeCompare(right.key);
    return left.remainder > right.remainder ? -1 : 1;
  })) {
    if (unitsLeft === 0n) break;
    line.share += 1n;
    unitsLeft -= 1n;
  }
  return allocations.map((line) => ({
    key: line.key,
    discount_share: minorUnitsToMoney(line.share),
    net_line_total: minorUnitsToMoney(line.minor - line.share),
  }));
}
