import { describe, expect, it } from "vitest";
import { canListParties, isIssue, partyLabel, partyListQuery, statementQuery } from "@/lib/delivery-parties";

const base = { q: "", page: 1, perPage: 20, filters: {} as Record<string, string> };

describe("partyListQuery", () => {
  it("passes search, type and status through as API parameters", () => {
    expect(partyListQuery({ ...base, q: "Ali", page: 2, filters: { kind: "external_driver", status: "inactive" } })).toEqual({
      page: 2,
      per_page: 20,
      q: "Ali",
      kind: "external_driver",
      active: false,
    });
    expect(partyListQuery({ ...base, filters: { status: "active" } })).toEqual({ page: 1, per_page: 20, active: true });
  });

  it("drops an unknown type or status instead of sending what the API would refuse", () => {
    expect(partyListQuery({ ...base, filters: { kind: "courier", status: "maybe" } })).toEqual({ page: 1, per_page: 20 });
  });
});

describe("statementQuery", () => {
  const order = "22222222-2222-4222-8222-222222222222";

  it("passes valid filters through", () => {
    expect(statementQuery({ from: "2026-10-01", to: "2026-10-04", order_id: order }, 3, 10)).toEqual({
      page: 3,
      per_page: 10,
      order_id: order,
      from: "2026-10-01",
      to: "2026-10-04",
    });
  });

  it("drops a malformed id or day, and an inverted range the API would answer with a 400", () => {
    expect(statementQuery({ order_id: "nope", from: "01/10/2026" }, 1, 20)).toEqual({ page: 1, per_page: 20 });
    expect(statementQuery({ from: "2026-10-05", to: "2026-10-01" }, 1, 20)).toEqual({ page: 1, per_page: 20 });
  });
});

describe("helpers", () => {
  it("lists parties with any of the three permissions", () => {
    expect(canListParties(["orders.assign_agent"])).toBe(true);
    expect(canListParties(["drivers.manage"])).toBe(true);
    expect(canListParties(["deliveries.manage"])).toBe(true);
    expect(canListParties(["orders.view"])).toBe(false);
  });

  it("labels and signs statement movements", () => {
    expect(partyLabel({ name: "Ali", phone: "+9647700000001" })).toBe("Ali · +9647700000001");
    expect(isIssue({ event: "issue_to_custody" })).toBe(true);
    expect(isIssue({ event: "return_in" })).toBe(false);
  });
});
