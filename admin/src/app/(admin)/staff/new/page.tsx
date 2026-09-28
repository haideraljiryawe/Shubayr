import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadAccessCatalog } from "@/lib/api/access-catalog";
import { load, serverApi } from "@/lib/api/server";
import { StaffCreateForm } from "./staff-create-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("staff");
  return { title: t("new") };
}

export default async function NewStaffPage() {
  const t = await getTranslations("staff");
  // Creating staff needs users.manage; probe it with the list so a person
  // without it gets the 403 page up front, not after filling in the form.
  const api = await serverApi();
  const probe = await load(api.GET("/admin/staff"));
  if (!probe.ok) return <PageError error={probe.error} />;
  const catalog = await loadAccessCatalog();

  return (
    <>
      <PageHeader title={t("new")} description={t("newDescription")} />
      <StaffCreateForm catalog={catalog} />
    </>
  );
}
