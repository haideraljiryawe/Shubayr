import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AgentTabs } from "@/components/work/agent-tabs";
import { MyCustody } from "@/components/work/my-custody";
import { RequireRole } from "@/components/work/require-role";
import { WorkPage } from "@/components/work/work-page";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "custody" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** The agent's own custody; the session lives in the browser, so it loads client-side. */
export default async function MyCustodyPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("custody");

  return (
    <RequireRole role="delivery_agent">
      <WorkPage title={t("title")}>
        <AgentTabs active="custody" />
        <MyCustody />
      </WorkPage>
    </RequireRole>
  );
}
