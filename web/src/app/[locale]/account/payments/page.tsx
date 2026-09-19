import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  AccountShell,
  SectionHeading,
} from "@/components/account/account-shell";
import { PaymentMethodsPanel } from "@/components/account/settings-panels";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settings" });
  return { title: t("paymentsTitle"), robots: { index: false, follow: false } };
}

export default async function PaymentsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [account, section] = await Promise.all([
    getTranslations("account"),
    getTranslations("settings"),
  ]);

  return (
    <AccountShell title={account("title")}>
      <SectionHeading title={section("paymentsTitle")} />
      <PaymentMethodsPanel />
    </AccountShell>
  );
}
