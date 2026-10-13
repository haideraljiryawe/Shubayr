import type { ModuleKey } from "./modules";

/* ---------------------------------------------------------------------------
 * The owner's first day, as the dashboard's checklist: departments and
 * subcategories, brands (optional), the first product, opening stock. Each
 * step knows whether it is done from what the API already reports; a step
 * whose facts the person may not read (no permission) or whose module is off
 * is left out rather than shown as undone.
 * ------------------------------------------------------------------------- */

export type FirstDayStepKey = "categories" | "brands" | "product" | "stock";

export interface FirstDayFacts {
  permissions: readonly string[];
  modules: readonly ModuleKey[];
  /** Null when unreadable. */
  subcategoryCount: number | null;
  brandCount: number | null;
  productCount: number | null;
  openingCount: number | null;
  /** Active, sellable locations; null when unreadable. */
  sellableLocations: number | null;
}

export interface FirstDayStep {
  key: FirstDayStepKey;
  href: string;
  done: boolean;
  optional: boolean;
  /** The stock step needs a sellable location first. */
  blockedBy?: "location";
}

export function firstDaySteps(facts: FirstDayFacts): FirstDayStep[] {
  const has = (key: string) => facts.permissions.includes(key);
  const catalog = facts.modules.includes("catalog");
  const stock = facts.modules.includes("stock");
  const steps: FirstDayStep[] = [];
  if (catalog && has("catalog.categories") && facts.subcategoryCount !== null) {
    steps.push({ key: "categories", href: "/catalog/categories", done: facts.subcategoryCount > 0, optional: false });
  }
  if (catalog && has("catalog.brands") && facts.brandCount !== null) {
    steps.push({ key: "brands", href: "/catalog/brands", done: facts.brandCount > 0, optional: true });
  }
  if (catalog && has("catalog.products") && facts.productCount !== null) {
    steps.push({
      key: "product",
      href: facts.productCount > 0 ? "/catalog/products" : "/catalog/products/new",
      done: facts.productCount > 0,
      optional: false,
    });
  }
  if (stock && has("inventory.view") && has("inventory.manage") && facts.openingCount !== null) {
    const noLocation = facts.sellableLocations === 0;
    steps.push({
      key: "stock",
      href: noLocation ? "/inventory/warehouses" : "/inventory/openings/new",
      done: facts.openingCount > 0,
      optional: false,
      ...(noLocation && facts.openingCount === 0 ? { blockedBy: "location" as const } : {}),
    });
  }
  return steps;
}

/** The checklist stays on the dashboard until every required step is done. */
export function firstDayComplete(steps: readonly FirstDayStep[]): boolean {
  return steps.every((step) => step.done || step.optional);
}
