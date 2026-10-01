import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { TransferForm } from "./transfer-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inventory");
  return { title: t("newDocument.transfer") };
}

/** Move unreserved stock between locations (inventory.transfer), keeping each lot's identity. */
export default async function NewTransferPage() {
  const t = await getTranslations("inventory");
  const api = await serverApi();
  const [permissions, { warehouses, locations }] = await Promise.all([loadPermissions(api), loadWarehouses(api)]);
  if (!permissions.includes("inventory.transfer")) return <PageError error={new ApiError(403, "inventory.transfer required")} />;

  return (
    <>
      <Link href="/inventory/transfers" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("documents.transfer")}
      </Link>
      <PageHeader title={t("newDocument.transfer")} description={t("transfer.description")} />
      <TransferForm
        warehouses={warehouses}
        locations={Object.fromEntries(locations)}
        canSearchSku={permissions.includes("catalog.products")}
      />
    </>
  );
}
