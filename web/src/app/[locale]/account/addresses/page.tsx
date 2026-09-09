import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountShell, SectionHeading } from "@/components/account/account-shell";
import { AddressList } from "@/components/account/address-list";

type AddressesPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: AddressesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "addresses" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AddressesPage({ params }: AddressesPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [account, addresses] = await Promise.all([
    getTranslations("account"),
    getTranslations("addresses"),
  ]);

  return (
    <AccountShell title={account("title")}>
      <SectionHeading title={addresses("title")} />
      <AddressList />
    </AccountShell>
  );
}
