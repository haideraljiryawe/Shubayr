"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, buttonClasses, Card } from "@/components/ui";

/**
 * A page that failed to render — usually because the API can't be reached —
 * shows this instead of a crash: offline when the device is, "can't reach the
 * server" otherwise, with a retry that re-runs the render.
 */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="flex max-w-md flex-col items-center gap-3 p-8 text-center" role="alert" data-testid="page-error" data-offline={offline ? "true" : "false"}>
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-card text-primary-dark">
          <Icon className="size-7" aria-hidden />
        </span>
        <h1 className="text-xl font-bold">{offline ? t("offlineTitle") : t("loadFailedTitle")}</h1>
        <p className="text-sm text-text-muted">{offline ? t("offlineBody") : t("loadFailedBody")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <RefreshCw className="size-4" aria-hidden />
            {t("retry")}
          </Button>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            {t("backToDashboard")}
          </Link>
        </div>
      </Card>
    </main>
  );
}
