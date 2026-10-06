import { describe, expect, it } from "vitest";
import { amountFilter, CollectionOperation, collectionListQuery, previewCollection, RESULT_STATUS, staffDeliveryFields } from "@/lib/collection";

describe("previewCollection", () => {
  it("says full, short (by how much) or over before confirming", () => {
    expect(previewCollection(25000, "confirmed", "25000")).toEqual({ state: "full" });
    expect(previewCollection(25000, "confirmed", "20000")).toEqual({ state: "short", shortfall: 5000 });
    expect(previewCollection(25000, "confirmed", "25001")).toEqual({ state: "over" });
    expect(previewCollection(25000, "unconfirmed", null)).toEqual({ state: "unconfirmed" });
    expect(previewCollection(25000, "confirmed", null)).toEqual({ state: "invalid" });
  });

  it("compares exactly, not in floating point", () => {
    expect(previewCollection(0.3, "confirmed", "0.3")).toEqual({ state: "full" });
    expect(previewCollection(10.1, "confirmed", "10.000001")).toEqual({ state: "short", shortfall: 0.099999 });
  });
});

describe("CollectionOperation", () => {
  it("reuses the id for the same request and makes a new one for a different request", () => {
    let next = 0;
    const operation = new CollectionOperation("admin-delivery", () => `id${++next}`);
    const first = operation.id("confirmed", "25000");
    expect(first).toBe("admin-delivery-id1");
    // A retry or double click: the same id, so the server replays.
    expect(operation.id("confirmed", "25000")).toBe(first);
    // A different amount: a new id (the API refuses one id with two bodies).
    expect(operation.id("confirmed", "20000")).toBe("admin-delivery-id2");
    expect(operation.id("unconfirmed", null)).toBe("admin-delivery-id3");
  });
});

describe("staffDeliveryFields", () => {
  it("sends the amount only when confirmed, and always the source", () => {
    const operation = new CollectionOperation("admin-delivery", () => "x");
    expect(staffDeliveryFields(operation, "confirmed", "25000")).toEqual({
      operation_id: "admin-delivery-x",
      collection_confirmation: "confirmed",
      collected_amount: "25000",
      source: "web_admin",
    });
    expect(staffDeliveryFields(new CollectionOperation("admin-delivery", () => "y"), "unconfirmed", "25000")).toEqual({
      operation_id: "admin-delivery-y",
      collection_confirmation: "unconfirmed",
      source: "web_admin",
    });
  });
});

describe("collection list filters (13.1)", () => {
  const PARTY = "11111111-1111-4111-8111-111111111111";
  const ORDER = "22222222-2222-4222-8222-222222222222";

  it("sends every filter it understands, as the API's parameters", () => {
    expect(
      collectionListQuery(
        { status: "confirmed_short", order_id: ORDER, party_id: PARTY, date_from: "2026-10-01", date_to: "2026-10-06", amount_min: "10,000", amount_max: "50000.5" },
        2,
        50,
      ),
    ).toEqual({
      query: { page: 2, per_page: 50, status: "confirmed_short", order_id: ORDER, party_id: PARTY, date_from: "2026-10-01", date_to: "2026-10-06", amount_min: 10000, amount_max: 50000.5 },
      ignored: [],
    });
  });

  it("drops malformed values instead of sending them", () => {
    expect(
      collectionListQuery({ status: "paid", order_id: "sb-1", party_id: "x", date_from: "06/10/2026", amount_min: "-5", amount_max: "lots" }, 1, 20),
    ).toEqual({ query: { page: 1, per_page: 20 }, ignored: [] });
  });

  it("does not send an inverted range (the API refuses it) and says which one", () => {
    expect(collectionListQuery({ date_from: "2026-10-06", date_to: "2026-10-01", amount_min: "100", amount_max: "50" }, 1, 20)).toEqual({
      query: { page: 1, per_page: 20 },
      ignored: ["dates", "amounts"],
    });
    // One side alone, or equal ends, is a range.
    expect(collectionListQuery({ date_from: "2026-10-06", date_to: "2026-10-06", amount_min: "0" }, 1, 20).query).toEqual({
      page: 1,
      per_page: 20,
      date_from: "2026-10-06",
      date_to: "2026-10-06",
      amount_min: 0,
    });
  });

  it("reads typed amounts with thousands separators", () => {
    expect(amountFilter("25,000")).toBe(25000);
    expect(amountFilter("25٬000")).toBe(25000);
    expect(amountFilter(" 7 ")).toBe(7);
    expect(amountFilter("1.1234567")).toBeUndefined();
    expect(amountFilter("")).toBeUndefined();
    expect(amountFilter(undefined)).toBeUndefined();
  });

  it("names the order read's result in the collection list's words", () => {
    expect(RESULT_STATUS).toEqual({ full: "confirmed_full", short: "confirmed_short", unconfirmed: "unconfirmed" });
  });
});
