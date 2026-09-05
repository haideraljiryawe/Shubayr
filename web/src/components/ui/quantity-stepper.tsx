"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * «− 1 +» quantity control. Works uncontrolled (internal state) or controlled
 * (`value` + `onValueChange`). Bounds are clamped so the caller can pass the
 * product's available_qty straight in.
 */
export function QuantityStepper({
  value,
  defaultValue = 1,
  min = 1,
  max = 99,
  onValueChange,
  disabled = false,
  className,
}: {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  onValueChange?: (next: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("common");
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;

  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped === current) return;
    if (value === undefined) setInternal(clamped);
    onValueChange?.(clamped);
  };

  const stepClasses =
    "inline-flex size-8 items-center justify-center rounded-sm transition-colors " +
    "duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1",
        className,
      )}
    >
      <button
        type="button"
        aria-label={t("decrease")}
        disabled={disabled || current <= min}
        onClick={() => set(current - 1)}
        className={cn(stepClasses, "bg-card text-text hover:bg-border")}
      >
        <Minus className="size-4" aria-hidden />
      </button>

      <span
        aria-live="polite"
        aria-label={t("quantity")}
        className="min-w-8 text-center text-sm font-semibold tabular-nums text-text"
      >
        {current}
      </span>

      <button
        type="button"
        aria-label={t("increase")}
        disabled={disabled || current >= max}
        onClick={() => set(current + 1)}
        className={cn(
          stepClasses,
          "bg-primary text-on-primary hover:bg-primary-dark",
        )}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
