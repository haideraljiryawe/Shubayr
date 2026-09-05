import { useTranslations } from "next-intl";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Shown when a section's fetch throws. Each home section catches its own error,
 * so one failing endpoint degrades that strip instead of blanking the page.
 */
export function SectionError() {
  const t = useTranslations("home");

  return (
    <Card tone="muted" padding="lg" className="text-center">
      <AlertTriangle className="mx-auto size-8 text-warning" aria-hidden />
      <p className="mt-3 font-semibold text-text">{t("errorTitle")}</p>
      <p className="mt-1 text-sm text-text-muted">{t("errorBody")}</p>
    </Card>
  );
}

/** Shown when a section fetches successfully but has nothing to display. */
export function SectionEmpty() {
  const t = useTranslations("home");

  return (
    <Card tone="muted" padding="lg" className="text-center">
      <PackageOpen className="mx-auto size-8 text-text-muted" aria-hidden />
      <p className="mt-3 font-semibold text-text">{t("emptyTitle")}</p>
      <p className="mt-1 text-sm text-text-muted">{t("emptyBody")}</p>
    </Card>
  );
}
