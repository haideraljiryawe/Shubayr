import type {
  Product,
  ProductAvailability,
  ProductImage,
  ProductVariant,
} from "./api";
import type { Locale } from "@/i18n/routing";

/* ---------------------------------------------------------------------------
 * Variant helpers.
 *
 * `ProductVariant.attributes` is `additionalProperties: true` in the contract,
 * so the storefront cannot assume a fixed set of keys. It reads two conventions
 * — `color` (with an optional `color_hex` for the swatch) and `size` — and
 * renders anything else as a plain labelled option, so a new attribute the
 * backend introduces still shows up instead of disappearing.
 * ------------------------------------------------------------------------- */

/** Keys that carry presentation detail rather than being options themselves. */
const META_KEYS = new Set(["color_hex", "color_en", "image_index"]);

export type AttributeValue = {
  /** Raw value as stored on the variant. */
  value: string;
  /** Swatch colour, when the attribute is a colour. */
  hex?: string;
  /** Variants offering this value. */
  variantIds: string[];
};

export type AttributeGroup = {
  /** Attribute key, e.g. "color" or "size". */
  key: string;
  values: AttributeValue[];
};

function attrString(
  variant: ProductVariant,
  key: string,
): string | undefined {
  const raw = (variant.attributes as Record<string, unknown> | undefined)?.[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Collect the selectable attributes across a product's variants, preserving the
 * order the backend sent them in.
 */
export function buildAttributeGroups(
  variants: ProductVariant[],
): AttributeGroup[] {
  const groups = new Map<string, Map<string, AttributeValue>>();

  for (const variant of variants) {
    const attributes = (variant.attributes ?? {}) as Record<string, unknown>;
    for (const [key, raw] of Object.entries(attributes)) {
      if (META_KEYS.has(key) || typeof raw !== "string") continue;
      if (!groups.has(key)) groups.set(key, new Map());
      const values = groups.get(key)!;
      const existing = values.get(raw);
      if (existing) {
        if (variant.id) existing.variantIds.push(variant.id);
      } else {
        values.set(raw, {
          value: raw,
          hex: key === "color" ? attrString(variant, "color_hex") : undefined,
          variantIds: variant.id ? [variant.id] : [],
        });
      }
    }
  }

  return [...groups.entries()].map(([key, values]) => ({
    key,
    values: [...values.values()],
  }));
}

/** The variant matching a selection, or undefined when none does. */
export function findVariant(
  variants: ProductVariant[],
  selection: Record<string, string>,
): ProductVariant | undefined {
  const keys = Object.keys(selection);
  if (keys.length === 0) return undefined;
  return variants.find((variant) =>
    keys.every((key) => attrString(variant, key) === selection[key]),
  );
}

/** The selection that identifies a given variant. */
export function selectionForVariant(
  variant: ProductVariant,
): Record<string, string> {
  const attributes = (variant.attributes ?? {}) as Record<string, unknown>;
  const selection: Record<string, string> = {};
  for (const [key, raw] of Object.entries(attributes)) {
    if (META_KEYS.has(key) || typeof raw !== "string") continue;
    selection[key] = raw;
  }
  return selection;
}

/* ---------------------------------------------------------------------------
 * Images.
 *
 * Contract v4 turned `Product.images` from a bare URL list into ProductImage
 * objects ({ id, url, sort_order, is_primary }) so the admin can reorder and
 * replace them. The storefront only ever wants URLs in display order, so these
 * two helpers are the single place that shape is unwrapped.
 * ------------------------------------------------------------------------- */

function bySortOrder(a: ProductImage, b: ProductImage): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

/** Every image URL, in the order the admin arranged them. */
export function productImageUrls(product: Product): string[] {
  return [...(product.images ?? [])]
    .sort(bySortOrder)
    .map((image) => image.url)
    .filter((url): url is string => Boolean(url));
}

/** The image a tile shows: the primary one, else the first, else nothing. */
export function primaryImageUrl(product: Product): string | null {
  const images = product.images ?? [];
  const primary = images.find((image) => image.is_primary);
  return primary?.url ?? productImageUrls(product)[0] ?? null;
}

/* ---------------------------------------------------------------------------
 * Pricing.
 *
 * Every SKU carries its own price (catalog v2): a fixed override, the
 * product's regular price, or a price linked to a foreign reference and
 * published from the Web Admin. The backend resolves that, applies the
 * product discount and sends each variant's `effective_price`, `on_sale` and
 * `discount_percent`. The storefront renders what it is given — there is
 * deliberately no discount or currency arithmetic here.
 * ------------------------------------------------------------------------- */

export type VariantPricing = {
  /** What the shopper pays for this variant. */
  price: number;
  /** Regular price to strike through, or null when the SKU is not on sale. */
  regularPrice: number | null;
  /** Backend-computed percentage off, or null when the SKU is not on sale. */
  discountPercent: number | null;
};

/**
 * The SKU's regular price before the product discount, by the backend's own
 * rule: a linked SKU uses its published local price, a fixed SKU its
 * override, and either falls back to the product price.
 */
export function variantRegularPrice(
  product: Product,
  variant: ProductVariant,
): number {
  const productPrice = product.price ?? 0;
  if (variant.pricing_mode === "linked") {
    return variant.published_price ?? productPrice;
  }
  return variant.selling_price ?? productPrice;
}

/**
 * Pricing for one SKU or, without one, the product's headline price — which
 * the API sets to the cheapest SKU's effective price.
 */
export function pricingForVariant(
  product: Product,
  variant?: ProductVariant,
): VariantPricing {
  if (variant && typeof variant.effective_price === "number") {
    return variant.on_sale
      ? {
          price: variant.effective_price,
          regularPrice: variantRegularPrice(product, variant),
          discountPercent: variant.discount_percent ?? null,
        }
      : {
          price: variant.effective_price,
          regularPrice: null,
          discountPercent: null,
        };
  }

  const price = product.effective_price ?? product.price ?? 0;
  if (!product.on_sale) {
    return { price, regularPrice: null, discountPercent: null };
  }
  return {
    price,
    regularPrice: product.price ?? null,
    discountPercent: product.discount_percent ?? null,
  };
}

/** True when a product's SKUs do not all cost the same, so tiles say "from". */
export function hasPriceRange(product: Product): boolean {
  const prices = new Set(
    (product.variants ?? [])
      .map((variant) => variant.effective_price)
      .filter((price): price is number => typeof price === "number"),
  );
  return prices.size > 1;
}

/**
 * The SKU a selection resolves to. A product with a single SKU needs no
 * choice at all, even when that SKU carries no attributes to select by.
 */
export function selectedVariantFor(
  variants: ProductVariant[],
  selection: Record<string, string>,
): ProductVariant | undefined {
  return (
    findVariant(variants, selection) ??
    (variants.length === 1 ? variants[0] : undefined)
  );
}

/* ---------------------------------------------------------------------------
 * Availability.
 *
 * The API labels every SKU out of stock / low stock / in stock against the
 * SKU's own low-stock threshold (in its base unit, not a percentage).
 * Customers see only that label — never the quantity behind it — so the label
 * is read as sent rather than re-derived from a number here.
 * ------------------------------------------------------------------------- */

export type StockLevel = "in_stock" | "low_stock" | "out_of_stock";

function levelOf(
  availability: string | undefined,
  inStock: boolean | undefined,
): StockLevel | undefined {
  if (
    availability === "in_stock" ||
    availability === "low_stock" ||
    availability === "out_of_stock"
  ) {
    return availability;
  }
  if (inStock === undefined) return undefined;
  return inStock ? "in_stock" : "out_of_stock";
}

/** The label for a SKU, else for the product as a whole. */
export function stockLevelFor(
  product: Product,
  availability: ProductAvailability | null,
  variantId?: string,
): StockLevel {
  if (variantId) {
    const entry = availability?.variants?.find(
      (item) => item.variant_id === variantId,
    );
    const variant = product.variants?.find((item) => item.id === variantId);
    return (
      levelOf(entry?.availability, entry?.in_stock) ??
      levelOf(variant?.availability, variant?.in_stock) ??
      "out_of_stock"
    );
  }
  return (
    levelOf(availability?.availability, availability?.in_stock) ??
    levelOf(product.availability, product.in_stock) ??
    "out_of_stock"
  );
}

/**
 * Sellable quantity for a variant, falling back to the product total. It only
 * caps what can be added — the page never prints it.
 */
export function availableQtyFor(
  availability: ProductAvailability | null,
  variantId?: string,
): number {
  if (!availability) return 0;
  if (!variantId) return availability.available_qty ?? 0;
  const entry = availability.variants?.find((v) => v.variant_id === variantId);
  return entry?.available_qty ?? 0;
}

/** Localised label for an attribute value (colours carry an English twin). */
export function attributeLabel(
  variants: ProductVariant[],
  key: string,
  value: string,
  locale: Locale,
): string {
  if (key !== "color" || locale === "ar") return value;
  const match = variants.find((v) => attrString(v, "color") === value);
  return match ? (attrString(match, "color_en") ?? value) : value;
}
