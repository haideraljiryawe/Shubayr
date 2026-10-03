import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadBackdatingWindow, loadCashAccounts, loadSupplierOptions } from "@/lib/api/purchasing-server";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { UUID } from "@/lib/inventory";
import type { RawSearchParams } from "@/lib/table-params";
import { PaymentForm } from "./payment-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("purchasing.payment");
  return { title: t("title") };
}

/**
 * Pay a supplier (supplier_payments.record): from a cash or bank account,
 * allocated to open invoices (partly, if need be), any remainder kept as
 * supplier credit, with the FX gain or loss shown before confirming.
 */
export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("purchasing.payment");
  const raw = await searchParams;
  const api = await serverApi();
  const pick = (key: string) => (typeof raw[key] === "string" && UUID.test(raw[key] as string) ? (raw[key] as string) : "");
  const [permissions, { suppliers }, cashAccounts, windowDays] = await Promise.all([
    loadPermissions(api),
    loadSupplierOptions(api, pick("supplier_id") || undefined),
    loadCashAccounts(api),
    loadBackdatingWindow(api),
  ]);
  if (!permissions.includes("supplier_payments.record")) return <PageError error={new ApiError(403, "supplier_payments.record required")} />;

  return (
    <>
      <Link href="/purchasing/payments" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <PaymentForm
        suppliers={suppliers.filter((supplier) => supplier.is_active)}
        cashAccounts={cashAccounts}
        presetSupplierId={pick("supplier_id")}
        presetInvoiceId={pick("invoice_id")}
        permissions={permissions}
        today={storeDay()}
        windowDays={windowDays}
      />
    </>
  );
}
