"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ShieldOff } from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { WORK_HOME, workRoleOf, type WorkRole } from "@/lib/work-account";

/**
 * Gate for a work page: signed in, and signed in as exactly this role.
 *
 * The API is the real boundary — it answers 403 to any other role on these
 * endpoints — so this only spares the visitor a page of failed requests and
 * tells them plainly the page is not theirs. A signed-out visitor goes to
 * the login page and comes back here, like the account pages.
 */
export function RequireRole({
  role,
  children,
}: {
  role: WorkRole;
  children: ReactNode;
}) {
  return (
    <RequireAuth>
      <RoleCheck role={role}>{children}</RoleCheck>
    </RequireAuth>
  );
}

function RoleCheck({ role, children }: { role: WorkRole; children: ReactNode }) {
  const t = useTranslations("work");
  const { user } = useAuth();
  if (user?.role === role) return <>{children}</>;

  const ownRole = workRoleOf(user);
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 lg:py-16">
      <Card
        padding="lg"
        role="alert"
        data-testid="work-forbidden"
        className="flex flex-col items-center gap-4 text-center"
      >
        <ShieldOff className="size-10 text-text-muted" aria-hidden />
        <h1 className="text-xl font-bold text-text">{t("forbiddenTitle")}</h1>
        <p className="max-w-md text-text-muted">{t("forbiddenBody")}</p>
        <Link
          href={ownRole ? WORK_HOME[ownRole] : "/"}
          className={buttonClasses({ variant: "secondary" })}
        >
          {ownRole ? t(`home.${ownRole}`) : t("backHome")}
        </Link>
      </Card>
    </div>
  );
}
