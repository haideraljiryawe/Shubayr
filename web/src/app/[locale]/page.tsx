import { getTranslations, setRequestLocale } from "next-intl/server";
import { Palette } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

/**
 * Phase 1 placeholder. Real storefront pages (home, categories, product, cart)
 * land in phase 2 — this exists so the app shell has something to frame.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="mx-auto max-w-7xl px-4 lg:px-8 py-16">
      <Card padding="lg" className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold text-text">{t("brand.name")}</h1>
        <p className="mt-2 text-text-muted">{t("brand.tagline")}</p>
        <p className="mt-6 text-sm text-text-muted">{t("footer.tagline")}</p>

        <Link
          href="/style-guide"
          className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-dark"
        >
          <Palette className="size-4" aria-hidden />
          {t("nav.styleGuide")}
        </Link>
      </Card>
    </div>
  );
}
