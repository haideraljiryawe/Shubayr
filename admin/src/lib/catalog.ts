import type { components } from "@/types/api";
import { parseLocalizedDecimal } from "./number";

/* ---------------------------------------------------------------------------
 * Catalog v2 rules for the Web Admin, kept pure so they are unit-tested.
 *
 * - The catalog is exactly two levels: departments and their subcategories.
 *   The API refuses a third level (422 CATEGORY_MAX_DEPTH); the screens never
 *   offer one in the first place.
 * - Every SKU has its own base unit, whole-units rule, price and low-stock
 *   threshold, and is priced either at a fixed local price or linked to a
 *   foreign reference price converted at the pricing rate and rounded by the
 *   store's rule. The arithmetic here is exact decimal — a price shown is the
 *   price the server will publish.
 * ------------------------------------------------------------------------- */

export type Category = components["schemas"]["Category"];
export type Brand = components["schemas"]["Brand"];
export type Product = components["schemas"]["Product"];
export type ProductVariant = components["schemas"]["ProductVariant"];
export type ProductVariantInput = components["schemas"]["ProductVariantInput"];

/* ------------------------------------------------------------ categories */

function bySortOrder(a: Category, b: Category): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

/** Every node in the tree, depth-first, with its depth (0 = department). */
export function flattenTree(
  tree: readonly Category[],
  depth = 0,
): Array<{ category: Category; depth: number }> {
  return [...tree].sort(bySortOrder).flatMap((category) => [
    { category, depth },
    ...flattenTree(category.children ?? [], depth + 1),
  ]);
}

/** The departments, in display order. */
export function departments(tree: readonly Category[]): Category[] {
  return [...tree].filter((node) => !node.parent_id).sort(bySortOrder);
}

export type ParentLock = "hasChildren" | null;

/**
 * Which parents a category may take, by the two-level rule:
 *
 * - only a department can be a parent, so a subcategory can never gain a
 *   child and no third level can be built;
 * - a category never becomes its own parent;
 * - a category that has subcategories cannot move under anything — it would
 *   push its children to a third level — so its parent choice is locked.
 *
 * `editing` is null for a new category. The API enforces the same rules; a
 * screen that went stale (someone added a child meanwhile) gets the API's own
 * message back.
 */
export function parentChoices(
  tree: readonly Category[],
  editing: Category | null,
): { options: Category[]; lock: ParentLock } {
  if (editing && (editing.children ?? []).length > 0) {
    return { options: [], lock: "hasChildren" };
  }
  return {
    options: departments(tree).filter((node) => node.id !== editing?.id),
    lock: null,
  };
}

/** Whether "add subcategory" is offered under a node: departments only. */
export function canHaveChildren(category: Category): boolean {
  return !category.parent_id;
}

/**
 * Nodes deeper than a subcategory. Catalog v2 refuses to create them, but a
 * tree migrated from before may still hold some; they are shown for review —
 * convert to a brand, or move under a department — never as a normal level.
 */
export function legacyNodes(tree: readonly Category[]): Category[] {
  return flattenTree(tree)
    .filter(({ depth }) => depth >= 2)
    .map(({ category }) => category);
}

/** Subcategories: where products live and where converted products move. */
export function subcategories(
  tree: readonly Category[],
): Array<{ department: Category; children: Category[] }> {
  return departments(tree)
    .map((department) => ({
      department,
      children: [...(department.children ?? [])].sort(bySortOrder),
    }))
    .filter((group) => group.children.length > 0);
}

/**
 * Where a converted category's products may go: any subcategory other than
 * the source itself. Only a node without children can be converted.
 */
export function conversionTargets(
  tree: readonly Category[],
  source: Category,
): Array<{ department: Category; children: Category[] }> {
  return subcategories(tree)
    .map((group) => ({
      ...group,
      children: group.children.filter((child) => child.id !== source.id),
    }))
    .filter((group) => group.children.length > 0);
}

