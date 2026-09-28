import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadAccessCatalog } from "@/lib/api/access-catalog";
import { load, serverApi } from "@/lib/api/server";
import { StaffEditor } from "./staff-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("staff");
  return { title: t("edit") };
}

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("staff");
  const api = await serverApi();
  // The contract has no GET /admin/staff/{id}; the list is the only read.
  const staff = await load(api.GET("/admin/staff"));
  if (!staff.ok) return <PageError error={staff.error} />;
  const user = staff.data.find((row) => row.id === id);
  if (!user) notFound();
  const catalog = await loadAccessCatalog();

  return (
    <>
      <Link
        href="/staff"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline"
      >
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("backToList")}
      </Link>
      <PageHeader
        title={user.name || user.username}
        description={<span dir="ltr">{user.username}</span>}
      />
      <StaffEditor
        key={`${user.id}:${user.updated_at}`}
        user={user}
        catalog={catalog}
      />
    </>
  );
}
