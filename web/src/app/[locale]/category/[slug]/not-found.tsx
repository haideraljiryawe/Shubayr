import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/button";

export default async function CategoryNotFound() {
  const t = await getTranslations("catalog");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{t("notFound")}</h1>
      <p className="mt-3 text-text-muted">{t("notFoundBody")}</p>
      <Link
        href="/categories"
        className={buttonClasses({ variant: "cta", className: "mt-6" })}
      >
        {t("backCategories")}
      </Link>
    </div>
  );
}
