import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountShell, SectionHeading } from "@/components/account/account-shell";
import { ReturnDetail } from "@/components/account/return-detail";

type PageProps = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "returns" });
  return { title: t("detailTitle"), robots: { index: false, follow: false } };
}

/** One of the customer's returns: its status, accepted items, refund and points. */
export default async function ReturnDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [account, section] = await Promise.all([getTranslations("account"), getTranslations("returns")]);

  return (
    <AccountShell title={account("title")}>
      <SectionHeading title={section("detailTitle")} />
      <ReturnDetail returnId={id} />
    </AccountShell>
  );
}
