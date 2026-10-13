import type { components } from "@/types/api";

/* ---------------------------------------------------------------------------
 * Delivery zones, governorates and automatic discount tiers (API 15.0),
 * kept pure so the rules are unit-tested.
 *
 * - Each governorate belongs to at most one zone; checkout charges that
 *   zone's fee while the zone is active. A governorate with no zone, or in an
 *   inactive zone, is not served: the store says so at checkout.
 * - The API refuses a zone that would take a governorate another zone holds
 *   (409 GOVERNORATE_ALREADY_IN_DELIVERY_ZONE) without saying which; the
 *   screen works that out from the governorates it already has.
 * - The highest active tier the goods subtotal reaches applies, as a whole-IQD
 *   amount rounded half away from zero — the server's own arithmetic, so the
 *   example shown is the discount a customer gets.
 * ------------------------------------------------------------------------- */

export type DeliveryZone = components["schemas"]["DeliveryZone"];
export type AdminGovernorate = components["schemas"]["AdminGovernorate"];
export type DiscountTier = components["schemas"]["DiscountTier"];

export function localName(item: { name_ar: string; name_en: string }, locale: string): string {
  return (locale === "ar" ? item.name_ar : item.name_en) || item.name_ar || item.name_en;
}

/** Governorates customers cannot get delivery to, and why. */
export type UnservedReason = "noZone" | "zoneInactive";

export function unservedGovernorates(
  governorates: readonly AdminGovernorate[],
): Array<{ governorate: AdminGovernorate; reason: UnservedReason }> {
  return governorates
    .filter((governorate) => governorate.is_active)
    .flatMap((governorate): Array<{ governorate: AdminGovernorate; reason: UnservedReason }> =>
      !governorate.delivery_zone
        ? [{ governorate, reason: "noZone" }]
        : !governorate.delivery_zone.is_active
          ? [{ governorate, reason: "zoneInactive" }]
          : [],
    );
}

/**
 * The chosen governorates another zone already holds — what the API would
 * refuse — with the zone each one is in. `zoneId` is the zone being edited
 * (null for a new one): its own governorates are no conflict.
 */
export function zoneConflicts(
  selected: readonly string[],
  governorates: readonly AdminGovernorate[],
  zoneId: string | null,
): Array<{ governorate: AdminGovernorate; zone: NonNullable<AdminGovernorate["delivery_zone"]> }> {
  const chosen = new Set(selected);
  return governorates.flatMap((governorate) =>
    chosen.has(governorate.id) && governorate.delivery_zone && governorate.delivery_zone.id !== zoneId
      ? [{ governorate, zone: governorate.delivery_zone }]
      : [],
  );
}

/** Zones in a stable reading order: active first, then by Arabic name. */
export function sortZones(zones: readonly DeliveryZone[]): DeliveryZone[] {
  return [...zones].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active) || a.name_ar.localeCompare(b.name_ar, "ar"),
  );
}

/* ------------------------------------------------------------ tiers */

/** A percent with at most two decimals as hundredths: "7.5" → 750. */
function hundredths(percent: number | string): bigint {
  const text = String(percent).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 0n;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

/** The tier discount on a goods subtotal: whole IQD, half away from zero. */
export function tierDiscount(subtotalIqd: number, percent: number | string): number {
  const subtotal = BigInt(Math.max(0, Math.trunc(subtotalIqd)));
  const product = subtotal * hundredths(percent);
  const quotient = product / 10_000n;
  const remainder = product % 10_000n;
  return Number(remainder * 2n >= 10_000n ? quotient + 1n : quotient);
}

/** Tiers from the lowest threshold up. */
export function sortTiers(tiers: readonly DiscountTier[]): DiscountTier[] {
  return [...tiers].sort((a, b) => Number(a.min_subtotal) - Number(b.min_subtotal));
}

/** The tier a subtotal earns: the highest active threshold it reaches. */
export function tierFor(tiers: readonly DiscountTier[], subtotalIqd: number): DiscountTier | null {
  return (
    sortTiers(tiers)
      .filter((tier) => tier.is_active && Number(tier.min_subtotal) <= subtotalIqd)
      .at(-1) ?? null
  );
}

/**
 * A tier whose percent is no better than a lower tier's never helps anyone:
 * customers who spend more would get the same or less. Flagged, not refused —
 * the owner may be mid-way through reworking the tiers.
 */
export function tierWarnings(tiers: readonly DiscountTier[]): Set<string> {
  const flagged = new Set<string>();
  let best = 0n;
  for (const tier of sortTiers(tiers).filter((entry) => entry.is_active)) {
    const value = hundredths(tier.percent);
    if (value <= best) flagged.add(tier.id);
    best = value > best ? value : best;
  }
  return flagged;
}

/* ------------------------------------------------------------ confirmation fee */

/**
 * The order's total once its delivery fee changes at confirmation: the goods,
 * discount and everything else stay; only the fee is swapped.
 */
export function totalWithFee(order: { total?: number; delivery_fee?: number }, newFee: number): number {
  const total = Math.trunc(Number(order.total ?? 0));
  const oldFee = Math.trunc(Number(order.delivery_fee ?? 0));
  return Math.max(0, total - oldFee + Math.trunc(newFee));
}
