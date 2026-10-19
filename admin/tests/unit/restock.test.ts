import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { firstDayComplete, firstDaySteps, type FirstDayFacts } from "@/lib/first-day";
import type { LocationInfo } from "@/lib/inventory";
import { LAUNCH_MODULES, parseModules } from "@/lib/modules";
import type { Supplier } from "@/lib/purchasing";
import {
  isBlankQuantity,
  lastCostOf,
  linesToPost,
  newestLot,
  orderSuppliers,
  recentSupplierIds,
  restockLocation,
  startingCost,
  type LotFacts,
} from "@/lib/restock";

const lot = (over: Partial<LotFacts> = {}): LotFacts => ({
  id: "lot-1",
  variant_id: "v-black",
  entry_date: "2026-10-10T08:00:00.000Z",
  source_type: "opening",
  source_id: "op-1",
  po_item_id: null,
  supplier_id: null,
  purchase_cost: 9000,
  batch_stock: [{ location_id: "loc-shelf" }],
  ...over,
});

const location = (over: Partial<LocationInfo>): LocationInfo =>
  ({ id: "loc", code: "A", warehouseId: "w", warehouseCode: "W", active: true, sellable: true, ...over }) as LocationInfo;

const supplier = (id: string, name: string, active = true): Supplier =>
  ({ id, name, default_currency: "IQD", payment_terms_days: 30, is_active: active, created_at: "", updated_at: "" }) as Supplier;

describe("lines left empty are dropped, never forced", () => {
  it("empty, blank and zero quantities are blank; anything else is posted", () => {
    for (const blank of ["", "  ", "0", "0.000", null, undefined]) expect(isBlankQuantity(blank), String(blank)).toBe(true);
    for (const filled of ["1", "0.5", "12", " 3 "]) expect(isBlankQuantity(filled), filled).toBe(false);
  });

  it("restocking only the second colour posts one line", () => {
    const lines = [
      { sku: "TSHIRT-BLACK", packs: "" },
      { sku: "TSHIRT-RED", packs: "6" },
      { sku: "TSHIRT-BLUE", packs: "0" },
    ];
    const { posted, skipped } = linesToPost(lines, (line) => line.packs);
    expect(posted.map((line) => line.sku)).toEqual(["TSHIRT-RED"]);
    expect(skipped).toBe(2);
  });

  it("opening stock with one empty line keeps the others in their order", () => {
    const lines = [
      { key: 1, quantity: "5" },
      { key: 2, quantity: null },
      { key: 3, quantity: "2.5" },
    ];
    expect(linesToPost(lines, (line) => line.quantity)).toEqual({ posted: [lines[0], lines[2]], skipped: 1 });
  });
});

