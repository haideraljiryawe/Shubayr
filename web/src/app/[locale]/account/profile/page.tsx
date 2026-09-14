import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountShell, SectionHeading } from "@/components/account/account-shell";
import { ProfileForm } from "@/components/account/profile-form";

type ProfilePageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("profile"), robots: { index: false, follow: false } };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");

  return (
    <AccountShell title={t("title")}>
      <SectionHeading title={t("profile")} />
      <ProfileForm />
    </AccountShell>
  );
}
