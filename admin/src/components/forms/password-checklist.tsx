"use client";

import { useTranslations } from "next-intl";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/cn";
import { PASSWORD_RULES, passwordChecks } from "@/lib/password";

/**
 * The password policy as a live checklist, in the interface language: each
 * rule turns green with a tick as the typed password meets it. One component
 * for every place a password is chosen (own change, a temporary one).
 */
export function PasswordChecklist({ value, testId = "password-checklist" }: { value: string; testId?: string }) {
  const t = useTranslations("password");
  const checks = passwordChecks(value);
  return (
    <ul className="grid grid-cols-1 gap-1 text-caption sm:grid-cols-2" aria-label={t("rules")} data-testid={testId}>
      {PASSWORD_RULES.map((rule) => (
        <li
          key={rule}
          className={cn("flex items-center gap-1.5", checks[rule] ? "text-success-dark" : "text-text-muted")}
          data-rule={rule}
          data-met={String(checks[rule])}
        >
          {checks[rule] ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
          <span>
            {t(`rule.${rule}`)}
            <span className="sr-only"> — {checks[rule] ? t("ruleMet") : t("ruleNotMet")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
