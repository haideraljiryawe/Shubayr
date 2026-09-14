"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Any non-404 failure loading the product. `reset` re-runs the server render. */
export default function ProductError({ reset }: { reset: () => void }) {
  const t = useTranslations("product");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8">
      <Card padding="lg" className="text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-text">{t("errorTitle")}</h1>
        <p className="mt-2 text-sm text-text-muted">{t("errorBody")}</p>
        <Button variant="cta" onClick={reset} className="mt-6">
          {t("retry")}
        </Button>
      </Card>
    </div>
  );
}
