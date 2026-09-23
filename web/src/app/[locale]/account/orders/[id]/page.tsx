import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountShell, SectionHeading } from "@/components/account/account-shell";
import { OrderDetail } from "@/components/account/order-detail";

type OrderPageProps = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({
  params,
}: OrderPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "orders" });
  return { title: t("details"), robots: { index: false, follow: false } };
}

/**
 * An order belongs to the signed-in customer, and the session lives in the
 * browser — so the order is fetched client-side and the page is a shell.
 */
export default async function OrderPage({ params }: OrderPageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [account, orders] = await Promise.all([
    getTranslations("account"),
    getTranslations("orders"),
  ]);

  return (
    <AccountShell title={account("title")}>
      <SectionHeading title={orders("details")} />
      <OrderDetail orderId={id} />
    </AccountShell>
  );
}
