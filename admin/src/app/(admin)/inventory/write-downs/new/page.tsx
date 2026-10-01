import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { WriteDownForm } from "./write-down-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inventory");
  return { title: t("newDocument.write_down") };
}

/** Write damaged or expired stock down to inventory loss (inventory.write_down). */
export default async function NewWriteDownPage() {
  const t = await getTranslations("inventory");
  const api = await serverApi();
  const [permissions, { warehouses, locations }] = await Promise.all([loadPermissions(api), loadWarehouses(api)]);
  if (!permissions.includes("inventory.write_down")) return <PageError error={new ApiError(403, "inventory.write_down required")} />;

  return (
    <>
      <Link href="/inventory/write-downs" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("documents.write_down")}
      </Link>
      <PageHeader title={t("newDocument.write_down")} description={t("writeDown.description")} />
      <WriteDownForm
        warehouses={warehouses}
        locations={Object.fromEntries(locations)}
        canSearchSku={permissions.includes("catalog.products")}
        canTransfer={permissions.includes("inventory.transfer")}
      />
    </>
  );
}
