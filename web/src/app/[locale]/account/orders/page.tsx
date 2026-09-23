import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountShell, SectionHeading } from "@/components/account/account-shell";
import { OrderList } from "@/components/account/order-list";

type OrdersPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: OrdersPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "orders" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function OrdersPage({ params }: OrdersPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [account, orders] = await Promise.all([
    getTranslations("account"),
    getTranslations("orders"),
  ]);

  return (
    <AccountShell title={account("title")}>
      <SectionHeading title={orders("title")} />
      <OrderList />
    </AccountShell>
  );
}
