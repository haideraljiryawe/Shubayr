"use client";

import { useTranslations } from "next-intl";
import { BASE_UNITS } from "@/lib/catalog";

type BaseUnit = (typeof BASE_UNITS)[number];

/**
 * A SKU's base unit in the reader's language: "piece" → «قطعة», "kg" →
 * «كيلوغرام». A unit outside the editor's list is shown as stored.
 */
export function useUnitName(): (unit: string | null | undefined) => string {
  const t = useTranslations("products.units");
  return (unit) => {
    const value = unit?.trim() || "piece";
    return (BASE_UNITS as readonly string[]).includes(value) ? t(value as BaseUnit) : value;
  };
}
