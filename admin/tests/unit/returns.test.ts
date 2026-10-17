import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { ApiError } from "@/lib/api/errors";
import { isRouteEnabled, parseModules, routeModule } from "@/lib/modules";
import { visibleNav } from "@/lib/nav";
import {
  RETURN_ACTIONS,
  RETURN_CONDITIONS,
  RETURN_REFUSAL_CODES,
  RETURN_STATUSES,
  approvalBody,
  availableAction,
  eventActor,
  inspectionBody,
  locationsFor,
  nextAction,
  orderNumberFilter,
  parseQuantity,
  quantityText,
  refundBody,
  returnListQuery,
  returnRefusal,
  stepStates,
  type ApprovalForm,
  type Return,
  type ReturnItem,
} from "@/lib/returns";
import type { components } from "@/types/api";

function item(overrides: Partial<ReturnItem> = {}): ReturnItem {
  return {
    id: "line-1",
    order_item_id: "oi-1",
    variant_id: "v-1",
    product_name_ar: "منتج",
    product_name_en: "Product",
    quantity: 2,
    approved_quantity: 0,
    base_unit: "piece",
    whole_units_only: true,
    customer_reason: "Broken",
    reason_code: "defect",
    unit_price: 10000,
    discount_share: 1000,
    net_amount: 19000,
    approved_refund: 0,
    earned_points_share: 0,
    redeemed_points_share: 0,
    currency: "IQD",
    condition: null,
    restock: false,
    batch_id: null,
    inspection_location: null,
    ...overrides,
  };
}

const weighed = item({ id: "line-2", quantity: 1.5, base_unit: "kg", whole_units_only: false });

function form(overrides: Partial<ApprovalForm> = {}): ApprovalForm {
  return { decision: "approve", quantities: {}, note: "", feeOverride: false, feeAmount: "", feeReason: "", ...overrides };
}

/* ------------------------------------------------------------------ flow */

