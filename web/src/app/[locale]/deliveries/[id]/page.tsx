import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DeliveryDetail } from "@/components/work/delivery-detail";
import { RequireRole } from "@/components/work/require-role";
import { WorkPage } from "@/components/work/work-page";

type PageProps = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "deliveries" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Also where a delivery agent's notifications deep-link to. */
export default async function DeliveryPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("deliveries");

  return (
    <RequireRole role="delivery_agent">
      <WorkPage title={t("title")}>
        <DeliveryDetail deliveryId={id} />
      </WorkPage>
    </RequireRole>
  );
}
