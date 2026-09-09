"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Clock, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

/** Placeholder rows while an account section loads. */
export function AccountSkeleton({ rows = 3 }: { rows?: number }) {
  const t = useTranslations("account");

  return (
    <Card
      padding="md"
      role="status"
      aria-label={t("loading")}
      className="motion-safe:animate-pulse"
    >
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden className="flex flex-col gap-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="size-12 shrink-0 rounded-md bg-card" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-card" />
              <div className="h-3 w-1/2 rounded bg-card" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AccountError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("account");

  return (
    <Card padding="lg" className="text-center" role="alert">
      <TriangleAlert className="mx-auto size-9 text-error-dark" aria-hidden />
      <p className="mt-3 font-medium text-text">{message ?? t("loadError")}</p>
      {onRetry ? (
        <Button
          variant="secondary"
          className="mt-4"
          onClick={onRetry}
          data-testid="account-retry"
          startIcon={<RefreshCw className="size-4" aria-hidden />}
        >
          {t("retry")}
        </Button>
      ) : null}
    </Card>
  );
}

export function AccountEmpty({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card padding="lg" className="text-center" role="status">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary-dark">
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-bold text-text">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}

/**
 * The «قريبًا» section, used by every account row this phase does not build.
 * A real route with a real menu entry beats a dead link.
 */
export function ComingSoon({ label }: { label: string }) {
  const t = useTranslations("account");

  return (
    <Card padding="lg" className="text-center" data-testid="account-soon">
      <Clock className="mx-auto size-10 text-primary-dark" aria-hidden />
      <h2 className="mt-3 text-lg font-bold text-text">{label}</h2>
      <p className="mt-2 text-sm text-text-muted">{t("soonBody")}</p>
      <Link
        href="/account"
        className={buttonClasses({ variant: "secondary", className: "mt-5" })}
      >
        {t("backToAccount")}
      </Link>
    </Card>
  );
}
