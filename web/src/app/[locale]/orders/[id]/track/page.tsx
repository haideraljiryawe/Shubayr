import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

type TrackPageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata({
  params,
}: TrackPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });

  return {
    title: t("trackOrder"),
    robots: { index: false, follow: false },
  };
}

/**
 * Placeholder for order tracking, which reads GET /orders/{id}/track in the
 * account phase. It exists now so the confirmation screen's «تتبّع الطلب» link
 * lands somewhere real instead of a 404.
 */
export default async function TrackOrderPage({ params }: TrackPageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("checkout");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 lg:px-8">
      <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
        <Truck className="size-12 text-primary-dark rtl-flip" aria-hidden />
        <h1 className="text-xl font-bold text-text">{t("trackSoonTitle")}</h1>
        <p className="text-sm text-text-muted">{t("trackSoonBody")}</p>
        <p className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-text-muted">{t("orderNumber")}</span>
          <span
            dir="ltr"
            className="rounded-md bg-card px-3 py-1 font-bold text-primary-dark [unicode-bidi:isolate]"
          >
            {id}
          </span>
        </p>
        <Link
          href="/categories"
          className={buttonClasses({ variant: "cta", className: "mt-2" })}
        >
          {t("keepShopping")}
        </Link>
      </Card>
    </div>
  );
}
