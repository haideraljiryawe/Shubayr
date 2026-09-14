import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountShell } from "@/components/account/account-shell";

type AccountPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: AccountPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** The mockup's «حسابي» screen: profile header plus the menu. */
export default async function AccountPage({ params }: AccountPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");

  return <AccountShell isRoot title={t("title")} />;
}
