import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MonitorOrderDetail } from "@/components/work/monitor-order-detail";
import { RequireRole } from "@/components/work/require-role";
import { WorkPage } from "@/components/work/work-page";

type PageProps = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "monitor" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Also where an order monitor's notifications deep-link to. */
export default async function MonitorOrderPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("monitor");

  return (
    <RequireRole role="order_monitor">
      <WorkPage title={t("title")}>
        <MonitorOrderDetail orderId={id} />
      </WorkPage>
    </RequireRole>
  );
}
