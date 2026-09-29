"use client";

import { useTranslations } from "next-intl";
import { BriefcaseBusiness, LogOut } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { WORK_HOME, type WorkRole } from "@/lib/work-account";

/** The header's work menu: the role's own pages and the way out. */
export function WorkNav({ role }: { role: WorkRole }) {
  const t = useTranslations("work");
  const tAuth = useTranslations("auth");
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <>
      <Link
        href={WORK_HOME[role]}
        data-testid="work-nav-home"
        className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary-dark transition-colors duration-150 hover:bg-card sm:px-3"
      >
        <BriefcaseBusiness className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t(`home.${role}`)}</span>
      </Link>
      <IconButton
        label={tAuth("signOut")}
        variant="ghost"
        data-testid="work-nav-signout"
        onClick={() => {
          logout();
          router.replace("/");
        }}
      >
        <LogOut className="size-5 rtl-flip" aria-hidden />
      </IconButton>
    </>
  );
}
