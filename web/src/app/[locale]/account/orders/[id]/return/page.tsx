import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  AccountShell,
  SectionHeading,
} from "@/components/account/account-shell";
import { ReturnRequestForm } from "@/components/account/return-request-form";

type PageProps = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "returns" });
  return {
    title: t("requestTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function ReturnRequestPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [account, returns] = await Promise.all([
    getTranslations("account"),
    getTranslations("returns"),
  ]);

  return (
    <AccountShell title={account("title")}>
      <SectionHeading title={returns("requestTitle")} />
      <ReturnRequestForm orderId={id} />
    </AccountShell>
  );
}
