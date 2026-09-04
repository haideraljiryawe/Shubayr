import { getTranslations, setRequestLocale } from "next-intl/server";
import { StyleGuide } from "./style-guide";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "styleGuide" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function StyleGuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StyleGuide />;
}
