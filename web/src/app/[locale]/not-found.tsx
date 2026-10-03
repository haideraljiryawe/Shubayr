import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

/**
 * The store's 404, inside the shell (header, navigation) and in the visitor's
 * language. Unknown paths reach it through [...rest]; pages call notFound().
 */
export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8">
      <Card padding="lg" className="text-center" data-testid="not-found">
        <SearchX className="mx-auto size-10 text-text-muted" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-text">{t("notFoundTitle")}</h1>
        <p className="mt-2 text-sm text-text-muted">{t("notFoundBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonClasses({ variant: "cta" })}>
            {t("backHome")}
          </Link>
          <Link href="/categories" className={buttonClasses({ variant: "secondary" })}>
            {t("browse")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
