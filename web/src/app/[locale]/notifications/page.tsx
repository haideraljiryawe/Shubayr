import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RequireAuth } from "@/components/auth/require-auth";
import { InboxView } from "@/components/inbox/inbox-view";
import { WorkPage } from "@/components/work/work-page";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "inbox" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Every signed-in role has an inbox — customers and work accounts alike. */
export default async function NotificationsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("inbox");

  return (
    <RequireAuth>
      <WorkPage title={t("title")}>
        <InboxView />
      </WorkPage>
    </RequireAuth>
  );
}
