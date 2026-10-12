import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { sourceDocumentHref } from "@/lib/finance/links";
import { resolveOutcome } from "@/lib/finance/operations";
import { visibleNav } from "@/lib/nav";
import { parseTableParams } from "@/lib/table-params";
import {
  availabilityTone,
  balanceQuery,
  carryCounts,
  countDifference,
  countScope,
  documentHref,
  formatCost,
  formatQuantity,
  isExpired,
  isStaleCount,
  isWholeUnitsError,
  locationIndex,
  locationLabel,
  MOVEMENT_FILTER_KEYS,
  movementQuery,
  quantityRule,
  reservationShortfall,
  sourceLink,
  STOCK_FILTER_KEYS,
  stockHref,
  stockTotals,
  summarizeCount,
  toMilli,
  transferable,
  writeDownNeedsMove,
  type Balance,
  type Warehouse,
} from "@/lib/inventory";
import { parseLocalizedDecimal } from "@/lib/number";

const LOT_A = "70000000-0000-4000-8000-000000000001";
const LOT_B = "70000000-0000-4000-8000-000000000002";
const SHELF = "90000000-0000-4000-8000-000000000002";
const DAMAGED = "90000000-0000-4000-8000-000000000003";

function balance(overrides: Partial<Balance> = {}): Balance {
  return {
    batch_id: LOT_A,
    location_id: SHELF,
    warehouse_id: "90000000-0000-4000-8000-000000000001",
    quantity: 10,
    reserved: 2,
    available: 8,
    custody: 1,
    variant_id: "50000000-0000-4000-8000-000000000001",
    sku: "SKU-1",
    product_id: "40000000-0000-4000-8000-000000000001",
    lot_number: "L1",
    expiry_date: null,
    location_code: "A-01",
    is_sellable: true,
    ...overrides,
  };
}

describe("quantities", () => {
  it("does exact thousandths arithmetic", () => {
    expect(toMilli(0.1) + toMilli(0.2)).toBe(300);
    expect(toMilli("1.234")).toBe(1234);
    expect(countDifference(10, "9.75")).toBe(-0.25);
    expect(countDifference("1.1", "1.3")).toBe(0.2);
  });

  it("allows whole units only for piece SKUs, three decimals otherwise", () => {
    expect(parseLocalizedDecimal("1.5", quantityRule(true))).toEqual({ ok: false, error: "not_integer" });
    expect(parseLocalizedDecimal("3", quantityRule(true))).toEqual({ ok: true, value: "3" });
    expect(parseLocalizedDecimal("1.255", quantityRule(false))).toEqual({ ok: true, value: "1.255" });
    expect(parseLocalizedDecimal("1.2555", quantityRule(false))).toEqual({ ok: false, error: "too_many_decimals" });
    // An unknown rule errs on the strict side.
    expect(parseLocalizedDecimal("0.5", quantityRule(undefined))).toEqual({ ok: false, error: "not_integer" });
    expect(parseLocalizedDecimal("9", quantityRule(false, 8))).toEqual({ ok: false, error: "above_max" });
  });

  it("formats with Latin digits in both locales", () => {
    expect(formatQuantity(1250.5, "en")).toBe("1,250.5");
    expect(formatQuantity(1250.5, "ar")).toMatch(/^1.250.5$/);
    expect(formatQuantity(null)).toBe("—");
    expect(formatCost(12090.1234, "en")).toBe("12,090.1234 IQD");
    expect(formatCost(undefined)).toBe("—");
  });
});

