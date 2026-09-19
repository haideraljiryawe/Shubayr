import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  AccountShell,
  SectionHeading,
} from "@/components/account/account-shell";
import { ReturnsList } from "@/components/account/returns-list";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "returns" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ReturnsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [account, section] = await Promise.all([
    getTranslations("account"),
    getTranslations("returns"),
  ]);

  return (
    <AccountShell title={account("title")}>
      <SectionHeading title={section("title")} />
      <ReturnsList />
    </AccountShell>
  );
}