describe("returns flow states", () => {
  it("names the next step for every status, and none once it is finished", () => {
    expect(nextAction("requested")).toBe("approve");
    expect(nextAction("approved")).toBe("receive");
    expect(nextAction("partially_approved")).toBe("receive");
    expect(nextAction("received")).toBe("inspect");
    expect(nextAction("inspected")).toBe("refund");
    for (const status of ["rejected", "refunded", "completed"] as const) expect(nextAction(status)).toBeNull();
  });

  it("marks the steps done, current and upcoming", () => {
    expect(stepStates("requested").map((step) => step.state)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(stepStates("partially_approved").map((step) => step.state)).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(stepStates("received").map((step) => step.state)).toEqual(["done", "done", "current", "upcoming"]);
    expect(stepStates("inspected").map((step) => step.state)).toEqual(["done", "done", "done", "current"]);
    expect(stepStates("refunded").map((step) => step.state)).toEqual(["done", "done", "done", "done"]);
    // A rejection ends the flow: nothing after it is pending.
    expect(stepStates("rejected").map((step) => step.state)).toEqual(["done", "skipped", "skipped", "skipped"]);
  });

  it("offers a step only to whoever holds its permission", () => {
    expect(availableAction("requested", ["returns.view", "returns.approve"])).toBe("approve");
    expect(availableAction("requested", ["returns.view", "returns.receive"])).toBeNull();
    expect(availableAction("approved", ["returns.receive"])).toBe("receive");
    expect(availableAction("received", ["returns.inspect"])).toBe("inspect");
    expect(availableAction("inspected", ["returns.inspect"])).toBeNull();
    expect(availableAction("inspected", ["returns.refund"])).toBe("refund");
    expect(availableAction("refunded", ["returns.refund"])).toBeNull();
  });

  it("tells the customer's own events from staff ones", () => {
    const ret = { user_id: "customer-1" } as Pick<Return, "user_id">;
    expect(eventActor({ actor_id: "customer-1" }, ret)).toBe("customer");
    expect(eventActor({ actor_id: "staff-9" }, ret)).toBe("staff");
  });
});

/* ------------------------------------------------------------ quantities */

describe("return quantities", () => {
  it("takes whole numbers only for piece SKUs", () => {
    expect(parseQuantity("2", { wholeUnitsOnly: true, max: 2 })).toEqual({ ok: true, value: 2 });
    expect(parseQuantity("1.5", { wholeUnitsOnly: true, max: 2 })).toEqual({ ok: false, problem: "whole" });
    // A trailing zero is still a whole number.
    expect(parseQuantity("2.0", { wholeUnitsOnly: true, max: 2 })).toEqual({ ok: true, value: 2 });
  });

  it("takes up to three exact decimals for weighed SKUs", () => {
    expect(parseQuantity("0.25", { wholeUnitsOnly: false, max: 1.5 })).toEqual({ ok: true, value: 0.25 });
    expect(parseQuantity("1.125", { wholeUnitsOnly: false, max: 1.5 })).toEqual({ ok: true, value: 1.125 });
    expect(parseQuantity("0.1234", { wholeUnitsOnly: false, max: 1.5 })).toEqual({ ok: false, problem: "precision" });
    // Arabic-Indic digits and the comma / Arabic decimal mark, as people type them.
    expect(parseQuantity("٠٫٧٥", { wholeUnitsOnly: false, max: 1.5 })).toEqual({ ok: true, value: 0.75 });
    expect(parseQuantity("0,5", { wholeUnitsOnly: false, max: 1.5 })).toEqual({ ok: true, value: 0.5 });
  });

  it("compares in exact thousandths, never floats", () => {
    // 0.1 + 0.2 as a float is 0.30000000000000004 — still within a 0.3 cap.
    expect(parseQuantity(String(0.1 + 0.2), { wholeUnitsOnly: false, max: 0.3 })).toEqual({ ok: false, problem: "precision" });
    expect(parseQuantity("0.3", { wholeUnitsOnly: false, max: 0.1 + 0.2 })).toEqual({ ok: true, value: 0.3 });
    expect(parseQuantity("1.501", { wholeUnitsOnly: false, max: 1.5 })).toEqual({ ok: false, problem: "exceeds" });
  });

  it("refuses empty, negative and non-numbers, and zero unless allowed", () => {
    expect(parseQuantity("", { wholeUnitsOnly: true, max: 2 })).toEqual({ ok: false, problem: "required" });
    expect(parseQuantity("-1", { wholeUnitsOnly: true, max: 2 })).toEqual({ ok: false, problem: "negative" });
    expect(parseQuantity("two", { wholeUnitsOnly: true, max: 2 })).toEqual({ ok: false, problem: "invalid" });
    expect(parseQuantity("0", { wholeUnitsOnly: true, max: 2 })).toEqual({ ok: false, problem: "required" });
    expect(parseQuantity("0", { wholeUnitsOnly: true, max: 2, allowZero: true })).toEqual({ ok: true, value: 0 });
  });

  it("shows a quantity with its unit", () => {
    expect(quantityText(2, item())).toBe("2");
    expect(quantityText(0.25, weighed)).toBe("0.25 kg");
  });
});

/* --------------------------------------------------------------- approve */

describe("approval form", () => {
  const ret = { items: [item(), weighed] };

  it("approves every line at its requested quantity by default", () => {
    expect(approvalBody(ret, form())).toEqual({
      ok: true,
      body: {
        decision: "approve",
        items: [
          { return_item_id: "line-1", approved_quantity: 2 },
          { return_item_id: "line-2", approved_quantity: 1.5 },
        ],
      },
    });
  });

  it("approves a part, and refuses a line with 0", () => {
    const built = approvalBody(ret, form({ quantities: { "line-1": "1", "line-2": "0" }, note: "One cracked" }));
    expect(built).toEqual({
      ok: true,
      body: {
        decision: "approve",
        note: "One cracked",
        items: [
          { return_item_id: "line-1", approved_quantity: 1 },
          { return_item_id: "line-2", approved_quantity: 0 },
        ],
      },
    });
  });

  it("says which line is wrong: fractions of a piece, more than requested", () => {
    expect(approvalBody(ret, form({ quantities: { "line-1": "1.5", "line-2": "2" } }))).toEqual({
      ok: false,
      problems: [
        { itemId: "line-1", problem: "whole" },
        { itemId: "line-2", problem: "exceeds" },
      ],
    });
  });

  it("refuses an approval of nothing: that is a rejection", () => {
    expect(approvalBody(ret, form({ quantities: { "line-1": "0", "line-2": "0" } }))).toEqual({ ok: false, problems: [{ itemId: null, problem: "empty" }] });
  });

  it("rejects the whole return with a reason and no lines", () => {
    expect(approvalBody(ret, form({ decision: "reject", note: "Used item" }))).toEqual({ ok: true, body: { decision: "reject", note: "Used item" } });
    expect(approvalBody(ret, form({ decision: "reject", note: "no" }))).toEqual({ ok: false, problems: [{ itemId: null, problem: "noteRequired" }] });
  });

  it("sends a delivery-fee exception only with a whole-dinar amount and a reason", () => {
    const built = approvalBody(ret, form({ feeOverride: true, feeAmount: "٣٠٠٠", feeReason: "Courier broke it" }));
    expect(built.ok && built.body).toMatchObject({ delivery_fee_refund: 3000, delivery_fee_refund_reason: "Courier broke it" });
    expect(approvalBody(ret, form({ feeOverride: true, feeAmount: "12.5", feeReason: "x" }))).toEqual({
      ok: false,
      problems: [
        { itemId: null, problem: "feeInvalid" },
        { itemId: null, problem: "feeReason" },
      ],
    });
  });
});

/* --------------------------------------------------------------- inspect */

describe("inspection form", () => {
  const ret = { items: [item({ approved_quantity: 2 }), item({ id: "line-3", approved_quantity: 0 })] };
  const locations = [
    { id: "shelf", sellable: true, active: true },
    { id: "quarantine", sellable: false, active: true },
    { id: "old-shelf", sellable: true, active: false },
  ];

  it("offers sellable locations for sellable goods, non-sellable ones otherwise", () => {
    expect(locationsFor("sellable", locations).map((location) => location.id)).toEqual(["shelf"]);
    for (const condition of ["opened", "damaged", "expired"] as const) {
      expect(locationsFor(condition, locations).map((location) => location.id)).toEqual(["quarantine"]);
    }
    expect(locationsFor("", locations)).toEqual([]);
  });

  it("inspects only the approved lines, each with a condition and a fitting location", () => {
    expect(inspectionBody(ret, { "line-1": { condition: "damaged", locationId: "quarantine" } }, locations)).toEqual({
      ok: true,
      body: { items: [{ return_item_id: "line-1", condition: "damaged", location_id: "quarantine" }] },
    });
  });

  it("says what is missing or wrong on a line", () => {
    expect(inspectionBody(ret, {}, locations)).toEqual({ ok: false, problems: [{ itemId: "line-1", problem: "condition" }] });
    expect(inspectionBody(ret, { "line-1": { condition: "sellable", locationId: "" } }, locations)).toEqual({
      ok: false,
      problems: [{ itemId: "line-1", problem: "location" }],
    });
    expect(inspectionBody(ret, { "line-1": { condition: "sellable", locationId: "quarantine" } }, locations)).toEqual({
      ok: false,
      problems: [{ itemId: "line-1", problem: "mismatch" }],
    });
    expect(inspectionBody(ret, { "line-1": { condition: "sellable", locationId: "old-shelf" } }, locations)).toEqual({
      ok: false,
      problems: [{ itemId: "line-1", problem: "location" }],
    });
  });
});

/* ---------------------------------------------------------------- refund */

describe("refund form", () => {
  const blank = { method: "cash_account" as const, cashAccountId: "", collectionId: "", proofReference: "" };

  it("pays from a cash account", () => {
    expect(refundBody({ cash_refund_amount: 9000 }, { ...blank, cashAccountId: "till" })).toEqual({ ok: true, body: { method: "cash_account", cash_account_id: "till" } });
    expect(refundBody({ cash_refund_amount: 9000 }, blank)).toEqual({ ok: false, problems: ["cashAccount"] });
  });

  it("pays from custody with the order's collection and a proof reference", () => {
    expect(refundBody({ cash_refund_amount: 9000 }, { ...blank, method: "delivery_custody", collectionId: "col-1", proofReference: " R-7 " })).toEqual({
      ok: true,
      body: { method: "delivery_custody", collection_id: "col-1", proof_reference: "R-7" },
    });
    expect(refundBody({ cash_refund_amount: 9000 }, { ...blank, method: "delivery_custody" })).toEqual({ ok: false, problems: ["collection", "proof"] });
  });

  it("records the step with no source when nothing is left to pay", () => {
    expect(refundBody({ cash_refund_amount: 0 }, { ...blank, method: "delivery_custody" })).toEqual({ ok: true, body: { method: "cash_account" } });
  });
});

/* ---------------------------------------------------------------- refusals */

describe("return refusals", () => {
  it("reads a declared code, and nothing else", () => {
    expect(returnRefusal(new ApiError(409, "x", "RETURN_INVALID_STATE"))).toBe("RETURN_INVALID_STATE");
    expect(returnRefusal(new ApiError(403, "x", "SEPARATION_OF_DUTIES_VIOLATION"))).toBe("SEPARATION_OF_DUTIES_VIOLATION");
    expect(returnRefusal(new ApiError(422, "x", "VALIDATION_FAILED"))).toBeNull();
    expect(returnRefusal(new Error("x"))).toBeNull();
  });

  it("lists every code the contract declares on the staff routes", () => {
    type Declared =
      | "RETURN_INVALID_STATE"
      | "RETURN_REFUND_EXCEEDS_PAID"
      | "RETURN_LOCATION_CONDITION_MISMATCH"
      | "RETURN_DELIVERY_FEE_EXCEEDS_CHARGED";
    const declared: Declared[] = ["RETURN_INVALID_STATE", "RETURN_REFUND_EXCEEDS_PAID", "RETURN_LOCATION_CONDITION_MISMATCH", "RETURN_DELIVERY_FEE_EXCEEDS_CHARGED"];
    for (const code of declared) expect(RETURN_REFUSAL_CODES).toContain(code);
  });
});

/* ------------------------------------------------------------------ list */

describe("returns list query", () => {
  it("sends status, dates, sort and the looked-up order", () => {
    expect(
      returnListQuery({ filters: { status: "received", date_from: "2026-10-01", date_to: "2026-10-17" }, page: 2, perPage: 20, sort: "refund", dir: "asc", orderId: "o-1" }),
    ).toEqual({
      query: { page: 2, per_page: 20, sort_by: "refund", sort_direction: "asc", status: "received", order_id: "o-1", date_from: "2026-10-01", date_to: "2026-10-17" },
      ignoredDates: false,
    });
  });

  it("drops an unknown status and an inverted date range", () => {
    const { query, ignoredDates } = returnListQuery({ filters: { status: "lost", date_from: "2026-10-17", date_to: "2026-10-01" }, page: 1, perPage: 20, sort: "date", dir: "desc" });
    expect(query).toEqual({ page: 1, per_page: 20, sort_by: "date", sort_direction: "desc" });
    expect(ignoredDates).toBe(true);
  });

  it("cleans the typed order number", () => {
    expect(orderNumberFilter(" ORD-٢٠٢٦ 0001 ")).toBe("ORD-20260001");
    expect(orderNumberFilter("")).toBeNull();
    expect(orderNumberFilter(undefined)).toBeNull();
  });
});

/* ---------------------------------------------------------------- module */

describe("returns module", () => {
  it("is its own module, off in the launch configuration", () => {
    expect(routeModule("/returns")).toBe("returns");
    expect(routeModule("/returns/abc")).toBe("returns");
    const launch = parseModules("catalog,stock,orders,settings,users");
    expect(isRouteEnabled("/returns", launch)).toBe(false);
    expect(visibleNav(["returns.view"], undefined, launch).map((entry) => entry.key)).not.toContain("returns");
    expect(visibleNav(["returns.view"], undefined, parseModules("returns")).map((entry) => entry.key)).toContain("returns");
    // And it needs returns.view to appear at all.
    expect(visibleNav([], undefined, parseModules("returns")).map((entry) => entry.key)).not.toContain("returns");
  });
});

/* -------------------------------------------------------------- messages */

type Status = components["schemas"]["Return"]["status"];
type EventType = components["schemas"]["ReturnEvent"]["type"];
type PostingRole = components["schemas"]["ReturnPosting"]["role"];
type ReasonCode = components["schemas"]["ReturnItem"]["reason_code"];

describe("returns messages", () => {
  const events: EventType[] = ["requested", "approved", "partially_approved", "rejected", "received", "inspected", "refunded"];
  const roles: PostingRole[] = ["restock_issue_cost", "write_down", "return_against_uncollected", "delivery_fee_refund", "refund_payment"];
  const reasons: ReasonCode[] = ["change_of_mind", "defect", "store_error", "wrong_item", "other"];
  const statuses: readonly Status[] = RETURN_STATUSES;

  for (const [locale, messages] of [["en", en], ["ar", ar]] as const) {
    it(`${locale}: every status, step, event, condition, reason, posting and refusal has words`, () => {
      const r = messages.returns as unknown as Record<string, Record<string, string>>;
      for (const status of statuses) expect(r.statuses[status], `statuses.${status}`).toBeTruthy();
      for (const step of RETURN_ACTIONS) {
        expect(r.steps[step], `steps.${step}`).toBeTruthy();
        expect((r.detail as unknown as Record<string, Record<string, string>>).done[step], `detail.done.${step}`).toBeTruthy();
      }
      for (const event of events) expect(r.events[event], `events.${event}`).toBeTruthy();
      for (const condition of RETURN_CONDITIONS) expect(r.conditions[condition], `conditions.${condition}`).toBeTruthy();
      for (const reason of reasons) expect(r.reasonCodes[reason], `reasonCodes.${reason}`).toBeTruthy();
      for (const role of roles) expect(r.postingRoles[role], `postingRoles.${role}`).toBeTruthy();
      for (const code of RETURN_REFUSAL_CODES) expect(r.refusals[code], `refusals.${code}`).toBeTruthy();
      for (const problem of ["required", "invalid", "negative", "whole", "precision", "exceeds"]) expect(r.quantity[problem], `quantity.${problem}`).toBeTruthy();
    });
  }

  it("has the same keys in both languages", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(keys(ar.returns).sort()).toEqual(keys(en.returns).sort());
  });
});
