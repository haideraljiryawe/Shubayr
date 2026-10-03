import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { loadBackdatingWindow, loadSupplierOptions } from "@/lib/api/purchasing-server";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { UUID } from "@/lib/inventory";
import type { RawSearchParams } from "@/lib/table-params";
import { InvoiceForm } from "./invoice-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("purchasing.invoice");
  return { title: t("newTitle") };
}

/**
 * The purchase invoice — one screen, one posting (purchases.create): the
 * supplier's document, its lines in packs or base units, landed costs and
 * their allocation, then "Save and add to stock". The draft is saved to the
 * caller's own account as it is typed.
 */
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("purchasing.invoice");
  const raw = await searchParams;
  const api = await serverApi();
  const preset = typeof raw.supplier_id === "string" && UUID.test(raw.supplier_id) ? raw.supplier_id : "";
  const [permissions, { suppliers, complete }, { locations }, windowDays] = await Promise.all([
    loadPermissions(api),
    loadSupplierOptions(api, preset || undefined),
    loadWarehouses(api),
    loadBackdatingWindow(api),
  ]);
  if (!permissions.includes("purchases.create")) return <PageError error={new ApiError(403, "purchases.create required")} />;

  return (
    <>
      <Link href="/purchasing/invoices" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={t("newTitle")} description={t("newDescription")} />
      <InvoiceForm
        suppliers={suppliers.filter((supplier) => supplier.is_active)}
        suppliersComplete={complete}
        locations={[...locations.values()].filter((info) => info.active)}
        presetSupplierId={preset}
        today={storeDay()}
        windowDays={windowDays}
        permissions={permissions}
      />
    </>
  );
}
