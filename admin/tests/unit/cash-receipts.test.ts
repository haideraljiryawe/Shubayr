import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  allocationPlan,
  autoAllocate,
  OperationKey,
  receiptListQuery,
  receiptRefusal,
  unsettledRows,
  type UnsettledRow,
} from "@/lib/finance/cash-receipts";
import { toFixed } from "@/lib/purchasing";

const rows: UnsettledRow[] = [
  { orderId: "o1", orderNumber: "ORD-1", unsettled: toFixed("25000") },
  { orderId: "o2", orderNumber: "ORD-2", unsettled: toFixed("25000") },
  { orderId: "o3", orderNumber: "ORD-3", unsettled: toFixed("10000") },
];

describe("autoAllocate", () => {
  it("fills oldest first, each up to what is unsettled, and leaves the rest", () => {
    expect(autoAllocate(toFixed("30000"), rows)).toEqual({ o1: "25000", o2: "5000" });
    expect(autoAllocate(toFixed("60000"), rows)).toEqual({ o1: "25000", o2: "25000", o3: "10000" });
    // More than everything unsettled: the rows are full and the rest stays unallocated.
    expect(autoAllocate(toFixed("70000"), rows)).toEqual({ o1: "25000", o2: "25000", o3: "10000" });
    expect(autoAllocate(0n, rows)).toEqual({});
  });

  it("keeps exact decimals", () => {
    expect(autoAllocate(toFixed("0.3"), [{ orderId: "a", orderNumber: "A", unsettled: toFixed("0.1") }, { orderId: "b", orderNumber: "B", unsettled: toFixed("1") }])).toEqual({
      a: "0.1",
      b: "0.2",
    });
  });
});

describe("allocationPlan", () => {
  it("receive and auto-allocate across 3 orders with a remainder", () => {
    const applied = autoAllocate(toFixed("70000"), rows);
    const plan = allocationPlan({ amount: "70000", rows, applied, cashHeld: toFixed("80000") });
    expect(plan.problems).toEqual([]);
    expect(plan.allocated).toBe(toFixed("60000"));
    expect(plan.unallocated).toBe(toFixed("10000"));
    expect(plan.lines).toEqual([
      { order_id: "o1", amount_iqd: "25000" },
      { order_id: "o2", amount_iqd: "25000" },
      { order_id: "o3", amount_iqd: "10000" },
    ]);
  });

  it("a partial manual allocation leaves the rest unallocated", () => {
    const plan = allocationPlan({ amount: "50000", rows, applied: { o2: "12000", o3: "" }, cashHeld: toFixed("60000") });
    expect(plan.problems).toEqual([]);
    expect(plan.lines).toEqual([{ order_id: "o2", amount_iqd: "12000" }]);
    expect(plan.unallocated).toBe(toFixed("38000"));
  });

  it("says each problem before anything is sent", () => {
    expect(allocationPlan({ amount: "", rows, applied: {} }).problems).toEqual([{ kind: "amount" }]);
    expect(allocationPlan({ amount: "90000", rows, applied: {}, cashHeld: toFixed("60000") }).problems).toEqual([{ kind: "overCustody" }]);
    expect(allocationPlan({ amount: "60000", rows, applied: { o3: "10001" } }).problems).toEqual([{ kind: "overRow", orderNumber: "ORD-3" }]);
    expect(allocationPlan({ amount: "20000", rows, applied: { o1: "15000", o2: "10000" } }).problems).toEqual([{ kind: "overAmount" }]);
    expect(allocationPlan({ amount: "20000", rows, applied: { o1: "1.2345678" } }).problems).toEqual([{ kind: "invalidRow", orderNumber: "ORD-1" }]);
  });

  it("nothing allocated means everything unallocated", () => {
    const plan = allocationPlan({ amount: "5000", rows, applied: {} });
    expect(plan).toMatchObject({ allocated: 0n, unallocated: toFixed("5000"), lines: [], problems: [] });
  });
});

describe("unsettledRows", () => {
  it("reads the API's suggestions in their order", () => {
    expect(
      unsettledRows([
        {
          collection_id: "c1",
          order: { id: "o9", order_number: "ORD-9" },
          collected_amount_iqd: 25000,
          allocated_amount_iqd: 5000,
          unsettled_amount_iqd: 20000,
          suggested_amount_iqd: 20000,
          collected_at: "2026-10-08T10:00:00Z",
        },
      ]),
    ).toEqual([{ orderId: "o9", orderNumber: "ORD-9", unsettled: toFixed("20000") }]);
  });
});

