import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountShell, SectionHeading } from "@/components/account/account-shell";
import { PLACEHOLDER_SECTIONS } from "@/components/account/account-menu";
import { ComingSoon } from "@/components/account/states";

type SectionPageProps = {
  params: Promise<{ locale: string; section: string }>;
};

/**
 * The account rows this phase does not build yet — المفضلة, طرق الدفع,
 * الإشعارات, اللغة, المساعدة, الإعدادات.
 *
 * Static siblings (orders, addresses, profile) take precedence over this
 * dynamic segment, so it only ever catches the placeholder sections; anything
 * else is a real 404 rather than a "coming soon" for a page that will never
 * exist.
 */
function isPlaceholder(section: string): boolean {
  return (PLACEHOLDER_SECTIONS as string[]).includes(section);
}

export async function generateMetadata({
  params,
}: SectionPageProps): Promise<Metadata> {
  const { locale, section } = await params;
  if (!isPlaceholder(section)) return {};
  const t = await getTranslations({ locale, namespace: "account" });
  return {
    title: t(section as "wishlist"),
    robots: { index: false, follow: false },
  };
}

export default async function AccountSectionPage({ params }: SectionPageProps) {
  const { locale, section } = await params;
  if (!isPlaceholder(section)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations("account");
  const label = t(section as "wishlist");

  return (
    <AccountShell title={t("title")}>
      <SectionHeading title={label} />
      <ComingSoon label={label} />
    </AccountShell>
  );
}
