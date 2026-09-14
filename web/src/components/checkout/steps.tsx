"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export const CHECKOUT_STEPS = ["address", "review", "done"] as const;
export type CheckoutStepKey = (typeof CHECKOUT_STEPS)[number];

const LABEL_KEY: Record<CheckoutStepKey, string> = {
  address: "stepAddress",
  review: "stepReview",
  done: "stepDone",
};

/**
 * Address → Review → Confirmation, with the current position announced for
 * screen readers rather than conveyed by colour alone.
 */
export function CheckoutSteps({ current }: { current: CheckoutStepKey }) {
  const t = useTranslations("checkout");
  const index = CHECKOUT_STEPS.indexOf(current);

  return (
    <nav aria-label={t("progress")} className="mb-6">
      <p className="sr-only" aria-live="polite">
        {t("stepOf", { current: index + 1, total: CHECKOUT_STEPS.length })} —{" "}
        {t(LABEL_KEY[current])}
      </p>

      <ol className="flex items-center gap-2 sm:gap-3">
        {CHECKOUT_STEPS.map((step, position) => {
          const done = position < index;
          const active = position === index;

          return (
            <li
              key={step}
              aria-current={active ? "step" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                  "text-sm font-bold transition-colors",
                  done
                    ? "bg-primary-dark text-on-primary"
                    : active
                      ? "bg-primary text-on-primary"
                      : "bg-card text-text-muted",
                )}
              >
                {done ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <span dir="ltr">{position + 1}</span>
                )}
              </span>

              <span
                className={cn(
                  "truncate text-xs font-medium sm:text-sm",
                  active || done ? "text-text" : "text-text-muted",
                )}
              >
                {t(LABEL_KEY[step])}
              </span>

              {position < CHECKOUT_STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    done ? "bg-primary-dark" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
