import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  exceptionListQuery,
  exceptionRefusal,
  holdingLines,
  refundCap,
  returnValue,
  type CustodyException,
  type CustodyLine,
} from "@/lib/finance/custody-exceptions";
import { toFixed } from "@/lib/purchasing";
import {
  blockingOrders,
  closePreview,
  orderBlocker,
  shareTotals,
  splitFare,
  TripEventKey,
  tripListQuery,
  tripRefusal,
  unresolvedOrderIds,
  type Trip,
} from "@/lib/trips";

const holding = (id: string, variant: string, quantity: number) =>
  ({ holding_id: id, variant_id: variant, quantity, order: { id: "o1", order_number: "ORD-1" } }) as unknown as CustodyLine;

describe("custody exception lines", () => {
  const holdings = [holding("h1", "v1", 2), holding("h2", "v2", 1)];

  it("turns typed quantities into lines, and flags more than held", () => {
    expect(holdingLines(holdings, { h1: "1", h2: "" })).toEqual({ lines: [{ custody_holding_id: "h1", quantity: "1" }], problems: [] });
    expect(holdingLines(holdings, { h1: "3" }).problems).toEqual(["h1"]);
    expect(holdingLines(holdings, { h2: "1.2345" }).problems).toEqual(["h2"]);
  });

  it("values goods refused at the door as their share of the order line", () => {
    const items = [
      { variantId: "v1", quantity: 2, lineTotal: 50000 },
      { variantId: "v2", quantity: 1, lineTotal: 7000 },
    ];
    expect(returnValue(holdings, { h1: "1" }, items)).toBe(toFixed("25000"));
    expect(returnValue(holdings, { h1: "2", h2: "1" }, items)).toBe(toFixed("57000"));
    expect(returnValue(holdings, {}, items)).toBe(0n);
  });
});

describe("refundCap", () => {
  const refund = (amount: number, status: "active" | "reversed") => ({ type: "delivery_fee_refund", status, amount_iqd: amount }) as CustodyException;

  it("is the fee charged less active refunds", () => {
    expect(refundCap({ fee: 5000, refunded: [], uncollected: null, method: "cash_account" })).toBe(toFixed("5000"));
    expect(refundCap({ fee: 5000, refunded: [refund(2000, "active"), refund(3000, "reversed")], uncollected: null, method: "cash_account" })).toBe(toFixed("3000"));
    expect(refundCap({ fee: 5000, refunded: [refund(5000, "active")], uncollected: null, method: "cash_account" })).toBe(0n);
  });

  it("set against the uncollected amount, no more than is uncollected", () => {
    expect(refundCap({ fee: 5000, refunded: [], uncollected: 1500, method: "uncollected" })).toBe(toFixed("1500"));
    expect(refundCap({ fee: 5000, refunded: [], uncollected: null, method: "uncollected" })).toBe(0n);
  });
});

describe("exception refusals", () => {
  const refused = (code: string | undefined, message = "English text that must not matter") => new ApiError(409, message, code);
  it("names each refusal from the API's code, never its message", () => {
    expect(exceptionRefusal(refused("RECEIPT_REVERSAL_REQUIRED"))).toBe("receiptConsumed");
    expect(exceptionRefusal(refused("SELF_REVERSAL_FORBIDDEN"))).toBe("ownException");
    expect(exceptionRefusal(refused("SEPARATION_OF_DUTIES_VIOLATION"))).toBe("separation");
    expect(exceptionRefusal(refused("DELIVERY_FEE_REFUND_EXCEEDS_CHARGE"))).toBe("feeCap");
    expect(exceptionRefusal(refused("DELIVERY_FEE_REFUND_EXCEEDS_UNCOLLECTED"))).toBe("noUncollected");
    expect(exceptionRefusal(refused("RETURN_REQUIRES_CONFIRMED_SHORTFALL"))).toBe("noShortfall");
    expect(exceptionRefusal(refused("GOODS_NOT_IN_CUSTODY"))).toBe("notInCustody");
    expect(exceptionRefusal(refused("RETURN_REQUIRES_SOLD_CUSTODY"))).toBe("notSold");
    expect(exceptionRefusal(refused("CUSTODY_EXCEPTION_ALREADY_REVERSED"))).toBe("alreadyReversed");
    expect(exceptionRefusal(refused("SOMETHING_ELSE"))).toBeNull();
    // An English message alone no longer classifies anything.
    expect(exceptionRefusal(refused(undefined, "Custody exception is already reversed"))).toBeNull();
  });

  it("builds the list query and drops an inverted date range", () => {
    const PARTY = "11111111-1111-4111-8111-111111111111";
    expect(exceptionListQuery({ type: "goods_loss", party_id: PARTY, status: "active", date_from: "2026-10-01" }, 2, 20)).toEqual({
      query: { page: 2, per_page: 20, type: "goods_loss", party_id: PARTY, status: "active", date_from: "2026-10-01" },
      ignoredDates: false,
    });
    expect(exceptionListQuery({ type: "theft", date_from: "2026-10-09", date_to: "2026-10-01" }, 1, 20)).toEqual({ query: { page: 1, per_page: 20 }, ignoredDates: true });
  });
});

