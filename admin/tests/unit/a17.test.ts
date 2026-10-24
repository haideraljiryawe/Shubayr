import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { ApiError } from "@/lib/api/errors";
import {
  BULK_LIMIT,
  BulkDeleteError,
  DELETE_REASONS,
  applyBulk,
  bulkLines,
  chunk,
  deleteSummary,
  planBulk,
  previewSummary,
  reasonKey,
  renewBatch,
} from "@/lib/product-delete";
import { roleLabel } from "@/lib/role-label";

const ids = (count: number) => Array.from({ length: count }, (_, at) => `p${at}`);
const counter = () => {
  let next = 0;
  return () => `op-${(next += 1)}`;
};

describe("delete reasons in words (17.12.0)", () => {
  it("words every reason in both languages, in plain Arabic", () => {
    for (const reason of DELETE_REASONS) {
      expect(en.products.delete.reasons[reason], reason).toBeTruthy();
      expect(ar.products.delete.reasons[reason], reason).toBeTruthy();
    }
    expect(ar.products.delete.reasons.order_history).toBe("يوجد في طلبات سابقة");
    expect(ar.products.delete.reasons.banner_action).toBe("مرتبط بإعلان (بانر)");
    expect(ar.products.delete.reasons.product_not_found).toBe("المنتج غير موجود");
  });

  it("reads a reason it doesn't know yet as the generic one, never as the raw key", () => {
    expect(reasonKey("inventory_history")).toBe("inventory_history");
    expect(reasonKey("gift_card_history")).toBe("unknown");
    expect(en.products.delete.reasons.unknown).not.toContain("_");
    expect(ar.products.delete.reasons.unknown).toBeTruthy();
  });

  it("summarises results: known reasons in the API's order, unknown ones last, failures first", () => {
    const summary = deleteSummary([
      { id: "a", name: "A", outcome: "deleted", reasons: [] },
      { id: "b", name: "B", outcome: "archived", reasons: ["future_reason", "purchase_history", "order_history"] },
      { id: "c", name: "C", outcome: "failed", reasons: ["product_not_found"] },
    ]);
    expect(summary).toMatchObject({ deleted: 1, archived: 1, failed: 1, reasons: ["order_history", "purchase_history", "future_reason"] });
    expect(summary.lines.map((line) => line.id)).toEqual(["c", "b", "a"]);
  });
});

describe("the bulk preview", () => {
  it("groups the selection by what will happen; a product the API didn't answer for can't be processed", () => {
    const products = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
      { id: "d", name: "D" },
    ];
    const summary = previewSummary(products, [
      { id: "a", outcome: "delete", reasons: [] },
      { id: "b", outcome: "archive", reasons: ["inventory_history", "order_history"] },
      { id: "c", outcome: "failed", reasons: ["product_not_found"] },
    ]);
    expect(summary.delete.map((line) => line.id)).toEqual(["a"]);
    expect(summary.archive).toEqual([{ id: "b", name: "B", outcome: "archive", reasons: ["order_history", "inventory_history"] }]);
    expect(summary.failed.map((line) => `${line.id}:${line.reasons.join()}`)).toEqual(["c:product_not_found", "d:product_not_found"]);
  });
});

describe("bulk delete batches and operation ids", () => {
  it("splits more than 500 into batches of 500, each with its own operation id", () => {
    expect(chunk(ids(1001)).map((part) => part.length)).toEqual([500, 500, 1]);
    const plan = planBulk(ids(1001), counter());
    expect(BULK_LIMIT).toBe(500);
    expect(plan.map((batch) => [batch.operation_id, batch.ids.length])).toEqual([["op-1", 500], ["op-2", 500], ["op-3", 1]]);
    expect(planBulk(ids(3), counter())).toHaveLength(1);
    expect(planBulk([], counter())).toEqual([]);
  });

  it("makes operation ids the API accepts (8–128 characters)", () => {
    const [batch] = planBulk(ids(1));
    expect(batch.operation_id.length).toBeGreaterThanOrEqual(8);
    expect(batch.operation_id.length).toBeLessThanOrEqual(128);
  });

  it("on a lost connection keeps the answered batches; the retry resends only the rest, with the same id", async () => {
    const plan = planBulk(ids(700), counter());
    const sent: string[] = [];
    let fail = true;
    const call = async (batch: { operation_id: string; ids: string[] }) => {
      sent.push(batch.operation_id);
      if (batch.operation_id === "op-2" && fail) {
        fail = false;
        throw new TypeError("Failed to fetch");
      }
      return { operation_id: batch.operation_id, results: batch.ids.map((id) => ({ id, outcome: "deleted" as const, reasons: [] })) };
    };
    const error = await applyBulk(plan, call).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BulkDeleteError);
    const interrupted = error as BulkDeleteError;
    expect(interrupted.index).toBe(1);
    expect(interrupted.batches[0].results).toHaveLength(500);
    const done = await applyBulk(interrupted.batches, call);
    expect(sent).toEqual(["op-1", "op-2", "op-2"]);
    expect(bulkLines(done, new Map([["p0", "First"]]))).toHaveLength(700);
    expect(bulkLines(done, new Map([["p0", "First"]]))[0]).toMatchObject({ id: "p0", name: "First", outcome: "deleted" });
  });

  it("after a 409 sends the same products under a new operation id", async () => {
    const plan = planBulk(ids(2), counter());
    const error = (await applyBulk(plan, async () => {
      throw new ApiError(409, "Conflict", "CONFLICT");
    }).catch((cause: unknown) => cause)) as BulkDeleteError;
    const renewed = renewBatch(error.batches, error.index, () => "op-fresh");
    expect(renewed).toEqual([{ operation_id: "op-fresh", ids: ["p0", "p1"] }]);
  });
});

describe("the role under the name", () => {
  const presets = [
    { id: "1", name: "store_manager", name_ar: "مدير المتجر", name_en: "Store manager" },
    { id: "2", name: "accountant", name_ar: "محاسب", name_en: "Accountant" },
  ];
  it("names the presets in the interface language, listed the way that language lists", () => {
    expect(roleLabel(presets, "ar")).toBe("مدير المتجر، محاسب");
    expect(roleLabel(presets, "en")).toBe("Store manager, Accountant");
    expect(roleLabel(presets.slice(0, 1), "en")).toBe("Store manager");
  });
  it("falls back to the stored name, skips repeats, and shows nothing without presets", () => {
    expect(roleLabel([{ id: "3", name: "night_shift", name_ar: " ", name_en: "" }], "ar")).toBe("night_shift");
    expect(roleLabel([...presets, { ...presets[0], id: "4" }], "en")).toBe("Store manager, Accountant");
    expect(roleLabel([], "ar")).toBeNull();
    expect(roleLabel(undefined, "en")).toBeNull();
  });
});

describe("A17 messages", () => {
  const keys = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
      : [prefix.slice(0, -1)];
  it("exist in both languages", () => {
    expect(keys(ar.products.delete).sort()).toEqual(keys(en.products.delete).sort());
  });
});
