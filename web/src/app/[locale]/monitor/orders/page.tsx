import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MonitorOrderList } from "@/components/work/monitor-order-list";
import { RequireRole } from "@/components/work/require-role";
import { WorkPage } from "@/components/work/work-page";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "monitor" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** The session lives in the browser, so the list is fetched client-side. */
export default async function MonitorOrdersPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("monitor");

  return (
    <RequireRole role="order_monitor">
      <WorkPage title={t("title")}>
        <MonitorOrderList />
      </WorkPage>
    </RequireRole>
  );
}
