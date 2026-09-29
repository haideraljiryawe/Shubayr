import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { InboxList } from "@/components/inbox/inbox-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

/** Every notification the staff member has, with the unread filter and paging. */
export default async function NotificationsPage() {
  const t = await getTranslations("inbox");
  return (
    <>
      <PageHeader title={t("title")} />
      <InboxList />
    </>
  );
}