export function canConvertToBrand(category: Category): boolean {
  return (category.children ?? []).length === 0;
}

/** A URL slug from an English name: "Gaming Laptops" → "gaming-laptops". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ------------------------------------------------------------ units */

/** Units the editor offers; a stored unit outside this list is kept as is. */
export const BASE_UNITS = ["piece", "kg", "g", "l", "ml", "m", "cm"] as const;

export function isPiece(unit: string): boolean {
  const trimmed = unit.trim();
  return trimmed === "" || trimmed === "piece";
}

/**
 * Pieces are always whole; a SKU managed by weight, volume or length may
 * allow fractions (up to three decimals) or be kept whole by choice.
 */
export function wholeUnitsFor(unit: string, requested: boolean): boolean {
  return isPiece(unit) ? true : requested;
}

/* ------------------------------------------------------------ exact decimals */

type Decimalish = string | number;

function plain(value: Decimalish): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "0";
    return value.toLocaleString("en-US", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
  }
  return value.trim();
}

function scaled(value: Decimalish): { units: bigint; scale: number } {
  const text = plain(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { units: 0n, scale: 0 };
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const units = BigInt(whole + fraction);
  return { units: negative ? -units : units, scale: fraction.length };
}

function unscaled(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units)
    .toString()
    .padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale) || "0";
  const fraction = scale ? digits.slice(digits.length - scale).replace(/0+$/, "") : "";
  const text = fraction ? `${whole}.${fraction}` : whole;
  return negative && text !== "0" ? `-${text}` : text;
}

function rescale(value: { units: bigint; scale: number }, scale: number): bigint {
  return value.units * 10n ** BigInt(scale - value.scale);
}

/** a × b, exactly: "12" × "1550" → "18600". */
export function multiplyDecimal(a: Decimalish, b: Decimalish): string {
  const left = scaled(a);
  const right = scaled(b);
  return unscaled(left.units * right.units, left.scale + right.scale);
}

/** The smallest multiple of `multiple` that is ≥ `value` (both positive). */
export function ceilToMultiple(value: Decimalish, multiple: Decimalish): string {
  const v = scaled(value);
  const m = scaled(multiple);
  const scale = Math.max(v.scale, m.scale);
  const units = rescale(v, scale);
  const step = rescale(m, scale);
  if (step <= 0n) return unscaled(units, scale);
  let quotient = units / step;
  if (units % step !== 0n && units > 0n) quotient += 1n;
  return unscaled(quotient * step, scale);
}

/** Round half up to `precision` fraction digits. */
export function roundHalfUp(value: Decimalish, precision: number): string {
  const v = scaled(value);
  if (v.scale <= precision) return unscaled(v.units, v.scale);
  const factor = 10n ** BigInt(v.scale - precision);
  const negative = v.units < 0n;
  const magnitude = negative ? -v.units : v.units;
  let quotient = magnitude / factor;
  if ((magnitude % factor) * 2n >= factor) quotient += 1n;
  return unscaled(negative ? -quotient : quotient, precision);
}

/** Compare two decimals: -1, 0 or 1. */
export function compareDecimal(a: Decimalish, b: Decimalish): number {
  const left = scaled(a);
  const right = scaled(b);
  const scale = Math.max(left.scale, right.scale);
  const x = rescale(left, scale);
  const y = rescale(right, scale);
  return x === y ? 0 : x < y ? -1 : 1;
}

export type RoundingRule =
  | { kind: "multiple"; multiple: string }
  | { kind: "precision"; precision: number };

/**
 * The store's sale rounding rule (setting `sale_rounding_multiple`): zero
 * means "the base currency's precision", anything else rounds UP to that
 * multiple. It applies to selling prices only, never to cost.
 */
export function roundingRule(
  multiple: Decimalish | null | undefined,
  basePrecision: number,
): RoundingRule {
  const text = multiple === null || multiple === undefined ? "0" : plain(multiple);
  return compareDecimal(text || "0", "0") > 0
    ? { kind: "multiple", multiple: text }
    : { kind: "precision", precision: basePrecision };
}

