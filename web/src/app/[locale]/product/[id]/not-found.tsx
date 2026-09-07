import { getTranslations } from "next-intl/server";
import { PackageX } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

/** Rendered when GET /products/{id} answers 404. */
export default async function ProductNotFound() {
  const t = await getTranslations("product");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8">
      <Card padding="lg" className="text-center">
        <PackageX className="mx-auto size-10 text-text-muted" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-text">
          {t("notFoundTitle")}
        </h1>
        <p className="mt-2 text-sm text-text-muted">{t("notFoundBody")}</p>
        <Link
          href="/categories"
          className={buttonClasses({ variant: "cta", className: "mt-6" })}
        >
          {t("browse")}
        </Link>
      </Card>
    </div>
  );
}