describe("receiptRefusal", () => {
  const conflict = (message: string) => new ApiError(409, message, "CONFLICT");
  it("names each refusal the API gives", () => {
    expect(receiptRefusal(conflict("Allocations exceed the receipt’s unallocated amount"))).toBe("overAllocation");
    expect(receiptRefusal(conflict("A receipt cannot be allocated to another party’s order"))).toBe("wrongParty");
    expect(receiptRefusal(conflict("Allocation exceeds the order’s unsettled collected amount"))).toBe("moreThanCollected");
    expect(receiptRefusal(conflict("Only confirmed collected amounts can be allocated"))).toBe("notConfirmed");
    expect(receiptRefusal(new ApiError(422, "An order may appear only once in an allocation batch"))).toBe("duplicateOrder");
    expect(receiptRefusal(conflict("Receipt amount exceeds the party’s cash custody balance"))).toBe("overCustody");
    expect(receiptRefusal(new ApiError(403, "A user cannot reverse their own cash receipt voucher", "SEPARATION_OF_DUTIES_VIOLATION"))).toBe("ownReceipt");
    expect(receiptRefusal(new ApiError(403, "A delivery party cannot receive or approve cash from their own custody", "SEPARATION_OF_DUTIES_VIOLATION"))).toBe("ownCustody");
    expect(
      receiptRefusal(new ApiError(403, "Strict separation of duties requires another user to allocate the receipt after it is created", "SEPARATION_OF_DUTIES_VIOLATION")),
    ).toBe("strictAllocation");
    expect(receiptRefusal(conflict("Cash receipt is already reversed"))).toBe("alreadyReversed");
    expect(receiptRefusal(conflict("A reversed cash receipt cannot be allocated"))).toBe("reversedReceipt");
    expect(receiptRefusal(conflict("Delivery party is inactive"))).toBe("inactiveParty");
    expect(receiptRefusal(conflict("Cash account is inactive"))).toBe("inactiveAccount");
    expect(receiptRefusal(new ApiError(404, "Delivered order collection not found"))).toBe("collectionNotFound");
  });

  it("leaves anything else to the generic error", () => {
    expect(receiptRefusal(new ApiError(409, "The operation id was already used with a different payload", "CONFLICT"))).toBeNull();
    expect(receiptRefusal(new Error("boom"))).toBeNull();
  });
});

describe("OperationKey", () => {
  it("keeps one id per exact request, and a new one after a success", () => {
    let next = 0;
    const key = new OperationKey(() => `op-${++next}`);
    const first = key.id('{"amount":"70000"}');
    // A double click or a retry: the same request, the same id (the API replays).
    expect(key.id('{"amount":"70000"}')).toBe(first);
    // A different request: a new id (the API refuses one id with two bodies).
    expect(key.id('{"amount":"60000"}')).toBe("op-2");
    // Posted: the same request again is a new receipt.
    key.reset();
    expect(key.id('{"amount":"60000"}')).toBe("op-3");
  });
});

describe("receiptListQuery", () => {
  const PARTY = "11111111-1111-4111-8111-111111111111";
  const ACCOUNT = "22222222-2222-4222-8222-222222222222";
  it("sends the filters it understands", () => {
    expect(receiptListQuery({ party_id: PARTY, cash_account_id: ACCOUNT, date_from: "2026-10-01", date_to: "2026-10-08", status: "reversed" }, 2, 50)).toEqual({
      query: { page: 2, per_page: 50, party_id: PARTY, cash_account_id: ACCOUNT, date_from: "2026-10-01", date_to: "2026-10-08", status: "reversed" },
      ignoredDates: false,
    });
  });

  it("drops malformed values and doesn't send an inverted range", () => {
    expect(receiptListQuery({ party_id: "x", status: "void", date_from: "08/10/2026" }, 1, 20)).toEqual({ query: { page: 1, per_page: 20 }, ignoredDates: false });
    expect(receiptListQuery({ date_from: "2026-10-08", date_to: "2026-10-01" }, 1, 20)).toEqual({ query: { page: 1, per_page: 20 }, ignoredDates: true });
  });
});
