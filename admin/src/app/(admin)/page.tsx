import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui";
import { load, serverApi } from "@/lib/api/server";
import { visibleNav } from "@/lib/nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("dashboard") };
}

/**
 * Dashboard placeholder. Operations dashboards arrive with their backend
 * phases (orders, stock, cash); until then it greets the staff member and
 * points at the sections their permissions open.
 */
export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  const api = await serverApi();
  const me = await load(api.GET("/me"));
  const user = me.ok ? me.data : null;
  const sections = visibleNav(user?.permissions ?? []).filter(
    (item) => item.key !== "dashboard",
  );

  return (
    <div data-testid="dashboard">
      <PageHeader
        title={t("welcome", { name: user?.name || user?.username || "" })}
        description={t("body")}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((item) => (
          <Link key={item.key} href={item.href} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <p className="font-bold text-primary-dark">{tNav(item.key)}</p>
              <p className="mt-1 text-sm text-text-muted">
                {t(`section.${item.key}`)}
              </p>
            </Card>
          </Link>
        ))}
        <Card className="border-dashed bg-card/60">
          <p className="font-bold">{t("comingTitle")}</p>
          <p className="mt-1 text-sm text-text-muted">{t("comingBody")}</p>
        </Card>
      </div>
      {sections.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted" data-testid="no-sections">
          {t("noSections")}
        </p>
      ) : null}
    </div>
  );
}
