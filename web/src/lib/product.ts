import type { Product, ProductAvailability, ProductVariant } from "./api";
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

/** Effective price for a variant: base sale price plus its delta. */
export function priceForVariant(
  product: Product,
  variant?: ProductVariant,
): number {
  return (product.sale_price ?? 0) + (variant?.price_delta ?? 0);
}

/**
 * Compare-at price shifted by the same delta, so a variant that costs more
 * still shows a truthful discount rather than an inflated one.
 */
export function compareAtForVariant(
  product: Product,
  variant?: ProductVariant,
): number | null {
  const base = product.compare_at_price;
  if (base === null || base === undefined) return null;
  const shifted = base + (variant?.price_delta ?? 0);
  return shifted > priceForVariant(product, variant) ? shifted : null;
}

export type StockLevel = "in_stock" | "low_stock" | "out_of_stock";

/** Below this, the page says «كمية محدودة» rather than plain «متوفر». */
export const LOW_STOCK_THRESHOLD = 5;

export function stockLevel(qty: number): StockLevel {
  if (qty <= 0) return "out_of_stock";
  if (qty <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

/** Sellable quantity for a variant, falling back to the product total. */
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
