/**
 * Prisma hands NUMERIC columns back as Decimal instances, seeds and JSON bodies
 * hand them back as numbers or strings; all three carry a usable `toString()`.
 */
type Decimalish = number | string | { toString(): string };

export const DISCOUNT_TYPES = ['percentage', 'amount'] as const;

export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** The stored half of the pricing model: a regular price plus a discount definition. */
export type ProductPricingInput = {
  price: Decimalish;
  discount_type?: string | null;
  discount_value?: Decimalish | null;
  discount_starts_at?: Date | string | null;
  discount_ends_at?: Date | string | null;
};

/** The derived half, recomputed on every read because the window moves with the clock. */
export type ComputedProductPricing = {
  on_sale: boolean;
  discounted_price: number | null;
  effective_price: number;
  discount_percent: number | null;
};

function toNumber(value: Decimalish | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Rounds to whole cents, away from zero, without float drift on x.xx5. */
function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isDiscountType(value: unknown): value is DiscountType {
  return DISCOUNT_TYPES.includes(value as DiscountType);
}

/**
 * True when a discount is defined and `at` falls inside its scheduled window.
 * A null bound is open: no start means active immediately, no end means forever.
 */
export function isDiscountActive(
  product: ProductPricingInput,
  at: Date = new Date(),
): boolean {
  if (!isDiscountType(product.discount_type)) return false;
  const value = toNumber(product.discount_value);
  if (value === null || value <= 0) return false;

  const startsAt = toDate(product.discount_starts_at);
  if (startsAt && at.getTime() < startsAt.getTime()) return false;
  const endsAt = toDate(product.discount_ends_at);
  if (endsAt && at.getTime() > endsAt.getTime()) return false;

  return true;
}

/**
 * Derives on_sale / discounted_price / effective_price / discount_percent from
 * the stored price and discount definition. Nothing here is persisted: the same
 * row yields different answers before, during, and after its scheduled window,
 * so the values are computed at read time against `at` (defaults to now).
 */
export function computeProductPricing(
  product: ProductPricingInput,
  at: Date = new Date(),
): ComputedProductPricing {
  const price = roundCurrency(toNumber(product.price) ?? 0);
  const onSale = isDiscountActive(product, at);

  if (!onSale) {
    return {
      on_sale: false,
      discounted_price: null,
      effective_price: price,
      discount_percent: null,
    };
  }

  const value = toNumber(product.discount_value) as number;
  const discountedPrice =
    product.discount_type === 'percentage'
      ? roundCurrency(price * (1 - value / 100))
      : roundCurrency(Math.max(price - value, 0));

  return {
    on_sale: true,
    discounted_price: discountedPrice,
    effective_price: discountedPrice,
    // A zero price cannot express a percentage off; report no percentage
    // rather than dividing by zero.
    discount_percent:
      price > 0 ? Math.round(((price - discountedPrice) / price) * 100) : null,
  };
}

/** Merges a product row with its computed pricing for an API response. */
export function withComputedPricing<T extends ProductPricingInput>(
  product: T,
  at: Date = new Date(),
): T & ComputedProductPricing {
  return { ...product, ...computeProductPricing(product, at) };
}

/**
 * Prisma `where` fragment for `GET /products?on_sale=true`. The active-window
 * test has to live in SQL rather than in a post-filter so that pagination
 * counts and pages stay correct.
 */
export function activeDiscountWhere(at: Date = new Date()) {
  return {
    discount_type: { in: [...DISCOUNT_TYPES] },
    AND: [
      {
        OR: [{ discount_starts_at: null }, { discount_starts_at: { lte: at } }],
      },
      { OR: [{ discount_ends_at: null }, { discount_ends_at: { gte: at } }] },
    ],
  };
}