describe("restock defaults", () => {
  it("the newest lot is the latest entry (ties by id)", () => {
    const older = lot({ id: "a", entry_date: "2026-10-01T00:00:00Z" });
    const newer = lot({ id: "b", entry_date: "2026-10-05T00:00:00Z" });
    const twin = lot({ id: "c", entry_date: "2026-10-05T00:00:00Z" });
    expect(newestLot([older, newer])).toBe(newer);
    expect(newestLot([newer, twin, older])).toBe(twin);
    expect(newestLot([])).toBeNull();
  });

  it("last cost: the supplier's unit cost on the invoice the newest lot came from", () => {
    const purchased = lot({ source_type: "purchase_invoice", source_id: "inv-1", po_item_id: "item-2", supplier_id: "s-1", purchase_cost: 9_750 });
    const items = [
      { id: "item-1", variant_id: "v-red", base_unit_cost_currency: 6, currency_code: "USD" as const },
      { id: "item-2", variant_id: "v-black", base_unit_cost_currency: 9_000, currency_code: "IQD" as const },
    ];
    // Not the lot's landed cost (9,750): what the supplier charged.
    expect(lastCostOf(purchased, items)).toEqual({ value: "9000", currency: "IQD" });
    expect(lastCostOf({ ...purchased, po_item_id: "item-1", variant_id: "v-red" }, items)).toEqual({ value: "6", currency: "USD" });
  });

  it("last cost of opening stock is that lot's IQD cost; unknown when costs are hidden", () => {
    expect(lastCostOf(lot(), [])).toEqual({ value: "9000", currency: "IQD" });
    expect(lastCostOf(lot({ purchase_cost: undefined }), [])).toBeNull();
    expect(lastCostOf(lot({ source_type: "purchase_invoice", po_item_id: "gone" }), [])).toBeNull();
    expect(lastCostOf(null, [])).toBeNull();
  });

  it("a line starts at the last cost only in the same currency", () => {
    expect(startingCost({ value: "6", currency: "USD" }, "USD")).toBe("6");
    expect(startingCost({ value: "6", currency: "USD" }, "IQD")).toBe("");
    expect(startingCost(null, "IQD")).toBe("");
  });

  it("location: where the newest stock went if still active, else the only (sellable) one", () => {
    const shelf = location({ id: "loc-shelf" });
    const back = location({ id: "loc-back", sellable: false });
    expect(restockLocation(lot(), [back, shelf])).toBe("loc-shelf");
    expect(restockLocation(lot(), [back, location({ id: "loc-shelf", active: false }), location({ id: "loc-new" })])).toBe("loc-new");
    expect(restockLocation(null, [back, shelf])).toBe("loc-shelf");
    expect(restockLocation(null, [back])).toBe("loc-back");
    expect(restockLocation(null, [])).toBe("");
  });

  it("suppliers: recently bought from first (newest first, once, active only), the rest by name", () => {
    const list = [supplier("s-a", "Zain Trading"), supplier("s-b", "Al Noor"), supplier("s-c", "Basra Goods"), supplier("s-d", "Old", false)];
    const recent = recentSupplierIds([{ supplier_id: "s-c" }, { supplier_id: "s-a" }, { supplier_id: "s-c" }, { supplier_id: "s-d" }, { supplier_id: null }]);
    expect(recent).toEqual(["s-c", "s-a", "s-d"]);
    const ordered = orderSuppliers(list, recent);
    expect(ordered.recent.map((row) => row.id)).toEqual(["s-c", "s-a"]);
    expect(ordered.others.map((row) => row.name)).toEqual(["Al Noor"]);
  });
});

describe("first-day checklist: supplier and delivery party", () => {
  const owner: FirstDayFacts = {
    permissions: ["catalog.categories", "catalog.products", "inventory.view", "inventory.manage", "suppliers.view", "suppliers.manage", "drivers.manage"],
    modules: parseModules(LAUNCH_MODULES),
    subcategoryCount: 1,
    brandCount: null,
    productCount: 1,
    openingCount: 1,
    sellableLocations: 1,
    supplierCount: 0,
    partyCount: 0,
  };

  it("asks for the first supplier and the delivery party at launch, and stays until both exist", () => {
    const steps = firstDaySteps(owner);
    expect(steps.map((step) => step.key)).toEqual(["categories", "product", "stock", "supplier", "delivery"]);
    expect(steps.find((step) => step.key === "delivery")?.href).toBe("/delivery-parties#driver-form");
    expect(firstDayComplete(steps)).toBe(false);
    expect(firstDayComplete(firstDaySteps({ ...owner, supplierCount: 2, partyCount: 1 }))).toBe(true);
  });

  it("leaves them out when the module is off or the person can't add them", () => {
    const core = firstDaySteps({ ...owner, modules: parseModules("catalog,stock,orders,settings,users") }).map((step) => step.key);
    expect(core).not.toContain("supplier");
    expect(core).not.toContain("delivery");
    const clerk = firstDaySteps({ ...owner, permissions: owner.permissions.filter((key) => key !== "drivers.manage" && key !== "suppliers.manage") });
    expect(clerk.map((step) => step.key)).toEqual(["categories", "product", "stock"]);
    expect(firstDaySteps({ ...owner, supplierCount: null, partyCount: null }).map((step) => step.key)).toEqual(["categories", "product", "stock"]);
  });
});

describe("messages", () => {
  it("name opening stock as first-time only and Restock in both languages", () => {
    expect(ar.products.openingStock).toBe("رصيد افتتاحي (لأول مرة فقط)");
    expect(en.products.openingStock).toBe("Opening stock (first time only)");
    expect(ar.products.restock).toBe("إعادة تعبئة المخزون");
    expect(en.products.restock).toBe("Restock");
  });

  it("every new key exists in both languages", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    const pick = (messages: typeof en) => ({
      restock: messages.purchasing.invoice.restock,
      payNow: messages.purchasing.invoice.payNow,
      opening: messages.inventory.opening,
      assign: messages.orders.assign,
      steps: messages.dashboard.firstDay.steps,
    });
    expect(keys(pick(ar as typeof en)).sort()).toEqual(keys(pick(en)).sort());
  });
});
