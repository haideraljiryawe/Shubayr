import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";

type CheckoutPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: CheckoutPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });

  return {
    title: t("title"),
    // Checkout is personal and single-use; keep it out of the index.
    robots: { index: false, follow: false },
  };
}

/**
 * The whole flow runs against the guest cart in the browser, so the page is a
 * static shell and every step is client state.
 */
export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CheckoutFlow />;
}