describe("stock totals and states", () => {
  it("sums balances exactly and counts custody once per lot", () => {
    const totals = stockTotals([
      balance(),
      balance({ location_id: DAMAGED, quantity: 0.5, reserved: 0, available: 0.5, is_sellable: false }),
      balance({ batch_id: LOT_B, quantity: 1.25, reserved: 0.25, available: 1, custody: 0 }),
    ]);
    expect(totals).toEqual({ onHand: 11.75, reserved: 2.25, available: 9, custody: 1, nonSellable: 0.5 });
  });

  it("only offers unreserved stock to a transfer", () => {
    expect(transferable(balance())).toBe(true);
    expect(transferable(balance({ quantity: 2, reserved: 2, available: 0 }))).toBe(false);
  });

  it("moves sellable stock before writing it down", () => {
    expect(writeDownNeedsMove(balance())).toBe(true);
    expect(writeDownNeedsMove(balance({ is_sellable: false }))).toBe(false);
  });

  it("maps the catalog's availability to badge tones", () => {
    expect(availabilityTone("out_of_stock")).toBe("danger");
    expect(availabilityTone("low_stock")).toBe("warning");
    expect(availabilityTone("in_stock")).toBe("success");
    expect(availabilityTone(undefined)).toBe("neutral");
  });

  it("reads expiry as a calendar day", () => {
    expect(isExpired("2026-09-30T00:00:00.000Z", "2026-10-01")).toBe(true);
    expect(isExpired("2026-10-01T00:00:00.000Z", "2026-10-01")).toBe(false);
    expect(isExpired(null, "2026-10-01")).toBe(false);
  });
});

describe("locations", () => {
  const warehouses: Warehouse[] = [
    {
      id: "w1",
      code: "MAIN",
      name: "Main",
      is_active: true,
      locations: [
        { id: SHELF, code: "A-01", is_sellable: true, is_active: true },
        { id: DAMAGED, code: "DMG", is_sellable: false, is_active: true },
      ],
    },
    { id: "w2", code: "OLD", name: "Old", is_active: false, locations: [{ id: "l3", code: "X", is_sellable: true, is_active: true }] },
  ];

  it("indexes every location with its warehouse; an inactive warehouse disables its locations", () => {
    const index = locationIndex(warehouses);
    expect(index.get(DAMAGED)).toMatchObject({ code: "DMG", warehouseCode: "MAIN", sellable: false, active: true });
    expect(index.get("l3")?.active).toBe(false);
    expect(locationLabel(index.get(SHELF))).toBe("MAIN · A-01");
    expect(locationLabel(undefined, "abc")).toBe("abc");
  });
});

describe("links", () => {
  it("links each source to its document, order or nothing", () => {
    expect(sourceLink({ source_type: "inventory_opening", source_id: "o1" })).toEqual({
      kind: "document",
      type: "opening",
      href: "/inventory/documents/opening/o1",
    });
    expect(sourceLink({ source_type: "stock_count", source_id: "c1" })).toMatchObject({ href: "/inventory/counts/c1" });
    expect(sourceLink({ source_type: "order", source_id: "ord" })).toEqual({ kind: "order", href: "/orders/ord" });
    // A reservation's reference is the order NUMBER, so it searches the orders list.
    expect(sourceLink({ source_type: "stock_reservation", source_id: "r1", reference: "SH-2026-1" })).toEqual({
      kind: "order",
      href: "/orders?q=SH-2026-1",
    });
    expect(sourceLink({ source_type: "return", source_id: "x" })).toEqual({ kind: "none" });
  });

  it("links journal entries to inventory documents as well as financial ones", () => {
    expect(sourceDocumentHref({ source_type: "inventory_write_down", source_id: "w1" })).toBe("/inventory/documents/write_down/w1");
    expect(sourceDocumentHref({ source_type: "stock_count", source_id: "c1" })).toBe("/inventory/counts/c1");
    expect(sourceDocumentHref({ source_type: "cash_transfer", source_id: "d1" })).toBe("/finance/documents/d1");
    expect(sourceDocumentHref({ source_type: "journal_reversal", source_id: "j1" })).toBeNull();
  });

  it("builds stock and document URLs", () => {
    expect(stockHref({ variant_id: "v1", location_id: "" })).toBe("/inventory/stock?variant_id=v1");
    expect(stockHref({})).toBe("/inventory/stock");
    expect(documentHref("transfer", "t/1")).toBe("/inventory/documents/transfer/t%2F1");
  });
});

