"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { consumeDeliberateSignOut } from "@/lib/auth-store";

/**
 * Gate for the account pages.
 *
 * The session lives in the browser, so this guard is a client redirect rather
 * than middleware — the server cannot know who is signed in. It waits for the
 * store to hydrate before deciding, so a signed-in visitor reloading /account
 * is never bounced to the login page for a frame. The path they wanted is
 * carried in `?next=`, and the login page returns them to it.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const t = useTranslations("auth");
  const { isAuthenticated, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready || isAuthenticated) return;
    // Someone who just signed out is already being sent home by the control
    // they used; bouncing them to the login page instead would be wrong.
    if (consumeDeliberateSignOut()) return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, isAuthenticated, router, pathname]);

  if (!ready || !isAuthenticated) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
        <Card
          padding="lg"
          role="status"
          aria-label={t("checking")}
          className="motion-safe:animate-pulse"
        >
          <span className="sr-only">{t("checking")}</span>
          <div aria-hidden className="flex flex-col gap-4">
            <div className="h-6 w-48 rounded bg-card" />
            <div className="h-24 rounded-md bg-card" />
            <div className="h-12 rounded-md bg-card" />
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
