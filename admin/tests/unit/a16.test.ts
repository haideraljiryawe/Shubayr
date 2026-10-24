import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { ApiError } from "@/lib/api/errors";
import { permissionName, type Permission } from "@/lib/permissions";
import { DELETE_REASONS, deleteEach, deleteSummary } from "@/lib/product-delete";
import { safeReturnPath } from "@/lib/return-path";

describe("product delete (17.10.0)", () => {
  it("reports what the server did per product: deleted, archived with its reasons, or failed", async () => {
    const answers: Record<string, unknown> = {
      a: { outcome: "deleted", reasons: [] },
      b: { outcome: "archived", reasons: ["purchase_history", "order_history"] },
      c: new ApiError(403, "x", "FORBIDDEN"),
      d: { outcome: "archived", reasons: ["order_history"] },
    };
    const calls: string[] = [];
    const summary = await deleteEach(
      ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() })),
      async (id) => {
        calls.push(id);
        const answer = answers[id];
        if (answer instanceof Error) throw answer;
        return answer as never;
      },
      () => "Not allowed",
    );
    // One at a time, in order, and a failure doesn't stop the rest.
    expect(calls).toEqual(["a", "b", "c", "d"]);
    expect(summary).toMatchObject({ deleted: 1, archived: 2, failed: 1, reasons: ["order_history", "purchase_history"] });
    expect(summary.lines.map((line) => `${line.id}:${line.outcome}`)).toEqual(["c:failed", "b:archived", "d:archived", "a:deleted"]);
    expect(summary.lines[0].message).toBe("Not allowed");
    expect(deleteSummary([])).toEqual({ deleted: 0, archived: 0, failed: 0, reasons: [], lines: [] });
  });

  it("words every archive reason in both languages", () => {
    for (const reason of DELETE_REASONS) {
      expect(en.products.delete.reasons[reason], reason).toBeTruthy();
      expect(ar.products.delete.reasons[reason], reason).toBeTruthy();
    }
  });
});

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

describe("A16 messages", () => {
  const keys = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
      : [prefix.slice(0, -1)];
  it("exist in both languages", () => {
    expect(keys(ar.products.delete).sort()).toEqual(keys(en.products.delete).sort());
    expect(keys(ar.permissions).sort()).toEqual(keys(en.permissions).sort());
    expect(keys(ar.password).sort()).toEqual(keys(en.password).sort());
  });
});
