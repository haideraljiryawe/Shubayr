"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { editorialAdvice, type Guide } from "@/lib/editorial";

/**
 * Soft length guidance under a text field: the suggested size, the current
 * count in user-perceived characters, and — past the suggestion — a warning
 * that small screens may cut the text with "…". It never blocks saving and
 * never shortens what was typed.
 */
export function EditorialHint({ text, guide, testId }: { text: string; guide: Guide; testId?: string }) {
  const t = useTranslations("editorial");
  const advice = editorialAdvice(text, guide);
  return (
    <span className="flex flex-col gap-0.5" data-testid={testId} data-long={advice.long ? "true" : "false"} data-chars={advice.chars}>
      <span>
        {t("suggestion", { min: guide.words[0], max: guide.words[1], chars: guide.chars })}{" "}
        <span dir="ltr" className="tabular-nums">
          ({advice.chars}/{guide.chars})
        </span>
      </span>
      {advice.long ? (
        <span className="flex items-center gap-1 font-semibold text-warning-dark" data-testid={testId ? `${testId}-warning` : undefined}>
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {t("mayBeShortened")}
        </span>
      ) : null}
    </span>
  );
}
