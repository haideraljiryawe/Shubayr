import { describe, expect, it } from "vitest";
import {
  STAFF_FILTER_KEYS,
  STAFF_SORT_KEYS,
  asPage,
  lastPage,
  presetListQuery,
  staffListQuery,
  workPhoneListQuery,
} from "@/lib/list-queries";
import { clampPage, paginate, parseTableParams } from "@/lib/table-params";

describe("parseTableParams", () => {
  const options = {
    sortKeys: STAFF_SORT_KEYS,
    defaultSort: "name" as const,
    filterKeys: STAFF_FILTER_KEYS,
  };

  it("falls back to safe defaults for anything unexpected", () => {
    expect(
      parseTableParams(
        {
          page: "-2",
          per_page: "7",
          sort: "password_hash",
          dir: "sideways",
          q: ["  ali ", "x"],
          status: "",
        },
        options,
      ),
    ).toEqual({
      q: "ali",
      page: 1,
      perPage: 20,
      sort: "name",
      dir: "asc",
      filters: {},
    });
  });

  it("accepts the values it knows", () => {
    expect(
      parseTableParams(
        {
          page: "3",
          per_page: "50",
          sort: "created_at",
          dir: "desc",
          status: "active",
        },
        options,
      ),
    ).toEqual({
      q: "",
      page: 3,
      perPage: 50,
      sort: "created_at",
      dir: "desc",
      filters: { status: "active" },
    });
  });

  it("clamps and slices pages", () => {
    expect(clampPage(9, 21, 10)).toBe(3);
    expect(clampPage(0, 0, 10)).toBe(1);
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });
});

describe("list queries — the table's URL state as API parameters", () => {
  const base = { q: "", page: 2, perPage: 50, sort: "name" as const, dir: "desc" as const, filters: {} };

  it("passes search, paging and sort straight through", () => {
    expect(staffListQuery({ ...base, q: "ahmed" })).toEqual({
      q: "ahmed", page: 2, per_page: 50, sort: "name", dir: "desc",
    });
    expect(staffListQuery(base)).not.toHaveProperty("q");
  });

  it("keeps only filter values the API accepts", () => {
    const preset = "10000000-0000-4000-8000-000000000001";
    expect(staffListQuery({ ...base, filters: { status: "must_change", preset } })).toMatchObject({
      status: "must_change",
      preset,
    });
    const junk = staffListQuery({ ...base, filters: { status: "sleeping", preset: "p-cat" } });
    expect(junk).not.toHaveProperty("status");
    expect(junk).not.toHaveProperty("preset");
    expect(presetListQuery({ ...base, filters: { kind: "custom" } })).toMatchObject({ kind: "custom" });
    expect(presetListQuery({ ...base, filters: { kind: "weird" } })).not.toHaveProperty("kind");
    expect(
      workPhoneListQuery({ ...base, sort: "phone", filters: { role: "order_monitor", status: "revoked" } }),
    ).toMatchObject({ role: "order_monitor", status: "revoked", sort: "phone" });
    expect(workPhoneListQuery({ ...base, filters: { role: "admin" } })).not.toHaveProperty("role");
  });

  it("reads the page envelope, and a bare array as one page", () => {
    expect(asPage({ data: [1, 2], total: 42, page: 3, per_page: 2 }, 20)).toEqual({
      rows: [1, 2], total: 42, page: 3, perPage: 2,
    });
    expect(asPage([1, 2, 3], 20)).toEqual({ rows: [1, 2, 3], total: 3, page: 1, perPage: 20 });
    expect(lastPage(41, 20)).toBe(3);
    expect(lastPage(0, 20)).toBe(1);
  });
});
