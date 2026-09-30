import { describe, expect, it } from "vitest";
import { auditChanges, auditListQuery, storeDayEnd, storeDayStart } from "@/lib/audit";

const base = { q: "", page: 1, perPage: 20, sort: "created_at" as const, dir: "desc" as const, filters: {} };

describe("auditListQuery", () => {
  it("sends every filter the API understands, on the server", () => {
    const { query, invalidRange } = auditListQuery({
      ...base,
      page: 3,
      filters: {
        actor: " admin ",
        action: "order.reject",
        entity_type: "order",
        entity_id: "10000000-0000-4000-8000-000000000001",
        from: "2026-09-01",
        to: "2026-09-29",
      },
    });
    expect(invalidRange).toBe(false);
    expect(query).toEqual({
      page: 3,
      per_page: 20,
      actor: "admin",
      action: "order.reject",
      entity_type: "order",
      entity_id: "10000000-0000-4000-8000-000000000001",
      from: "2026-08-31T21:00:00.000Z",
      to: "2026-09-29T20:59:59.999Z",
    });
  });

  it("drops what the API would refuse, and flags an inverted range", () => {
    const { query, invalidRange } = auditListQuery({
      ...base,
      filters: { action: "DROP TABLE", entity_id: "abc", from: "2026-09-10", to: "2026-09-01" },
    });
    expect(invalidRange).toBe(true);
    expect(query).toEqual({ page: 1, per_page: 20 });
  });

  it("keeps an action it does not list yet (exact match on the API)", () => {
    expect(auditListQuery({ ...base, filters: { action: "future.thing" } }).query.action).toBe("future.thing");
  });
});

describe("store-day bounds", () => {
  it("covers the whole Baghdad day, inclusive", () => {
    expect(storeDayStart("2026-09-29")).toBe("2026-09-28T21:00:00.000Z");
    expect(storeDayEnd("2026-09-29")).toBe("2026-09-29T20:59:59.999Z");
  });
});

describe("auditChanges", () => {
  it("lists changed top-level fields, ignoring timestamps", () => {
    expect(
      auditChanges(
        { name: "Old", is_active: true, updated_at: "a" },
        { name: "New", is_active: true, updated_at: "b" },
      ),
    ).toEqual([{ field: "name", before: "Old", after: "New" }]);
  });

  it("handles creations, deletions and plain values", () => {
    expect(auditChanges(null, { status: "closed" })).toEqual([
      { field: "status", before: "—", after: "closed" },
    ]);
    expect(auditChanges("a", "b")).toEqual([{ field: "value", before: "a", after: "b" }]);
    expect(auditChanges(null, null)).toEqual([]);
    const long = auditChanges({}, { blob: "x".repeat(200) })[0].after;
    expect(long.length).toBe(78);
  });
});
