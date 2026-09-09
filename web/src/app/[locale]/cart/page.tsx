import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CartView } from "@/components/cart/cart-view";

type CartPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: CartPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart" });

  return {
    title: t("title"),
    // A basket is personal and has nothing to index.
    robots: { index: false, follow: true },
  };
}

/**
 * The cart is guest state in the browser, so the page itself is a static shell
 * around the client view — nothing here can be rendered on the server.
 */
export default async function CartPage({ params }: CartPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CartView />;
}
