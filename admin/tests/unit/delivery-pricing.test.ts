import { describe, expect, it } from "vitest";
import {
  sortTiers,
  tierDiscount,
  tierFor,
  tierWarnings,
  totalWithFee,
  unservedGovernorates,
  zoneConflicts,
  type AdminGovernorate,
  type DiscountTier,
} from "@/lib/delivery-pricing";

const zone = (id: string, active = true) => ({ id, name_ar: `منطقة ${id}`, name_en: `Zone ${id}`, fee_iqd: 5000, is_active: active });
const governorate = (code: string, owner: ReturnType<typeof zone> | null, active = true): AdminGovernorate => ({
  id: `g-${code}`,
  code,
  name_ar: code,
  name_en: code,
  is_active: active,
  delivery_zone: owner,
});
const tier = (id: string, min: number, percent: number, active = true): DiscountTier => ({
  id,
  min_subtotal: min,
  percent,
  is_active: active,
  created_at: "2026-10-13T00:00:00Z",
  updated_at: "2026-10-13T00:00:00Z",
});

describe("delivery zones", () => {
  const baghdad = zone("a");
  const south = zone("b", false);
  const all = [
    governorate("BGD", baghdad),
    governorate("BSR", south),
    governorate("HAL", null),
    governorate("OLD", null, false),
  ];

  it("names the governorates customers cannot get delivery to, and why", () => {
    expect(unservedGovernorates(all).map(({ governorate, reason }) => [governorate.code, reason])).toEqual([
      ["BSR", "zoneInactive"],
      ["HAL", "noZone"],
    ]);
  });

  it("flags chosen governorates another zone holds — not the zone's own", () => {
    expect(zoneConflicts(["g-BGD", "g-HAL"], all, null).map(({ governorate, zone }) => [governorate.code, zone.id])).toEqual([["BGD", "a"]]);
    expect(zoneConflicts(["g-BGD", "g-HAL"], all, "a")).toEqual([]);
    expect(zoneConflicts(["g-BSR"], all, "a").map(({ zone }) => zone.id)).toEqual(["b"]);
  });
});

describe("discount tiers", () => {
  it("computes the discount in whole IQD, half away from zero, like the server", () => {
    expect(tierDiscount(150_000, 5)).toBe(7_500);
    expect(tierDiscount(99_999, 10)).toBe(10_000); // 9,999.9 → 10,000
    expect(tierDiscount(12_345, 2.5)).toBe(309); // 308.625 → 309
    expect(tierDiscount(10_002, 7.25)).toBe(725); // 725.145 → 725
    expect(tierDiscount(0, 50)).toBe(0);
  });

  it("picks the highest active tier the subtotal reaches", () => {
    const tiers = [tier("t3", 300_000, 10), tier("t1", 100_000, 3), tier("t2", 200_000, 7, false)];
    expect(sortTiers(tiers).map((entry) => entry.id)).toEqual(["t1", "t2", "t3"]);
    expect(tierFor(tiers, 99_999)).toBeNull();
    expect(tierFor(tiers, 250_000)?.id).toBe("t1"); // t2 is inactive
    expect(tierFor(tiers, 300_000)?.id).toBe("t3");
  });

  it("warns about a tier that is no better than a lower one", () => {
    const tiers = [tier("a", 100_000, 5), tier("b", 200_000, 5), tier("c", 300_000, 4), tier("d", 400_000, 8), tier("off", 500_000, 1, false)];
    expect([...tierWarnings(tiers)].sort()).toEqual(["b", "c"]);
  });
});

describe("delivery fee at confirmation", () => {
  it("swaps only the fee in the total — raised or lowered", () => {
    const order = { total: 14_000, delivery_fee: 5_000 };
    expect(totalWithFee(order, 7_000)).toBe(16_000);
    expect(totalWithFee(order, 2_000)).toBe(11_000);
    expect(totalWithFee(order, 0)).toBe(9_000);
  });
});
