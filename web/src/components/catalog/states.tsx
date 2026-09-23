"use client";

import { useTranslations } from "next-intl";
import { PackageSearch, RefreshCw, TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, buttonClasses } from "@/components/ui/button";

export function CatalogError({ retry }: { retry?: () => void }) {
  const t = useTranslations("catalog");
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface px-5 py-12 text-center"
    >
      <TriangleAlert className="mx-auto size-9 text-error-dark" aria-hidden />
      <h2 className="mt-4 text-lg font-bold">{t("errorTitle")}</h2>
      <p className="mt-2 text-sm text-text-muted">{t("errorBody")}</p>
      <Button
        variant="secondary"
        className="mt-5"
        onClick={() => (retry ? retry() : window.location.reload())}
        startIcon={<RefreshCw className="size-4" aria-hidden />}
      >
        {t("retry")}
      </Button>
    </div>
  );
}

export function CatalogEmpty({ resetHref }: { resetHref: string }) {
  const t = useTranslations("catalog");
  return (
    <div
      className="rounded-lg border border-border bg-surface px-5 py-14 text-center"
      role="status"
    >
      <PackageSearch
        className="mx-auto size-12 text-primary-dark"
        aria-hidden
      />
      <h2 className="mt-4 text-xl font-bold">{t("emptyTitle")}</h2>
      <p className="mt-2 text-sm text-text-muted">{t("emptyBody")}</p>
      <Link
        href={resetHref}
        className={buttonClasses({ variant: "cta", className: "mt-6" })}
      >
        {t("reset")}
      </Link>
    </div>
  );
}

export function CatalogSkeleton() {
  const t = useTranslations("catalog");
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-6 lg:px-8"
      role="status"
      aria-label={t("loading")}
    >
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden className="motion-safe:animate-pulse">
        <div className="mb-6 h-8 w-40 rounded-md bg-border" />
        <div className="mb-5 h-11 rounded-md bg-card" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="rounded-md bg-surface p-2">
              <div className="aspect-square rounded-md bg-card" />
              <div className="mt-3 h-4 w-3/4 rounded bg-border" />
              <div className="mt-3 h-4 w-1/2 rounded bg-card" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
