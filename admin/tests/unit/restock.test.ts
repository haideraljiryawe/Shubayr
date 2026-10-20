import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { firstDayComplete, firstDaySteps, type FirstDayFacts } from "@/lib/first-day";
import type { LocationInfo } from "@/lib/inventory";
import { LAUNCH_MODULES, parseModules } from "@/lib/modules";
import { activeSuppliers, canViewSettlement, toFixed, type Supplier } from "@/lib/purchasing";
import {
  isBlankQuantity,
  lastSupplierId,
  linesToPost,
  newestLot,
  paidNowAmount,
  restockCost,
  restockLocation,
  startingCost,
  type LastPurchase,
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

const purchase = (over: Partial<LastPurchase> = {}): LastPurchase => ({
  variant_id: "v-black",
  unit_cost: 9000,
  currency_code: "IQD",
  document_date: "2026-10-01T00:00:00.000Z",
  received_at: "2026-10-01T09:00:00.000Z",
  supplier: { id: "s-1", name: "Zain Trading" },
  invoice_id: "inv-1",
  ...over,
});

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

  it("last cost: the API's latest posted purchase cost, in its invoice currency", () => {
    // What the supplier charged (not the lot's landed cost).
    expect(restockCost(purchase({ unit_cost: 6, currency_code: "USD" }), lot({ source_type: "purchase_invoice", purchase_cost: 9_750 }))).toEqual({
      value: "6",
      currency: "USD",
    });
    expect(restockCost(purchase({ unit_cost: 0.125 }), null)).toEqual({ value: "0.125", currency: "IQD" });
  });

  it("never purchased: opening stock's IQD cost; otherwise unknown", () => {
    expect(restockCost(null, lot())).toEqual({ value: "9000", currency: "IQD" });
    expect(restockCost(null, lot({ purchase_cost: undefined }))).toBeNull();
    // A purchased lot without a readable last purchase gives no guess.
    expect(restockCost(null, lot({ source_type: "purchase_invoice" }))).toBeNull();
    expect(restockCost(null, null)).toBeNull();
  });

  it("supplier: the latest of the SKUs' last purchases, else the newest lot's", () => {
    const early = purchase({ received_at: "2026-09-01T00:00:00Z", supplier: { id: "s-old", name: "Old" } });
    const late = purchase({ received_at: "2026-10-01T00:00:00Z", supplier: { id: "s-new", name: "New" } });
    expect(lastSupplierId([early, null, late], lot({ supplier_id: "s-lot" }))).toBe("s-new");
    expect(lastSupplierId([null], lot({ supplier_id: "s-lot" }))).toBe("s-lot");
    expect(lastSupplierId([], null)).toBe("");
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

  it("suppliers: only active ones are offered, in the API's recent-purchase order", () => {
    const list = [supplier("s-c", "Basra Goods"), supplier("s-d", "Old", false), supplier("s-a", "Zain Trading")];
    expect(activeSuppliers(list).map((row) => row.id)).toEqual(["s-c", "s-a"]);
  });
});

describe("paid now", () => {
  it("pays the exact invoice total in its currency: lines plus same-currency landed costs", () => {
    expect(paidNowAmount([toFixed("90000"), toFixed("15000")], [{ currency: "IQD", amount: "2500" }], "IQD")).toBe("107500");
    expect(paidNowAmount([toFixed("12.5"), toFixed("0.125")], [], "USD")).toBe("12.625");
    // Six decimals at most, rounded like the API.
    expect(paidNowAmount([toFixed("0.0000004")], [], "USD")).toBeNull();
    expect(paidNowAmount([toFixed("1.0000005")], [], "USD")).toBe("1.000001");
  });

  it("is not offered when a landed cost is in another currency, or nothing is owed", () => {
    expect(paidNowAmount([toFixed("10")], [{ currency: "IQD", amount: "5000" }], "USD")).toBeNull();
    expect(paidNowAmount([], [], "IQD")).toBeNull();
  });

  it("invoice totals and balances show to buyers and payers, not only cost.view", () => {
    expect(canViewSettlement(["purchases.create"])).toBe(true);
    expect(canViewSettlement(["supplier_payments.record"])).toBe(true);
    expect(canViewSettlement(["cost.view"])).toBe(true);
    expect(canViewSettlement(["suppliers.view"])).toBe(false);
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
