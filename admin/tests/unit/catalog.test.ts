import { describe, expect, it } from "vitest";
import {
  applicableRate,
  canConvertToBrand,
  canHaveChildren,
  ceilToMultiple,
  changeDirection,
  conversionTargets,
  departments,
  draftFromVariant,
  emptyDraft,
  formatPercentChange,
  legacyNodes,
  linkedLocalPrice,
  multiplyDecimal,
  parentChoices,
  parseAttributes,
  roundHalfUp,
  roundingRule,
  slugify,
  subcategories,
  variantErrorPath,
  variantInput,
  wholeUnitsFor,
  type Category,
} from "@/lib/catalog";

function node(id: string, parent_id: string | null, children: Category[] = [], sort_order = 0): Category {
  return { id, parent_id, name_en: id, name_ar: id, slug: id, sort_order, is_visible: true, children };
}

// Laptops → Gaming, Office; Phones (no children); Legacy: Laptops → Office → HP (a third level).
const HP = node("hp", "office");
const GAMING = node("gaming", "laptops", [], 1);
const OFFICE = node("office", "laptops", [HP], 2);
const LAPTOPS = node("laptops", null, [GAMING, OFFICE], 1);
const PHONES = node("phones", null, [], 2);
const TREE = [PHONES, LAPTOPS];

describe("two-level categories", () => {
  it("lists departments in display order", () => {
    expect(departments(TREE).map((c) => c.id)).toEqual(["laptops", "phones"]);
  });

  it("offers only departments as parents, so no third level can be built", () => {
    const { options, lock } = parentChoices(TREE, null);
    expect(lock).toBeNull();
    expect(options.map((c) => c.id)).toEqual(["laptops", "phones"]);
    expect(options.some((c) => c.parent_id)).toBe(false);
  });

  it("never offers a category as its own parent", () => {
    expect(parentChoices(TREE, PHONES).options.map((c) => c.id)).toEqual(["laptops"]);
  });

  it("locks the parent of a category that has subcategories", () => {
    expect(parentChoices(TREE, LAPTOPS)).toEqual({ options: [], lock: "hasChildren" });
  });

  it("lets a subcategory move to another department", () => {
    expect(parentChoices(TREE, GAMING).options.map((c) => c.id)).toEqual(["laptops", "phones"]);
  });

  it("adds subcategories under departments only", () => {
    expect(canHaveChildren(LAPTOPS)).toBe(true);
    expect(canHaveChildren(GAMING)).toBe(false);
  });

  it("flags nodes deeper than a subcategory for review", () => {
    expect(legacyNodes(TREE).map((c) => c.id)).toEqual(["hp"]);
  });

  it("groups subcategories by department for pickers", () => {
    expect(subcategories(TREE).map((g) => [g.department.id, g.children.map((c) => c.id)])).toEqual([
      ["laptops", ["gaming", "office"]],
    ]);
  });
});

describe("convert category to brand", () => {
  it("converts only a category without children", () => {
    expect(canConvertToBrand(HP)).toBe(true);
    expect(canConvertToBrand(GAMING)).toBe(true);
    expect(canConvertToBrand(OFFICE)).toBe(false);
    expect(canConvertToBrand(LAPTOPS)).toBe(false);
  });

  it("moves products to a subcategory other than the source", () => {
    const targets = conversionTargets(TREE, GAMING);
    expect(targets.flatMap((g) => g.children.map((c) => c.id))).toEqual(["office"]);
    expect(conversionTargets(TREE, HP).flatMap((g) => g.children.map((c) => c.id))).toEqual(["gaming", "office"]);
  });

  it("suggests a slug from the English name", () => {
    expect(slugify("  Hewlett Packard (HP) ")).toBe("hewlett-packard-hp");
    expect(slugify("Café Noir")).toBe("cafe-noir");
  });
});

describe("exact decimals", () => {
  it("multiplies without floating-point drift", () => {
    expect(multiplyDecimal("12", "1550")).toBe("18600");
    expect(multiplyDecimal(0.1, 0.2)).toBe("0.02");
    expect(multiplyDecimal("19.99", "1312.5")).toBe("26236.875");
  });

  it("rounds up to a multiple", () => {
    expect(ceilToMultiple("18600", "250")).toBe("18750");
    expect(ceilToMultiple("18750", "250")).toBe("18750");
    expect(ceilToMultiple("18750.01", "250")).toBe("19000");
    expect(ceilToMultiple("0.4", "0.25")).toBe("0.5");
  });

  it("rounds half up to a precision", () => {
    expect(roundHalfUp("26236.875", 0)).toBe("26237");
    expect(roundHalfUp("26236.4", 0)).toBe("26236");
    expect(roundHalfUp("1.005", 2)).toBe("1.01");
  });
});