export interface LinkedPrice {
  /** Reference × rate, before rounding. */
  converted: string;
  /** What the server publishes. */
  local: string;
}

/**
 * The local price of a linked SKU: the foreign reference price × the pricing
 * rate, then the rounding rule — always from the reference, never from an
 * earlier local price. Discounts apply after this, on the server. The
 * brief's example: 12 USD at 1,550 is 18,600, rounded up to 250 → 18,750.
 */
export function linkedLocalPrice(
  referencePrice: Decimalish,
  rate: Decimalish,
  rule: RoundingRule,
): LinkedPrice {
  const converted = multiplyDecimal(referencePrice, rate);
  const local =
    rule.kind === "multiple"
      ? ceilToMultiple(converted, rule.multiple)
      : roundHalfUp(converted, rule.precision);
  return { converted, local };
}

/**
 * The newest rate already in effect: the list is newest first, and a rate
 * recorded for the future does not price anything yet.
 */
export function applicableRate<T extends { effective_at?: string | null; rate?: Decimalish }>(
  rates: readonly T[],
  now: Date = new Date(),
): T | null {
  return (
    rates.find(
      (rate) =>
        rate.rate !== undefined &&
        (!rate.effective_at || new Date(rate.effective_at) <= now),
    ) ?? null
  );
}

/** "+3.33%", "−2.5%", "0%" — decreases are as visible as increases. */
export function formatPercentChange(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return "—";
  }
  const rounded = Math.round(percent * 100) / 100;
  const text = Math.abs(rounded).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  if (rounded > 0) return `+${text}%`;
  if (rounded < 0) return `−${text}%`;
  return "0%";
}

export function changeDirection(
  percent: number | null | undefined,
): "up" | "down" | "same" | "new" {
  if (percent === null || percent === undefined) return "new";
  if (percent > 0) return "up";
  if (percent < 0) return "down";
  return "same";
}

/** The API code for a preview that changed or expired underneath the user. */
export const STALE_PREVIEW = "STALE_PRICE_PREVIEW";

/* ------------------------------------------------------------ variant drafts */

export interface VariantDraft {
  /** Stable React key, also for new rows that have no id yet. */
  key: string;
  id?: string;
  sku: string;
  /** One `name: value` pair per line. */
  attributes: string;
  base_unit: string;
  whole_units_only: boolean;
  /** Fixed-price override in whole base currency; empty inherits. */
  selling_price: string;
  /** In the base unit, up to three decimals; empty inherits the store default. */
  low_stock_threshold: string;
  pricing_mode: "fixed" | "linked";
  reference_currency_code: string;
  reference_price: string;
}

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : plain(value);
}

export function attributesText(attributes: unknown): string {
  if (!attributes || typeof attributes !== "object") return "";
  return Object.entries(attributes as Record<string, unknown>)
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("\n");
}

export function parseAttributes(
  text: string,
): { ok: true; value: Record<string, string> } | { ok: false } {
  const value: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.indexOf(":");
    if (at <= 0) return { ok: false };
    const key = line.slice(0, at).trim();
    const entry = line.slice(at + 1).trim();
    if (!key || !entry) return { ok: false };
    value[key] = entry;
  }
  return { ok: true, value };
}

let draftCounter = 0;

export function draftFromVariant(variant: ProductVariant): VariantDraft {
  draftCounter += 1;
  return {
    key: variant.id ?? `draft-${draftCounter}`,
    id: variant.id,
    sku: variant.sku ?? "",
    attributes: attributesText(variant.attributes),
    base_unit: variant.base_unit || "piece",
    whole_units_only: variant.whole_units_only ?? true,
    selling_price:
      variant.pricing_mode === "linked" ? "" : numberText(variant.selling_price),
    low_stock_threshold: numberText(variant.low_stock_threshold),
    pricing_mode: variant.pricing_mode === "linked" ? "linked" : "fixed",
    reference_currency_code: variant.reference_currency_code ?? "",
    reference_price: numberText(variant.reference_price),
  };
}

