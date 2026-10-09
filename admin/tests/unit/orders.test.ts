import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  adminInboxHref,
  attention,
  availableActions,
  batchPickRows,
  belowCostBreaches,
  canOpenRetrieval,
  canResolveShortage,
  cancellationResolutions,
  hasPickList,
  isSelfApprovalRefused,
  needsAttentionRefusal,
  staleState,
  type PickList,
  canAssignAgent,
  dispatchBlocker,
  isOrderQueue,
  orderListQuery,
  queueQuery,
  type AdminOrder,
} from "@/lib/orders";

const ALL = [
  "orders.view",
  "orders.accept",
  "orders.reject",
  "orders.prepare",
  "orders.mark_ready",
  "orders.handover",
  "orders.cancel",
  "orders.assign_agent",
  "orders.deliver",
  "orders.fail",
  "orders.retry",
];

function order(
  status: AdminOrder["status"],
  extra: Partial<AdminOrder> = {},
): AdminOrder {
  return {
    status,
    payments: [{ status: "pending" }],
    delivery: {
      id: "d0000000-0000-4000-8000-000000000001",
      status: "assigned",
      agent: { id: "a", name: "Agent", phone: "+9647700000005" },
    },
    ...extra,
  } as AdminOrder;
}

describe("availableActions — permission AND state", () => {
  it.each([
    ["pending", ["accept", "reject", "cancel"]],
    ["confirmed", ["prepare", "cancel"]],
    ["preparing", ["markReady", "cancel"]],
    ["ready_for_dispatch", ["dispatch", "cancel"]],
    ["dispatched", ["deliver", "fail"]],
    ["delivered", []],
    ["failed", ["retry"]],
    ["cancelled", []],
    ["rejected", []],
    ["return_requested", []],
    ["returned", []],
  ] as const)("%s with every permission → %j", (status, expected) => {
    expect(availableActions(order(status), ALL)).toEqual(expected);
  });

  it("drops each move whose permission is missing", () => {
    expect(availableActions(order("pending"), ["orders.accept"])).toEqual([
      "accept",
    ]);
    expect(availableActions(order("confirmed"), ["orders.accept"])).toEqual([]);
    expect(availableActions(order("preparing"), ["orders.cancel"])).toEqual([
      "cancel",
    ]);
    expect(availableActions(order("ready_for_dispatch"), [])).toEqual([]);
  });

  it("Reject is its own permission, and only for pending orders", () => {
    expect(availableActions(order("pending"), ["orders.reject"])).toEqual(["reject"]);
    expect(availableActions(order("pending"), ["orders.cancel"])).toEqual(["cancel"]);
    for (const status of ["confirmed", "preparing", "ready_for_dispatch", "dispatched"] as const) {
      expect(availableActions(order(status), ["orders.reject"]), status).toEqual([]);
    }
  });

  it("never offers to cancel or reject a paid order", () => {
    const paid = { payments: [{ status: "paid" as const }] };
    expect(availableActions(order("pending", paid), ALL)).toEqual(["accept"]);
    expect(canAssignAgent(order("rejected"), ALL)).toBe(false);
    expect(availableActions(order("confirmed", paid), ALL)).toEqual([
      "prepare",
    ]);
  });
});

describe("dispatchBlocker", () => {
  it("needs a current delivery with an agent, still assigned", () => {
    expect(dispatchBlocker(order("ready_for_dispatch"))).toBeNull();
    expect(dispatchBlocker(order("ready_for_dispatch", { delivery: null }))).toBe(
      "noDelivery",
    );
    expect(
      dispatchBlocker(
        order("ready_for_dispatch", {
          delivery: { id: "d", status: "assigned", agent: null },
        }),
      ),
    ).toBe("noAgent");
    expect(
      dispatchBlocker(
        order("ready_for_dispatch", {
          delivery: { id: "d", status: "out_for_delivery", agent: { id: "a", phone: "x" } },
        }),
      ),
    ).toBe("deliveryNotAssigned");
  });

  it("accepts an external driver, which has a party but no agent (11.2)", () => {
    expect(
      dispatchBlocker(
        order("ready_for_dispatch", {
          delivery: {
            id: "d",
            status: "assigned",
            agent: null,
            party: { id: "p", kind: "external_driver", name: "Driver", phone: "+9647700000099" },
          },
        }),
      ),
    ).toBeNull();
  });
});