const trip = (over: Partial<Trip> = {}) =>
  ({
    status: "in_progress",
    fare: { bearer: "store", amount_iqd: 6000, settlement_method: "payable" },
    settlement: { expected_cash_iqd: 75000, received_cash_iqd: 50000, netted_fare_iqd: 0, outstanding_cash_iqd: 25000, result: "settlement_open", allocations: [] },
    orders: [],
    ...over,
  }) as unknown as Trip;

describe("trips", () => {
  it("previews the settlement before closing, the driver-kept fare included", () => {
    expect(closePreview(trip())).toMatchObject({ expected: toFixed("75000"), received: toFixed("50000"), netted: 0n, outstanding: toFixed("25000"), result: "settlement_open" });
    const keeps = closePreview(trip({ fare: { bearer: "store", amount_iqd: 6000, settlement_method: "driver_keeps" } as Trip["fare"] }));
    expect(keeps).toMatchObject({ netted: toFixed("6000"), outstanding: toFixed("19000"), nettingTooLarge: false });
    // A customer-paid fare never enters the store's cash.
    const customer = closePreview(trip({ fare: { bearer: "customer_direct", amount_iqd: 6000, settlement_method: "customer_direct" } as Trip["fare"] }));
    expect(customer.netted).toBe(0n);
    // Netting more fare than the cash not yet handed in is refused by the API; said first.
    expect(closePreview(trip({ fare: { bearer: "store", amount_iqd: 30000, settlement_method: "driver_keeps" } as Trip["fare"] })).nettingTooLarge).toBe(true);
    // Everything handed in: settled.
    expect(closePreview(trip({ settlement: { expected_cash_iqd: 1000, received_cash_iqd: 1000, netted_fare_iqd: 0 } as Trip["settlement"] })).result).toBe("settled");
  });

  it("knows which orders block the close", () => {
    expect(orderBlocker({ status: "dispatched", collection: null })).toBe("notDelivered");
    expect(orderBlocker({ status: "delivered", collection: { status: "unconfirmed" } as never })).toBe("unconfirmed");
    expect(orderBlocker({ status: "delivered", collection: { status: "confirmed_short" } as never })).toBeNull();
    expect(orderBlocker({ status: "cancelled", collection: null })).toBeNull();
    const orders = [
      { id: "a", status: "delivered", collection: { status: "confirmed_full" } },
      { id: "b", status: "dispatched", collection: null },
    ] as unknown as Trip["orders"];
    expect(blockingOrders({ orders }).map(({ order, blocker }) => [order.id, blocker])).toEqual([["b", "notDelivered"]]);
  });

  it("reads the orders a refused close names", () => {
    const refused = new ApiError(409, "Every trip order must be delivered…", "TRIP_ORDERS_UNRESOLVED", [{ field: "orders.o-2", code: "unresolved", message: "x" }]);
    expect(tripRefusal(refused)).toBe("unresolved");
    expect(unresolvedOrderIds(refused)).toEqual(["o-2"]);
    expect(tripRefusal(new ApiError(403, "x", "SELF_TRIP_CLOSE_FORBIDDEN"))).toBe("ownTrip");
    expect(tripRefusal(new ApiError(409, "x", "DOUBLE_DELIVERY_CHARGE"))).toBe("doubleCharge");
    expect(tripRefusal(new ApiError(409, "x", "TRIP_FARE_SHARES_MISMATCH"))).toBe("sharesMismatch");
    expect(tripRefusal(new ApiError(409, "Trip order fare shares must equal the one trip fare"))).toBeNull();
  });

  it("splits a fare and checks the shares", () => {
    expect(splitFare("6000", 3)).toEqual(["2000", "2000", "2000"]);
    expect(splitFare("1000", 3)).toEqual(["333", "333", "334"]);
    const shared = shareTotals(trip({ orders: [{ fare_share_iqd: 2000 }, { fare_share_iqd: 2000 }] as Trip["orders"] }));
    expect(shared.left).toBe(toFixed("2000"));
  });

  it("keeps one operation id and one event time per exact request", () => {
    let id = 0;
    let clock = 0;
    const key = new TripEventKey(() => `op-${++id}`, () => `t${++clock}`);
    const first = key.take("close:v1");
    // A retry resends the same id AND time, so the API replays it.
    expect(key.take("close:v1")).toEqual(first);
    expect(key.take("close:v2")).toEqual({ id: "op-2", eventAt: "t2" });
    key.reset();
    expect(key.take("close:v2")).toEqual({ id: "op-3", eventAt: "t3" });
  });

  it("builds the trip list query", () => {
    const DRIVER = "22222222-2222-4222-8222-222222222222";
    expect(tripListQuery({ driver_party_id: DRIVER, status: "closed" }, 1, 20)).toEqual({ query: { page: 1, per_page: 20, driver_party_id: DRIVER, status: "closed" }, ignoredDates: false });
    expect(tripListQuery({ status: "lost" }, 1, 20).query).toEqual({ page: 1, per_page: 20 });
  });
});
