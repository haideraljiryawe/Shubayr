import { describe, expect, it } from "vitest";
import {
  adminInboxHref,
  availableActions,
  canAssignAgent,
  dispatchBlocker,
  orderListQuery,
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
    ["dispatched", []],
    ["delivered", []],
    ["failed", []],
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
});

describe("adminInboxHref", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  it("opens orders in the admin and everything else in the inbox", () => {
    expect(adminInboxHref(`/admin/orders/${id}`)).toBe(`/orders/${id}`);
    expect(adminInboxHref(`/orders/${id}`)).toBe(`/orders/${id}`);
    expect(adminInboxHref(`/monitor/orders/${id}`)).toBe("/notifications");
    expect(adminInboxHref("https://evil.example/orders/x")).toBe("/notifications");
    expect(adminInboxHref(`/admin/orders/${id}/../../x`)).toBe("/notifications");
  });
});
