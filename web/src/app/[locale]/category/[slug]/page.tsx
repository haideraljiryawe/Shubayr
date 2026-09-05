import { getTranslations, setRequestLocale } from "next-intl/server";
import { Construction } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Locale } from "@/i18n/routing";

/**
 * Placeholder so the home page's category links resolve. The real browse page
 * is Phase 3.
 *
 * `slug` currently carries the category id: Category has no slug field in
 * api/openapi.yaml, and `GET /products?category_id=` takes the id, so the id is
 * what the real page will need anyway.
 */
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("category");

  const category = await api
    .getCategories()
    .then((all) => all.find((c) => c.id === slug))
    .catch(() => undefined);

  const name = category
    ? ((locale as Locale) === "ar" ? category.name_ar : category.name_en)
    : slug;

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
