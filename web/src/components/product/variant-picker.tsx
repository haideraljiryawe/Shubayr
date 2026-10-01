"use client";

import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import type { ProductVariant } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  attributeLabel,
  findVariant,
  type AttributeGroup,
} from "@/lib/product";

/**
 * Attribute selectors. Colour renders as a swatch (matching the design sheet's
 * «اللون» row); every other attribute renders as a labelled chip, so an
 * attribute the backend adds later still appears rather than vanishing.
 *
 * Values whose variant has no stock stay selectable but are marked
 * unavailable — hiding them would make the product look narrower than it is,
 * and the purchase panel already blocks the CTA.
 */
export function VariantPicker({
  groups,
  variants,
  selection,
  soldOutFor,
  onSelect,
}: {
  groups: AttributeGroup[];
  variants: ProductVariant[];
  selection: Record<string, string>;
  /** True when the variant a candidate value would produce is sold out. */
  soldOutFor: (selection: Record<string, string>) => boolean;
  onSelect: (key: string, value: string) => void;
}) {
  const t = useTranslations("product");
  const locale = useLocale() as Locale;

  if (groups.length === 0) return null;

  // Known keys get a translated label; anything else falls back to the raw key.
  const groupLabel = (key: string) =>
    key === "color" ? t("color") : key === "size" ? t("size") : key;

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => {
        const selected = selection[group.key];

        return (
          <fieldset key={group.key} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-text">
              {groupLabel(group.key)}
              {selected ? (
                <span className="ms-2 text-text-muted">
                  {attributeLabel(variants, group.key, selected, locale)}
                </span>
              ) : null}
            </legend>

            <div className="flex flex-wrap items-center gap-2.5">
              {group.values.map((value) => {
                const candidate = { ...selection, [group.key]: value.value };
                const soldOut =
                  Boolean(findVariant(variants, candidate)) &&
                  soldOutFor(candidate);
                const isSelected = selected === value.value;
                const label = attributeLabel(
                  variants,
                  group.key,
                  value.value,
                  locale,
                );

                if (group.key === "color" && value.hex) {
                  return (
                    <button
                      key={value.value}
                      type="button"
                      onClick={() => onSelect(group.key, value.value)}
                      aria-pressed={isSelected}
                      aria-label={
                        soldOut
                          ? `${label} — ${t("outOfStockLabel")}`
                          : label
                      }
                      title={label}
                      className={cn(
                        "relative inline-flex size-10 items-center justify-center rounded-full",
                        "ring-offset-2 ring-offset-surface transition",
                        isSelected
                          ? "ring-2 ring-primary-dark"
                          : "ring-1 ring-border hover:ring-primary-light",
                        soldOut && "opacity-40",
                      )}
                    >
                      <span
                        className="size-8 rounded-full border border-black/10"
                        style={{ backgroundColor: value.hex }}
                        aria-hidden
                      />
                      {isSelected ? (
                        <Check
                          className="absolute size-4 text-white mix-blend-difference"
                          strokeWidth={3}
                          aria-hidden
                        />
                      ) : null}
                      {soldOut ? (
                        <span
                          className="absolute inset-0 rounded-full border-t-2 border-error-dark/70"
                          style={{ transform: "rotate(-45deg)" }}
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  );
                }

                return (
                  <button
                    key={value.value}
                    type="button"
                    onClick={() => onSelect(group.key, value.value)}
                    aria-pressed={isSelected}
                    aria-label={
                      soldOut ? `${label} — ${t("outOfStockLabel")}` : label
                    }
                    className={cn(
                      "inline-flex h-10 min-w-12 items-center justify-center rounded-md px-3",
                      "border text-sm font-medium transition-colors",
                      isSelected
                        ? "border-primary-dark bg-primary-dark text-on-primary"
                        : "border-border bg-surface text-text hover:border-primary-light",
                      soldOut && "opacity-40 line-through",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
