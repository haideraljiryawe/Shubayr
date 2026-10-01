"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import {
  isKnownUnit,
  minQuantity,
  parseQuantity,
  roundQuantity,
  type QuantityError,
  type QuantityRule,
} from "@/lib/quantity";

function display(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
    maximumFractionDigits: 3,
    useGrouping: false,
    numberingSystem: "latn",
  }).format(value);
}

/**
 * «− 1.5 كغم +» — a quantity the shopper can also type.
 *
 * The rule comes from the SKU: pieces take whole numbers, weight and volume
 * SKUs up to three decimals with their unit shown beside the number. What
 * was typed stays in the field while it is wrong, with the reason under it,
 * and `onValidityChange(false)` lets the page hold its CTA until it is fixed.
 * `max` caps the value (the sellable stock) but is never printed.
 */
export function QuantityInput({
  value,
  onValueChange,
  onValidityChange,
  rule,
  max,
  disabled = false,
  className,
}: {
  value: number;
  onValueChange: (next: number) => void;
  onValidityChange?: (valid: boolean) => void;
  rule: QuantityRule;
  max: number;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("quantity");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<QuantityError | null>(null);
  // Adopt a value that changed from outside (a clamp, a server reprice)
  // without an effect: the draft is only kept while it differs.
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    if (draft !== null && error === null) setDraft(null);
  }

  const min = minQuantity(rule);
  const unitLabel =
    rule.baseUnit === "piece"
      ? null
      : isKnownUnit(rule.baseUnit)
        ? t(`units.${rule.baseUnit}`)
        : rule.baseUnit;

  const commit = (next: number) => {
    setDraft(null);
    setError(null);
    onValidityChange?.(true);
    if (next !== value) onValueChange(next);
  };

  const step = (delta: number) => {
    const next = roundQuantity(Math.min(max, Math.max(min, value + delta)));
    commit(next);
  };

  const onType = (text: string) => {
    setDraft(text);
    const parsed = parseQuantity(text, rule, max);
    if (parsed.ok) {
      setError(null);
      onValidityChange?.(true);
      if (parsed.value !== value) onValueChange(parsed.value);
    } else {
      setError(parsed.error);
      onValidityChange?.(false);
    }
  };

  const stepClasses =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors " +
    "duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "inline-flex items-center gap-1 self-start rounded-md border bg-surface p-1",
          error ? "border-error-dark" : "border-border",
        )}
      >
        <button
          type="button"
          aria-label={tc("decrease")}
          disabled={disabled || value - 1 < min}
          onClick={() => step(-1)}
          className={cn(stepClasses, "bg-card text-text hover:bg-border")}
        >
          <Minus className="size-4" aria-hidden />
        </button>

        {/* Only the digits are isolated LTR; the unit follows the number in
            the reading direction — «1.5 كغم» in Arabic, "1.5 kg" in English. */}
        <span className="inline-flex items-baseline gap-1 px-1">
          <input
            type="text"
            dir="ltr"
            inputMode={rule.wholeUnitsOnly ? "numeric" : "decimal"}
            autoComplete="off"
            aria-label={tc("quantity")}
            aria-invalid={error ? true : undefined}
            data-testid="quantity-input"
            data-unit={rule.baseUnit}
            disabled={disabled}
            value={draft ?? display(value, locale)}
            onChange={(event) => onType(event.target.value)}
            onBlur={() => {
              // A valid draft is normalised on leaving ("01.50" → "1.5"); an
              // invalid one stays so its message still explains it.
              if (error === null) setDraft(null);
            }}
            className={cn(
              "w-14 bg-transparent text-center text-sm font-semibold tabular-nums text-text",
              "focus:outline-none",
            )}
          />
          {unitLabel ? (
            <span
              className="text-xs font-medium text-text-muted"
              data-testid="quantity-unit"
            >
              {unitLabel}
            </span>
          ) : null}
        </span>

        <button
          type="button"
          aria-label={tc("increase")}
          disabled={disabled || value + 1 > max}
          onClick={() => step(1)}
          className={cn(
            stepClasses,
            "bg-primary text-on-primary hover:bg-primary-dark",
          )}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          data-testid="quantity-error"
          data-error={error}
          className="text-xs font-medium text-error-dark"
        >
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
