import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { permissionName, type Permission } from "@/lib/permissions";
import { safeReturnPath } from "@/lib/return-path";
import { exportPercent } from "@/components/reports/report-export";

describe("returning to the page you came from", () => {
  it("accepts this site's paths and refuses other sites, loops and control characters", () => {
    expect(safeReturnPath("/catalog/products?status=archived")).toBe("/catalog/products?status=archived");
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
    expect(safeReturnPath("/change-password?next=/")).toBe("/");
    expect(safeReturnPath("/login")).toBe("/");
    expect(safeReturnPath("/orders\n")).toBe("/");
    expect(safeReturnPath("nope", "/home")).toBe("/home");
  });
});

describe("a missing permission is named, not keyed (VIS-019)", () => {
  const registry: Permission[] = [
    { key: "returns.approve", group: "returns", description: null, name_ar: "الموافقة على المرتجعات", name_en: "Approve returns", description_ar: "", description_en: "" },
  ];
  it("uses the registry's name in the interface language, else the key", () => {
    expect(permissionName(registry, "returns.approve", "ar")).toBe("الموافقة على المرتجعات");
    expect(permissionName(registry, "returns.approve", "en")).toBe("Approve returns");
    expect(permissionName([], "returns.approve", "en")).toBe("returns.approve");
  });
});

describe("PDF export progress (VIS-020, 17.11.0)", () => {
  it("is a whole percentage of the rows, full once the file is ready, never over 100", () => {
    expect(exportPercent(null)).toBe(0);
    expect(exportPercent({ rows_done: 0, rows_total: 0, download_ready: false })).toBe(0);
    expect(exportPercent({ rows_done: 1, rows_total: 3, download_ready: false })).toBe(33);
    expect(exportPercent({ rows_done: 9, rows_total: 4, download_ready: false })).toBe(100);
    expect(exportPercent({ rows_done: 0, rows_total: 0, download_ready: true })).toBe(100);
  });
});

describe("A16 messages", () => {
  const keys = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
      : [prefix.slice(0, -1)];
  it("exist in both languages", () => {
    expect(keys(ar.products.delete).sort()).toEqual(keys(en.products.delete).sort());
    expect(keys(ar.permissions).sort()).toEqual(keys(en.permissions).sort());
    expect(keys(ar.password).sort()).toEqual(keys(en.password).sort());
    expect(keys(ar.reports.export).sort()).toEqual(keys(en.reports.export).sort());
  });
});
