import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BarChart3 } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { REPORT_IDS, REPORTS } from "@/lib/reports";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("reports") };
}

export default async function ReportsHubPage() {
  const t = await getTranslations("reports");
  const api = await serverApi();
  const me = await load(api.GET("/me"));
  if (!me.ok) return <PageError error={me.error} />;
  const granted = new Set(me.data.permissions ?? []);
  const available = REPORT_IDS.filter((id) => granted.has(REPORTS[id].permission));
  return (
    <div data-testid="reports-hub">
      <PageHeader title={t("title")} description={t("description")} />
      {available.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {available.map((id) => (
            <Link key={id} href={`/reports/${id}`} className="group">
              <Card className="flex h-full gap-3 transition-shadow group-hover:shadow-md">
                <BarChart3 className="mt-0.5 size-5 shrink-0 text-primary-dark" aria-hidden />
                <span><strong className="block">{t(`names.${id}`)}</strong><span className="mt-1 block text-body text-text-muted">{t(`descriptions.${id}`)}</span></span>
              </Card>
            </Link>
          ))}
        </div>
      ) : <p className="text-body text-text-muted" data-testid="reports-empty-permissions">{t("noPermission")}</p>}
    </div>
  );
}

