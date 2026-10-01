import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { CountScopeForm } from "./count-scope-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inventory");
  return { title: t("newDocument.count") };
}

/** Snapshot a physical count over a warehouse, a location or a SKU (inventory.count). */
export default async function NewCountPage() {
  const t = await getTranslations("inventory");
  const api = await serverApi();
  const [permissions, { warehouses, locations }] = await Promise.all([loadPermissions(api), loadWarehouses(api)]);
  if (!permissions.includes("inventory.count")) return <PageError error={new ApiError(403, "inventory.count required")} />;

  return (
    <>
      <Link href="/inventory/counts" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("documents.count")}
      </Link>
      <PageHeader title={t("newDocument.count")} description={t("count.description")} />
      <CountScopeForm warehouses={warehouses} locations={[...locations.values()]} canSearchSku={permissions.includes("catalog.products")} />
    </>
  );
}
