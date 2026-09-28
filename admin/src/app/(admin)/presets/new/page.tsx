import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { PresetForm } from "../preset-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("presets");
  return { title: t("new") };
}

export default async function NewPresetPage() {
  const t = await getTranslations("presets");
  const api = await serverApi();
  const permissions = await load(api.GET("/admin/permissions"));
  if (!permissions.ok) return <PageError error={permissions.error} />;

  return (
    <>
      <PageHeader title={t("new")} description={t("newDescription")} />
      <PresetForm registry={permissions.data} preset={null} />
    </>
  );
}
