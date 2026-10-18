import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { legalDocument, type LegalPageKey } from "@/content/legal";
import { infoPageMetadata, infoStore, policyUpdatedLine } from "@/lib/info-pages";
import { SITE_URL } from "@/lib/site";
import { LegalPage } from "./legal-page";

type PageProps = { params: Promise<{ locale: string }> };

function language(locale: string): "ar" | "en" {
  return locale === "en" ? "en" : "ar";
}

/** generateMetadata and the page for /privacy, /terms and /returns. */
export function legalRoute(page: LegalPageKey) {
  const path = `/${page}`;

  async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const { storeName, info } = await infoStore(locale);
    const document = legalDocument(page, language(locale), { storeName, siteUrl: SITE_URL, info });
    return infoPageMetadata({ locale, path, title: document.title, description: document.intro, storeName });
  }

  async function Page({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const [{ storeName, info }, t] = await Promise.all([infoStore(locale), getTranslations("legal")]);
    const updated = await policyUpdatedLine(locale, info);
    const document = legalDocument(page, language(locale), { storeName, siteUrl: SITE_URL, info });
    return <LegalPage page={page} document={document} updated={updated} contentsLabel={t("contents")} />;
  }

  return { generateMetadata, Page };
}
