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

function decimalText(value: Decimalish): string {
  return typeof value === 'number' ? value.toString() : value.toString();
}

/**
 * Converts a decimal to a scaled integer without binary floating-point math.
 * Values beyond the requested scale are rounded half away from zero.
 */
function decimalToScaled(value: Decimalish, scale: number): bigint {
  const match = decimalText(value)
    .trim()
    .match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match)
    throw new TypeError(`Invalid decimal value: ${decimalText(value)}`);

  const negative = match[1] === '-';
  const fraction = match[3] ?? '';
  const kept = fraction.slice(0, scale).padEnd(scale, '0');
  let scaled = BigInt(`${match[2]}${kept}`);
  const discarded = fraction.slice(scale);
  if (discarded.length > 0 && discarded[0] >= '5') scaled += 1n;
  return negative ? -scaled : scaled;
}

function divideRoundHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('denominator must be positive');
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}

export function moneyToMinorUnits(value: Decimalish): bigint {
  return decimalToScaled(value, 2);
}

export function minorUnitsToMoney(value: bigint): number {
  return Number(value) / 100;
}

/** Cart/order line totals use the same integer-minor-unit policy. */
export function calculateLineTotal(
  unitPrice: Decimalish,
  quantity: number,
): number {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('quantity must be a non-negative safe integer');
  }
  return minorUnitsToMoney(moneyToMinorUnits(unitPrice) * BigInt(quantity));
}

/** Percentage of a money amount, rounded once at the minor-unit boundary. */
export function calculatePercentageAmount(
  amount: Decimalish,
  percentage: Decimalish,
): number {
  const scaledPercentage = decimalToScaled(percentage, 2);
  if (scaledPercentage < 0n || scaledPercentage > 10_000n) {
    throw new RangeError('percentage must be between zero and 100');
  }
  return minorUnitsToMoney(
    divideRoundHalfAway(moneyToMinorUnits(amount) * scaledPercentage, 10_000n),
  );
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  const priceMinor = moneyToMinorUnits(product.price);
  const price = minorUnitsToMoney(priceMinor);
  const onSale = isDiscountActive(product, at);

  if (!onSale) {
    return {
      on_sale: false,
      discounted_price: null,
      effective_price: price,
      discount_percent: null,
    };
  }

  const value = product.discount_value as Decimalish;
  const discountedMinor =
    product.discount_type === 'percentage'
      ? divideRoundHalfAway(
          priceMinor * (10_000n - decimalToScaled(value, 2)),
          10_000n,
        )
      : priceMinor > moneyToMinorUnits(value)
        ? priceMinor - moneyToMinorUnits(value)
        : 0n;
  const discountedPrice = minorUnitsToMoney(discountedMinor);

  return {
    on_sale: true,
    discounted_price: discountedPrice,
    effective_price: discountedPrice,
    // A zero price cannot express a percentage off; report no percentage
    // rather than dividing by zero.
    discount_percent:
      priceMinor > 0n
        ? Number(
            divideRoundHalfAway(
              (priceMinor - discountedMinor) * 100n,
              priceMinor,
            ),
          )
        : null,
  };
}

/**
 * Applies only fields actually present in a PATCH document. Omitted discount
 * fields are preserved; discount_type=null explicitly clears the definition.
 */
export function mergeProductPricingPatch<T extends ProductPricingInput>(
  stored: T,
  patch: Partial<ProductPricingInput>,
): T {
  if (
    Object.prototype.hasOwnProperty.call(patch, 'discount_type') &&
    patch.discount_type === null
  ) {
    return {
      ...stored,
      ...patch,
      discount_type: null,
      discount_value: null,
      discount_starts_at: null,
      discount_ends_at: null,
    };
  }

  const merged = { ...stored };
  for (const field of [
    'price',
    'discount_type',
    'discount_value',
    'discount_starts_at',
    'discount_ends_at',
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      Object.assign(merged, { [field]: patch[field] });
    }
  }
  return merged;
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