describe("canAssignAgent", () => {
  it("needs the permission, an active delivery and an unfinished order", () => {
    expect(canAssignAgent(order("confirmed"), ALL)).toBe(true);
    expect(canAssignAgent(order("dispatched", {
      delivery: { id: "d", status: "out_for_delivery", agent: null },
    }), ALL)).toBe(true);
    expect(canAssignAgent(order("confirmed"), ["orders.view"])).toBe(false);
    expect(canAssignAgent(order("delivered"), ALL)).toBe(false);
    expect(canAssignAgent(order("confirmed", { delivery: null }), ALL)).toBe(false);
    expect(
      canAssignAgent(order("confirmed", {
        delivery: { id: "d", status: "delivered", agent: null },
      }), ALL),
    ).toBe(false);
  });
});

describe("orderListQuery", () => {
  const base = { page: 2, perPage: 20 };

  it("passes valid filters through as API parameters", () => {
    expect(
      orderListQuery({ ...base, status: "pending", q: " SH-1 ", from: "2026-09-01", to: "2026-09-02" }),
    ).toEqual({
      query: { status: "pending", q: "SH-1", from: "2026-09-01", to: "2026-09-02", page: 2, per_page: 20 },
      invalidRange: false,
    });
  });

  it("drops what the API would refuse, and says so for an inverted range", () => {
    const result = orderListQuery({ ...base, status: "shipped", from: "2026-09-05", to: "2026-09-01", q: "x".repeat(60) });
    expect(result.query.status).toBeUndefined();
    expect(result.query.from).toBeUndefined();
    expect(result.query.to).toBeUndefined();
    expect(result.query.q).toHaveLength(40);
    expect(result.invalidRange).toBe(true);
    expect(orderListQuery({ ...base, from: "01/09/2026" }).query.from).toBeUndefined();
  });

  it("turns a work queue into the API's own filter (contract 11.0)", () => {
    expect(orderListQuery({ ...base, queue: "late" }).query).toMatchObject({ late: true });
    expect(orderListQuery({ ...base, queue: "attention" }).query).toMatchObject({ needs_attention: true });
    expect(orderListQuery({ ...base, queue: "cancellation" }).query).toMatchObject({ cancellation_request: "pending" });
    const unknown = orderListQuery({ ...base, queue: "everything" }).query;
    expect(unknown).not.toHaveProperty("late");
    expect(unknown).not.toHaveProperty("needs_attention");
    expect(unknown).not.toHaveProperty("cancellation_request");
    expect(isOrderQueue("late")).toBe(true);
    expect(isOrderQueue(["late"])).toBe(false);
    expect(queueQuery("cancellation")).toEqual({ cancellation_request: "pending" });
  });
});

describe("adminInboxHref", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  it("opens orders in the admin and everything else in the inbox", () => {
    expect(adminInboxHref(`/admin/orders/${id}`)).toBe(`/orders/${id}`);
    expect(adminInboxHref(`/orders/${id}`)).toBe(`/orders/${id}`);
    expect(adminInboxHref(`/admin/finance/price-approvals/${id}`)).toBe(`/finance/price-approvals/${id}`);
    expect(adminInboxHref(`/monitor/orders/${id}`)).toBe("/notifications");
    expect(adminInboxHref("https://evil.example/orders/x")).toBe("/notifications");
    expect(adminInboxHref(`/admin/orders/${id}/../../x`)).toBe("/notifications");
  });
});

