import { getTranslations, setRequestLocale } from "next-intl/server";
import { Construction } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Locale } from "@/i18n/routing";

/**
 * Placeholder so every ProductCard link resolves. Without it Next's link
 * prefetching fires a 404 for each card in the viewport, and clicking one dead-
 * ends. The real detail page is a later phase.
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("product");

  const product = await api.getProduct(id).catch(() => null);
  const name = product
    ? ((locale as Locale) === "ar" ? product.name_ar : product.name_en)
    : id;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8">
      <Card padding="lg" className="text-center">
        <Construction className="mx-auto size-10 text-accent" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-text">{name}</h1>
        <p className="mt-2 font-medium text-text">{t("comingSoonTitle")}</p>
        <p className="mt-1 text-sm text-text-muted">{t("comingSoonBody")}</p>

        <Link
          href="/"
          className={buttonClasses({ variant: "cta", className: "mt-6" })}
        >
          {t("backHome")}
        </Link>
      </Card>
    </div>
  );
}
