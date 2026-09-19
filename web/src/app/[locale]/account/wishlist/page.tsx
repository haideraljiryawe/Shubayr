import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  AccountShell,
  SectionHeading,
} from "@/components/account/account-shell";
import { WishlistGrid } from "@/components/account/wishlist-grid";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "wishlist" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function WishlistPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [account, section] = await Promise.all([
    getTranslations("account"),
    getTranslations("wishlist"),
  ]);

  return (
    <AccountShell title={account("title")}>
      <SectionHeading title={section("title")} />
      <WishlistGrid />
    </AccountShell>
  );
}
