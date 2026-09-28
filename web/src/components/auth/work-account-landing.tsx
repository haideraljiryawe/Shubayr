"use client";

import { useTranslations } from "next-intl";
import { BriefcaseBusiness, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import type { WorkRole } from "@/lib/work-account";

/**
 * The only page a work account sees on the storefront.
 *
 * Shopping, the cart, the wishlist and customer addresses are all refused to
 * work accounts by the API, so rather than render a store full of buttons that
 * would each fail, the session gets one honest page: who they are signed in as,
 * where their work happens, and the way out. The full agent and monitor work
 * pages arrive after backend build phase 2.
 */
export function WorkAccountLanding({ role }: { role: WorkRole }) {
  const t = useTranslations("workAccount");
  const tAuth = useTranslations("auth");
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 lg:py-16">
      <Card
        padding="lg"
        data-testid="work-account-landing"
        data-role={role}
        className="flex flex-col items-center gap-5 text-center"
      >
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-card text-primary-dark">
          <BriefcaseBusiness className="size-8" aria-hidden />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-text">{t("title")}</h1>
          <p className="text-text-muted">
            {t("signedInAs", { name: user?.name || user?.phone || "" })}
          </p>
          <p
            className="mx-auto rounded-full bg-card px-4 py-1 text-sm font-semibold text-primary-dark"
            data-testid="work-account-role"
          >
            {t(`role.${role}`)}
          </p>
        </div>
        <p className="max-w-md text-text-muted">{t("body")}</p>
        <p className="max-w-md text-sm text-text-muted">{t("comingSoon")}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="secondary"
            data-testid="work-account-signout"
            onClick={() => {
              logout();
              router.replace("/");
            }}
          >
            <LogOut className="size-4 rtl-flip" aria-hidden />
            {tAuth("signOut")}
          </Button>
          <LocaleSwitcher />
        </div>
      </Card>
    </div>
  );
}
