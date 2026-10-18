import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/layout/logo";
import { PolicyLinks } from "@/components/legal/policy-links";
import { storeIsPublic } from "@/lib/store-gate";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "comingSoon" });
  return {
    title: t("title"),
    description: t("body"),
    // Never indexed: the real pages take over at the same addresses on opening day.
    robots: { index: false, follow: false },
  };
}

/**
 * "Opening soon" — what every store address shows while STORE_PUBLIC=false
 * (the proxy rewrites to here; src/lib/store-gate.ts). Branded with the
 * store's own name and logo, in both languages, with nothing to click into
 * but the language and the privacy, terms and support pages (open even now).
 * Once the store is open this address is simply not found.
 */
export default async function ComingSoonPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (storeIsPublic()) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("comingSoon");
  const other = locale === "ar" ? "en" : "ar";
  const tOther = await getTranslations({ locale: other, namespace: "comingSoon" });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 py-16 text-center" data-testid="coming-soon">
      <Logo />
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="text-3xl font-bold text-text sm:text-4xl">{t("title")}</h1>
        <p className="text-base text-text-muted sm:text-lg">{t("body")}</p>
      </div>
      <div lang={other} dir={other === "ar" ? "rtl" : "ltr"} className="flex max-w-xl flex-col gap-1 border-t border-border pt-6">
        <p className="font-semibold text-text">{tOther("title")}</p>
        <p className="text-sm text-text-muted">{tOther("body")}</p>
      </div>
      <a
        href={other === "ar" ? "/" : "/en"}
        hrefLang={other}
        className="text-sm font-semibold text-primary-dark underline"
        data-testid="coming-soon-language"
      >
        {t("otherLanguage")}
      </a>
      <div data-testid="coming-soon-policies">
        <PolicyLinks only={["privacy", "terms", "support"]} className="[&_ul]:justify-center" />
      </div>
    </main>
  );
}