describe("linked prices", () => {
  it("12 USD at 1,550 with round-up-250 publishes 18,750 IQD", () => {
    const rule = roundingRule("250", 0);
    expect(rule).toEqual({ kind: "multiple", multiple: "250" });
    expect(linkedLocalPrice(12, "1550", rule)).toEqual({ converted: "18600", local: "18750" });
  });

  it("12 USD at 1,500 is 18,000 — already a multiple, unchanged", () => {
    expect(linkedLocalPrice("12", 1500, roundingRule("250", 0)).local).toBe("18000");
  });

  it("with no rounding multiple, rounds to the base currency's precision", () => {
    expect(roundingRule("0", 0)).toEqual({ kind: "precision", precision: 0 });
    expect(roundingRule(null, 0)).toEqual({ kind: "precision", precision: 0 });
    expect(linkedLocalPrice("12.34", "1312.5", roundingRule("0", 0)).local).toBe("16196");
  });

  it("always converts from the reference, never from an earlier local price", () => {
    // Two rate changes: each price comes from 12 USD, not from the last result.
    const rule = roundingRule("250", 0);
    const first = linkedLocalPrice(12, 1550, rule).local;
    const second = linkedLocalPrice(12, 1500, rule).local;
    expect([first, second]).toEqual(["18750", "18000"]);
  });

  it("uses the newest rate already in effect", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    const rates = [
      { id: "future", rate: "1600", effective_at: "2026-10-02T00:00:00Z" },
      { id: "current", rate: "1550", effective_at: "2026-10-01T09:00:00Z" },
      { id: "old", rate: "1500", effective_at: "2026-09-01T00:00:00Z" },
    ];
    expect(applicableRate(rates, now)?.id).toBe("current");
    expect(applicableRate([], now)).toBeNull();
  });

  it("shows increases and decreases with their sign", () => {
    expect(formatPercentChange(3.3333)).toBe("+3.33%");
    expect(formatPercentChange(-2.5)).toBe("−2.5%");
    expect(formatPercentChange(0)).toBe("0%");
    expect(formatPercentChange(null)).toBe("—");
    expect(changeDirection(-2.5)).toBe("down");
    expect(changeDirection(4)).toBe("up");
    expect(changeDirection(null)).toBe("new");
  });
});

describe("variant editor", () => {
  it("keeps pieces whole whatever is requested", () => {
    expect(wholeUnitsFor("piece", false)).toBe(true);
    expect(wholeUnitsFor("", false)).toBe(true);
    expect(wholeUnitsFor("kg", false)).toBe(false);
    expect(wholeUnitsFor("kg", true)).toBe(true);
  });

  it("reads attributes one pair per line", () => {
    expect(parseAttributes("color: black\n\nsize: 42 ")).toEqual({ ok: true, value: { color: "black", size: "42" } });
    expect(parseAttributes("no separator").ok).toBe(false);
    expect(parseAttributes(": value").ok).toBe(false);
  });

  it("builds a fixed-price SKU with an override and a threshold in its unit", () => {
    const draft = {
      ...emptyDraft(),
      sku: " RICE-KG ",
      base_unit: "kg",
      whole_units_only: false,
      selling_price: "٣٥٠٠",
      low_stock_threshold: "2.5",
    };
    expect(variantInput(draft)).toEqual({
      ok: true,
      value: {
        sku: "RICE-KG",
        attributes: {},
        base_unit: "kg",
        whole_units_only: false,
        low_stock_threshold: 2.5,
        pricing_mode: "fixed",
        selling_price: 3500,
        reference_currency_code: null,
        reference_price: null,
      },
    });
  });

  it("forces whole units for a piece SKU and inherits empty fields", () => {
    const result = variantInput({ ...emptyDraft(), sku: "TV-55", whole_units_only: false });
    expect(result).toMatchObject({
      ok: true,
      value: { whole_units_only: true, selling_price: null, low_stock_threshold: null },
    });
  });

  it("builds a linked SKU from a reference currency and price", () => {
    const result = variantInput({
      ...emptyDraft(),
      sku: "PHONE-12",
      pricing_mode: "linked",
      reference_currency_code: "usd",
      reference_price: "12",
      selling_price: "99999",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { pricing_mode: "linked", reference_currency_code: "USD", reference_price: 12, selling_price: null },
    });
  });

  it("refuses wrong fields next to where they belong", () => {
    const result = variantInput({
      ...emptyDraft(),
      sku: "",
      attributes: "oops",
      selling_price: "12.5",
      low_stock_threshold: "1.2345",
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        sku: "skuRequired",
        attributes: "attributes",
        selling_price: "sellingPrice",
        low_stock_threshold: "threshold",
      },
    });
    const linked = variantInput({ ...emptyDraft(), sku: "X", pricing_mode: "linked", reference_price: "0" });
    expect(linked).toEqual({
      ok: false,
      errors: { reference_currency_code: "currencyRequired", reference_price: "referencePrice" },
    });
    // An ambiguous separator is refused, not guessed.
    expect(variantInput({ ...emptyDraft(), sku: "X", selling_price: "1,500" }).ok).toBe(false);
  });

  it("round-trips a stored variant", () => {
    const draft = draftFromVariant({
      id: "v1",
      sku: "SEED-001-PLUS",
      attributes: { option: "plus" },
      base_unit: "piece",
      whole_units_only: true,
      selling_price: 21000,
      low_stock_threshold: null,
      pricing_mode: "fixed",
    });
    expect(variantInput(draft)).toEqual({
      ok: true,
      value: {
        id: "v1",
        sku: "SEED-001-PLUS",
        attributes: { option: "plus" },
        base_unit: "piece",
        whole_units_only: true,
        low_stock_threshold: null,
        pricing_mode: "fixed",
        selling_price: 21000,
        reference_currency_code: null,
        reference_price: null,
      },
    });
  });

  it("maps a nested 422 path to its variant row", () => {
    expect(variantErrorPath("variants.2.sku")).toEqual({ index: 2, field: "sku" });
    expect(variantErrorPath("name_en")).toBeNull();
  });
});