describe("list parameters", () => {
  it("passes only valid filters to the balances query", () => {
    const params = parseTableParams(
      { warehouse_id: "not-a-uuid", variant_id: "50000000-0000-4000-8000-000000000001", per_page: "50", page: "2" },
      { sortKeys: ["expiry"], defaultSort: "expiry", filterKeys: STOCK_FILTER_KEYS },
    );
    expect(balanceQuery(params)).toEqual({ page: 2, per_page: 50, variant_id: "50000000-0000-4000-8000-000000000001" });
    expect(balanceQuery(params, 1).page).toBe(1);
  });

  it("drops an unknown movement type", () => {
    const params = parseTableParams(
      { type: "teleport", batch_id: LOT_A },
      { sortKeys: ["created_at"], defaultSort: "created_at", filterKeys: MOVEMENT_FILTER_KEYS },
    );
    expect(movementQuery(params)).toEqual({ page: 1, per_page: 20, batch_id: LOT_A });
    const typed = parseTableParams({ type: "write_down" }, { sortKeys: ["created_at"], defaultSort: "created_at", filterKeys: MOVEMENT_FILTER_KEYS });
    expect(movementQuery(typed).type).toBe("write_down");
  });
});

describe("counts", () => {
  it("summarizes shortage, surplus and missing lines", () => {
    expect(
      summarizeCount([
        { batchId: LOT_A, locationId: SHELF, system: 10, counted: "8" },
        { batchId: LOT_B, locationId: SHELF, system: 1.5, counted: "2.25" },
        { batchId: LOT_B, locationId: DAMAGED, system: 3, counted: "3" },
        { batchId: LOT_A, locationId: DAMAGED, system: 1, counted: null },
      ]),
    ).toEqual({ shortage: 2, surplus: 0.75, changedLines: 2, missing: 1 });
  });

  it("knows how much a count releases from reservations", () => {
    expect(reservationShortfall("1", 3)).toBe(2);
    expect(reservationShortfall("5", 3)).toBe(0);
    expect(reservationShortfall(null, 3)).toBe(0);
  });

  it("recognizes the API's stale-count refusal, and only that", () => {
    expect(isStaleCount(new ApiError(409, "Translated", "STOCK_COUNT_SNAPSHOT_STALE"))).toBe(true);
    expect(isStaleCount(new ApiError(409, "Translated", "STOCK_COUNT_ALREADY_APPROVED"))).toBe(false);
    expect(isStaleCount(new ApiError(422, "after the snapshot"))).toBe(false);
    expect(isWholeUnitsError(new ApiError(422, "x", "SKU_WHOLE_UNITS_ONLY"))).toBe(true);
  });

  it("carries counts into a fresh snapshot and marks what moved for re-verification", () => {
    const carried = carryCounts(
      [
        { key: `${LOT_A}:${SHELF}`, system: 10, counted: "8" },
        { key: `${LOT_B}:${SHELF}`, system: 5, counted: "5" },
        { key: `${LOT_B}:${DAMAGED}`, system: 1, counted: "0" },
      ],
      [
        { batch_id: LOT_A, location_id: SHELF, system_quantity: 10 },
        { batch_id: LOT_B, location_id: SHELF, system_quantity: 4 },
        { batch_id: LOT_A, location_id: DAMAGED, system_quantity: 2.5 },
      ],
    );
    expect(carried.get(`${LOT_A}:${SHELF}`)).toEqual({ counted: "8", reverify: false });
    expect(carried.get(`${LOT_B}:${SHELF}`)).toEqual({ counted: "4", reverify: true });
    expect(carried.get(`${LOT_A}:${DAMAGED}`)).toEqual({ counted: "2.5", reverify: true });
    expect(carried.has(`${LOT_B}:${DAMAGED}`)).toBe(false);
  });

  it("re-snapshots the same scope", () => {
    expect(countScope({ warehouse_id: null, location_id: SHELF, variant_id: null, reason: "Weekly" })).toEqual({
      location_id: SHELF,
      reason: "Weekly",
    });
  });
});

describe("posting and navigation", () => {
  it("resolves a replayed inventory operation to its document", () => {
    const outcome = resolveOutcome<{ id: string; document_number: string }>({
      operation_id: "op-1",
      status: "completed",
      response_status: 201,
      response: { id: "d1", document_number: "INV-OPEN-2026-000001" },
    } as never);
    expect(outcome).toEqual({ kind: "posted", document: { id: "d1", document_number: "INV-OPEN-2026-000001" } });
  });

  it("shows the inventory screens to inventory.view only", () => {
    const keys = visibleNav(["inventory.view"]).map((item) => item.key);
    expect(keys).toEqual(["dashboard", "stock", "movements", "warehouses", "openings", "transfers", "counts", "writeDowns"]);
    expect(visibleNav(["catalog.products"]).map((item) => item.key)).not.toContain("stock");
  });
});