describe("lifecycle v2 (API 10.0)", () => {
  it("offers deliver/fail on a dispatched order and retry on a failed one, each with its own permission", () => {
    expect(availableActions(order("dispatched"), ["orders.fail"])).toEqual(["fail"]);
    expect(availableActions(order("dispatched"), ["orders.deliver"])).toEqual(["deliver"]);
    expect(availableActions(order("failed"), ["orders.deliver", "orders.fail"])).toEqual([]);
    expect(availableActions(order("failed"), ["orders.retry"])).toEqual(["retry"]);
  });

  it("reads the current state from a stale-version refusal", () => {
    const stale = new ApiError(409, "The order changed while you were working", "STALE_ORDER_STATE", [
      { field: "version", code: "STALE_ORDER_STATE", message: "x", current_status: "confirmed", current_version: 3 },
    ]);
    expect(staleState(stale)).toEqual({ status: "confirmed", version: 3 });
    expect(staleState(new ApiError(409, "Coupon is no longer valid", "CONFLICT"))).toBeNull();
  });

  it("lists below-cost breaches, with cost only when the API sent it", () => {
    const blocked = new ApiError(403, "The selling price is below the protected threshold", "BELOW_COST_BLOCKED", [
      { field: "variant.v1", code: "BELOW_COST_BLOCKED", message: "x", sku: "S-1", price: 900, threshold_percent: 100 },
      { field: "variant.v2", code: "BELOW_COST_BLOCKED", message: "x", sku: "S-2", price: 50, threshold_percent: 100, cost: 80, minimum_price: 80 },
    ]);
    expect(belowCostBreaches(blocked)).toEqual([
      { variantId: "v1", sku: "S-1", price: 900, thresholdPercent: 100, cost: null, minimumPrice: null },
      { variantId: "v2", sku: "S-2", price: 50, thresholdPercent: 100, cost: 80, minimumPrice: 80 },
    ]);
    expect(belowCostBreaches(new ApiError(403, "Forbidden", "PERMISSION_DENIED"))).toBeNull();
    expect(isSelfApprovalRefused(new ApiError(403, "Translated", "SEPARATION_OF_DUTIES_VIOLATION"))).toBe(true);
    expect(needsAttentionRefusal(new ApiError(409, "Resolve preparation shortages", "ORDER_NEEDS_ATTENTION"))).toBe(true);
  });

  it("reads shortages and a reduction awaiting the customer", () => {
    const details = {
      attention_details: {
        short_lines: [{ order_item_id: "i1", variant_id: "v1", requested: "3", allocated: "1", short: "2" }],
        reduction_proposal: { order_item_id: "i1", old_quantity: 3, new_quantity: 1, reason: "Short", status: "pending" },
      },
    };
    const read = attention(details as never);
    expect(read.shortLines).toEqual([{ orderItemId: "i1", variantId: "v1", requested: "3", allocated: "1", short: "2" }]);
    expect(read.proposal).toMatchObject({ orderItemId: "i1", oldQuantity: 3, newQuantity: 1, status: "pending" });
    // While the customer decides, staff can't propose again.
    expect(canResolveShortage(order("preparing", { inventory_attention_required: true, ...details } as never), ["orders.shortage.resolve"])).toBe(false);
    expect(
      canResolveShortage(order("preparing", { inventory_attention_required: true, attention_details: { short_lines: [] } } as never), ["orders.shortage.resolve"]),
    ).toBe(true);
    expect(attention(order("pending"))).toEqual({ shortLines: [], proposal: null });
  });

  it("resolves cancellation requests; approving after dispatch needs its own permission", () => {
    const request = { cancellation_request: { status: "pending" as const } };
    expect(cancellationResolutions(order("confirmed", request), ["orders.cancel_request.resolve"])).toEqual(["approve", "deny"]);
    expect(cancellationResolutions(order("dispatched", request), ["orders.cancel_request.resolve"])).toEqual(["deny"]);
    expect(
      cancellationResolutions(order("failed", request), ["orders.cancel_request.resolve", "orders.cancel_after_dispatch"]),
    ).toEqual(["approve", "deny"]);
    expect(cancellationResolutions(order("confirmed"), ["orders.cancel_request.resolve"])).toEqual([]);
  });

  it("opens one retrieval at a time for a failed order, and shows pick lists once preparing", () => {
    expect(canOpenRetrieval(order("failed"), ["retrieval.open"])).toBe(true);
    expect(canOpenRetrieval(order("failed", { retrievals: [{ status: "open" }] } as never), ["retrieval.open"])).toBe(false);
    expect(canOpenRetrieval(order("dispatched"), ["retrieval.open"])).toBe(false);
    expect(hasPickList(order("preparing"), ["inventory.pick"])).toBe(true);
    expect(hasPickList(order("confirmed"), ["inventory.pick"])).toBe(false);
  });

  it("sorts a batch pick list in walking order", () => {
    const lists = [
      { order_number: "ORD-2", items: [{ warehouse_code: "MAIN", location_code: "A-10", product_name_ar: "ب", product_name_en: "B", quantity: 1 }] },
      {
        order_number: "ORD-1",
        items: [
          { warehouse_code: "MAIN", location_code: "A-2", product_name_ar: "أ", product_name_en: "A", quantity: 2 },
          { warehouse_code: "AUX", location_code: "Z-1", product_name_ar: "ج", product_name_en: "C", quantity: 1 },
        ],
      },
    ] as PickList[];
    expect(batchPickRows(lists, "en").map((row) => `${row.warehouse_code}/${row.location_code}/${row.orderNumber}`)).toEqual([
      "AUX/Z-1/ORD-1",
      "MAIN/A-2/ORD-1",
      "MAIN/A-10/ORD-2",
    ]);
  });
});
