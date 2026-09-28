import { describe, expect, it } from "vitest";
import {
  STAFF_FILTER_KEYS,
  STAFF_SORT_KEYS,
  queryStaff,
  type StaffUser,
} from "@/lib/staff-query";
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

function staff(
  overrides: Partial<StaffUser> & { id: string; username: string },
): StaffUser {
  return {
    name: overrides.username,
    email: null,
    is_active: true,
    must_change_password: false,
    permission_version: 1,
    presets: [],
    extra_grants: [],
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("queryStaff", () => {
  const rows = [
    staff({
      id: "1",
      username: "admin",
      name: "Development Admin",
      presets: [{ id: "p-super", name: "super_admin" }],
    }),
    staff({
      id: "2",
      username: "catalog",
      name: "كاتالوج",
      email: "cat@example.com",
      presets: [{ id: "p-cat", name: "catalog_editor" }],
    }),
    staff({
      id: "3",
      username: "old.hand",
      name: "Old Hand",
      is_active: false,
      created_at: "2025-01-01T00:00:00.000Z",
    }),
    staff({
      id: "4",
      username: "newbie",
      name: "Newbie",
      must_change_password: true,
      created_at: "2026-09-27T00:00:00.000Z",
    }),
  ];
  const base = {
    q: "",
    page: 1,
    perPage: 20,
    sort: "name" as const,
    dir: "asc" as const,
    filters: {},
  };

  it("searches username, name and email, case-insensitively", () => {
    expect(
      queryStaff(rows, { ...base, q: "ADMIN" }).rows.map((row) => row.id),
    ).toEqual(["1"]);
    expect(
      queryStaff(rows, { ...base, q: "example.com" }).rows.map((row) => row.id),
    ).toEqual(["2"]);
    expect(
      queryStaff(rows, { ...base, q: "كاتا" }).rows.map((row) => row.id),
    ).toEqual(["2"]);
  });

  it("filters by status and preset", () => {
    expect(
      queryStaff(rows, { ...base, filters: { status: "inactive" } }).rows.map(
        (row) => row.id,
      ),
    ).toEqual(["3"]);
    expect(
      queryStaff(rows, {
        ...base,
        filters: { status: "must_change" },
      }).rows.map((row) => row.id),
    ).toEqual(["4"]);
    expect(
      queryStaff(rows, { ...base, filters: { status: "active" } }).total,
    ).toBe(3);
    expect(
      queryStaff(rows, { ...base, filters: { preset: "p-cat" } }).rows.map(
        (row) => row.id,
      ),
    ).toEqual(["2"]);
  });

  it("sorts both ways and pages without overlap", () => {
    const byDate = { ...base, sort: "created_at" as const };
    expect(queryStaff(rows, byDate).rows.map((row) => row.id)).toEqual([
      "3",
      "1",
      "2",
      "4",
    ]);
    expect(
      queryStaff(rows, { ...byDate, dir: "desc" }).rows.map((row) => row.id),
    ).toEqual(["4", "2", "1", "3"]);

    const first = queryStaff(rows, { ...base, perPage: 10, page: 1 });
    expect(first.total).toBe(4);
    const paged = [1, 2].flatMap(
      (page) => queryStaff(rows, { ...byDate, perPage: 2, page }).rows,
    );
    expect(paged.map((row) => row.id)).toEqual(["3", "1", "2", "4"]);
  });

  it("clamps a page past the end to the last page", () => {
    const result = queryStaff(rows, { ...base, perPage: 10, page: 7 });
    expect(result.page).toBe(1);
    expect(result.rows).toHaveLength(4);
  });
});
