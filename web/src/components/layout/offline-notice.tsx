"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CloudOff } from "lucide-react";

/**
 * A quiet banner while the device is offline, so a failed tap reads as "no
 * connection" rather than a broken store. It disappears when the connection
 * returns.
 */
export function OfflineNotice() {
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

  if (!offline) return null;
  return (
    <div role="status" data-testid="offline-notice" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-semibold text-text">
      <CloudOff className="size-4" aria-hidden />
      {t("offlineBanner")}
    </div>
  );
}
