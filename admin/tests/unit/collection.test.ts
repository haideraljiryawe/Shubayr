import { describe, expect, it } from "vitest";
import { CollectionOperation, previewCollection, staffDeliveryFields } from "@/lib/collection";

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
