"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Server-side pagination: the page number is the only client state. */
export function Pager({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("work");
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;

  return (
    <nav
      className="flex items-center justify-between gap-3"
      aria-label={t("pageOf", { page, pages })}
    >
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        data-testid="pager-prev"
        startIcon={<ChevronLeft className="size-4 rtl-flip" aria-hidden />}
      >
        {t("previous")}
      </Button>
      <span className="text-sm text-text-muted" data-testid="pager-label">
        {t("pageOf", { page, pages })}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        data-testid="pager-next"
        endIcon={<ChevronRight className="size-4 rtl-flip" aria-hidden />}
      >
        {t("next")}
      </Button>
    </nav>
  );
}
