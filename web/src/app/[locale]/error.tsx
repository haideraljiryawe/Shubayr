"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

/**
 * Any page that fails to render — most often because the store's API can't
 * be reached — shows this instead of a crash: offline when the device is,
 * "temporarily unavailable" otherwise, with a retry that re-runs the render.
 */
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const Icon = offline ? CloudOff : TriangleAlert;
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8">
      <Card padding="lg" className="text-center" role="alert" data-testid="page-error" data-offline={offline ? "true" : "false"}>
        <Icon className="mx-auto size-10 text-warning" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-text">{offline ? t("offlineTitle") : t("unavailableTitle")}</h1>
        <p className="mt-2 text-sm text-text-muted">{offline ? t("offlineBody") : t("unavailableBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="cta" onClick={reset} startIcon={<RefreshCw className="size-4" aria-hidden />}>
            {t("retry")}
          </Button>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            {t("backHome")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
