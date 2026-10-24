"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronDown, Circle, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { FirstDayStep } from "@/lib/first-day";
import { useStoredPreference } from "@/lib/stored-preference";

const HIDDEN_KEY = "shubayr.admin.setup.hidden";

/**
 * Store setup as one compact strip (VIS-003): "4 of 6 completed", the next
 * step, and the steps on demand. Each step's state is the API's, never
 * stored here. Once every required step is done the strip says so and can be
 * hidden on this browser.
 */
export function SetupStrip({ steps, complete }: { steps: FirstDayStep[]; complete: boolean }) {
  const t = useTranslations("dashboard.firstDay");
  const tSetup = useTranslations("dashboard.setup");
  const [expanded, setExpanded] = useState(false);
  // "pending" until this browser's choice is read, so a hidden strip never flashes.
  const [hiddenPreference, setHiddenPreference] = useStoredPreference(HIDDEN_KEY, "pending");
  if (complete && hiddenPreference !== "") return null;

  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done && !step.optional) ?? steps.find((step) => !step.done);
  const listId = "setup-steps";

  return (
    <section
      className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm"
      aria-labelledby="setup-title"
      data-testid="first-day"
      data-complete={complete}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="setup-title" className="text-label text-text">
            {complete ? tSetup("complete") : t("title")}
          </h2>
          <span className="text-caption text-text-muted" data-testid="setup-progress">
            {tSetup("progress", { done, total: steps.length })}
          </span>
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-card"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
            aria-label={tSetup("progress", { done, total: steps.length })}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} />
          </div>
          {next ? (
            <Link href={next.href} className="text-caption font-semibold text-primary-dark hover:underline" data-testid="setup-next">
              {tSetup("next", { step: t(`steps.${next.key}.title`) })}
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
            data-testid="setup-toggle"
          >
            {expanded ? tSetup("hideSteps") : tSetup("showSteps")}
            <ChevronDown className={cn("size-4 transition-transform", expanded ? "rotate-180" : "")} aria-hidden />
          </Button>
          {complete ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHiddenPreference("1")}
              data-testid="setup-hide"
            >
              {tSetup("dismiss")}
            </Button>
          ) : null}
        </div>
      </div>
      <ol id={listId} hidden={!expanded} className="mt-3 flex flex-col gap-1.5">
        {steps.map((step, index) => (
          <li key={step.key} data-testid={`first-day-${step.key}`} data-done={step.done}>
            <Link
              href={step.href}
              className="flex items-start gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-card"
            >
              {step.done ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-dark" aria-hidden />
              ) : step.blockedBy ? (
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-dark" aria-hidden />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-text-muted" aria-hidden />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="text-label text-text">
                  {t("stepNumber", { number: index + 1 })} {t(`steps.${step.key}.title`)}
                  {step.optional ? <span className="ms-2 text-caption font-normal text-text-muted">{t("optional")}</span> : null}
                  {step.done ? <span className="sr-only"> — {t("done")}</span> : null}
                </span>
                <span className="text-caption text-text-muted">
                  {step.blockedBy ? t("needsLocation") : t(`steps.${step.key}.body`)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
