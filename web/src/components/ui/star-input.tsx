"use client";

import { useId } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * The writable twin of `Rating`: five stars as a real radio group, so arrow
 * keys move between them, the whole group is one tab stop, and a screen reader
 * announces "3 of 5 stars" rather than "button".
 *
 * `dir="ltr"` because one-to-five stars read left-to-right in both locales —
 * the sheet shows them that way — while the labels around it stay RTL.
 */
export function StarInput({
  value,
  onValueChange,
  label,
  starLabel,
  error,
  name,
  className,
}: {
  value: number;
  onValueChange: (next: number) => void;
  /** Accessible name for the group as a whole. */
  label: string;
  /** Builds each star's label, e.g. «٣ من ٥ نجوم». */
  starLabel: (stars: number) => string;
  error?: string;
  name?: string;
  className?: string;
}) {
  const generated = useId();
  const groupName = name ?? generated;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-invalid={error ? true : undefined}
      dir="ltr"
      className={cn("inline-flex items-center gap-1", className)}
    >
      {STARS.map((star) => {
        const filled = star <= value;
        return (
          <label
            key={star}
            // The input itself is sr-only, so the label is what a pointer
            // actually hits — and what a test should click.
            data-testid={`${groupName}-star-${star}`}
            className="cursor-pointer p-0.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary rounded-sm"
          >
            <input
              type="radio"
              name={groupName}
              value={star}
              checked={value === star}
              onChange={() => onValueChange(star)}
              aria-label={starLabel(star)}
              className="sr-only"
            />
            <Star
              className={cn(
                "size-7 transition-colors",
                filled
                  ? "fill-accent text-accent"
                  : "fill-transparent text-border",
              )}
              aria-hidden
            />
          </label>
        );
      })}
    </div>
  );
}
