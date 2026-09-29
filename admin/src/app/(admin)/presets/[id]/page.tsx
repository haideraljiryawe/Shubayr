import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { listRows, load, serverApi } from "@/lib/api/server";
import { PresetForm } from "../preset-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("presets");
  return { title: t("edit") };
}

export default async function PresetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("presets");
  const api = await serverApi();
  const [presets, permissions] = await Promise.all([
    load(api.GET("/admin/presets")),
    load(api.GET("/admin/permissions")),
  ]);
  if (!presets.ok) return <PageError error={presets.error} />;
  if (!permissions.ok) return <PageError error={permissions.error} />;
  // No GET /admin/presets/{id} in the contract: read it from the list.
  const preset = listRows(presets.data).find((row) => row.id === id);
  if (!preset) notFound();

  return (
    <>
      <PageHeader
        title={<span dir="ltr">{preset.name}</span>}
        description={
          preset.is_system ? (
            <Badge tone="info">{t("system")}</Badge>
          ) : (
            t("custom")
          )
        }
      />
      <PresetForm key={preset.id} registry={permissions.data} preset={preset} />
    </>
  );
}
