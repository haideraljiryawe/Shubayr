import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginView } from "@/components/auth/login-view";

type LoginPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: LoginPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return {
    title: t("loginTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // LoginView reads ?next= through useSearchParams, which needs a Suspense
  // boundary for the static shell to prerender.
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
