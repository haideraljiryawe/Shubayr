import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { WarehousesView } from "./warehouses-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("warehouses") };
}

/**
 * Warehouses and their locations (inventory.view; changes need
 * inventory.manage). A warehouse or location that was never used can be
 * deleted; once stock has touched it the API refuses, and it is deactivated
 * instead — which the API in turn refuses while it still holds stock.
 */
export default async function WarehousesPage() {
  const t = await getTranslations("inventory.warehouses");
  const api = await serverApi();
  const [warehouses, permissions] = await Promise.all([load(api.GET("/admin/inventory/warehouses")), loadPermissions(api)]);
  if (!warehouses.ok) return <PageError error={warehouses.error} />;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <WarehousesView warehouses={warehouses.data} canManage={permissions.includes("inventory.manage")} />
    </>
  );
}