/**
 * A blank SKU row. A row rendered on the server must pass a fixed `key`: the
 * counter differs between the server and the browser, and the key reaches
 * the markup (the pricing radios' group name), so it would not hydrate.
 */
export function emptyDraft(defaultCurrency = "", key?: string): VariantDraft {
  draftCounter += 1;
  return {
    key: key ?? `draft-${draftCounter}`,
    sku: "",
    attributes: "",
    base_unit: "piece",
    whole_units_only: true,
    selling_price: "",
    low_stock_threshold: "",
    pricing_mode: "fixed",
    reference_currency_code: defaultCurrency,
    reference_price: "",
  };
}

/** Message keys under `products.variantErrors`. */
export type VariantErrorKey =
  | "skuRequired"
  | "skuTooLong"
  | "attributes"
  | "unitRequired"
  | "sellingPrice"
  | "threshold"
  | "currencyRequired"
  | "referencePrice";

export type VariantErrors = Partial<Record<keyof VariantDraft, VariantErrorKey>>;

/**
 * A draft as the API's ProductVariantInput, or the fields that are wrong.
 * Numbers go through the admin's number parser: Arabic digits are fine, an
 * ambiguous separator ("1,500") is refused rather than guessed.
 */
export function variantInput(
  draft: VariantDraft,
): { ok: true; value: ProductVariantInput } | { ok: false; errors: VariantErrors } {
  const errors: VariantErrors = {};
  const sku = draft.sku.trim();
  if (!sku) errors.sku = "skuRequired";
  else if (sku.length > 80) errors.sku = "skuTooLong";

  const attributes = parseAttributes(draft.attributes);
  if (!attributes.ok) errors.attributes = "attributes";

  const unit = draft.base_unit.trim();
  if (!unit || unit.length > 32) errors.base_unit = "unitRequired";

  const threshold = parseLocalizedDecimal(draft.low_stock_threshold, {
    maxDecimals: 3,
  });
  if (!threshold.ok) errors.low_stock_threshold = "threshold";

  const value: ProductVariantInput = {
    ...(draft.id ? { id: draft.id } : {}),
    sku,
    attributes: attributes.ok ? attributes.value : {},
    base_unit: unit || "piece",
    whole_units_only: wholeUnitsFor(unit, draft.whole_units_only),
    low_stock_threshold:
      threshold.ok && threshold.value !== null ? Number(threshold.value) : null,
    pricing_mode: draft.pricing_mode,
  };

  if (draft.pricing_mode === "fixed") {
    const price = parseLocalizedDecimal(draft.selling_price, {
      integer: true,
    });
    if (!price.ok) errors.selling_price = "sellingPrice";
    value.selling_price =
      price.ok && price.value !== null ? Number(price.value) : null;
    value.reference_currency_code = null;
    value.reference_price = null;
  } else {
    const currency = draft.reference_currency_code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) errors.reference_currency_code = "currencyRequired";
    const reference = parseLocalizedDecimal(draft.reference_price, {
      required: true,
      maxDecimals: 6,
    });
    if (!reference.ok || reference.value === null || compareDecimal(reference.value, "0") <= 0) {
      errors.reference_price = "referencePrice";
    }
    value.selling_price = null;
    value.reference_currency_code = currency;
    value.reference_price =
      reference.ok && reference.value !== null ? Number(reference.value) : null;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/**
 * A 422's nested field path ("variants.2.sku") as the variant row and field
 * it belongs to, so the message lands next to the right control.
 */
export function variantErrorPath(
  field: string,
): { index: number; field: string } | null {
  const match = /^variants\.(\d+)\.([a-z_]+)/.exec(field);
  return match ? { index: Number(match[1]), field: match[2] } : null;
}
