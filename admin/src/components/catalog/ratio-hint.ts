"use client";

import { useTranslations } from "next-intl";
import type { CropTarget } from "@/lib/image-crop";

/**
 * The line that explains, next to every image upload, what shape the picture
 * is saved in and what the editor lets you change (VIS-021): square for
 * products, categories and brands; the banner's own 2:1 otherwise.
 */
export function useRatioHint(target: CropTarget): string {
  const t = useTranslations("imageEditor.ratio");
  return target.aspect === 1 ? t("square") : t("wide", { ratio: `${target.aspect}:1` });
}
