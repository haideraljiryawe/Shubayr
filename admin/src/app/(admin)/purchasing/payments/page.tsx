import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buttonClasses, Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadSupplierOptions } from "@/lib/api/purchasing-server";
import { load, serverApi } from "@/lib/api/server";
import { entryHref } from "@/lib/finance/links";
import { UUID } from "@/lib/inventory";
import { moneyText, precisionOf, toFixed, type SupplierPayment } from "@/lib/purchasing";
import type { RawSearchParams } from "@/lib/table-params";
import { SupplierFilter } from "./supplier-filter";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("supplierPayments") };
}

const PER_PAGE = 20;

/**
 * Supplier payments, newest first, paged by the server (suppliers.view).
 * The route answers a bare page of rows without a total (API 9.0), so the
 * list pages forward and back rather than showing a page count.
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("purchasing.payments");
  const locale = await getLocale();
  const format = await getFormatter();
  const raw = await searchParams;
  const page = Math.max(1, Number(typeof raw.page === "string" ? raw.page : 1) || 1);
  const supplierId = typeof raw.supplier_id === "string" && UUID.test(raw.supplier_id) ? raw.supplier_id : undefined;
  const api = await serverApi();
  const [payments, permissions, options] = await Promise.all([
    load(api.GET("/admin/supplier-payments", { params: { query: { page, per_page: PER_PAGE, ...(supplierId ? { supplier_id: supplierId } : {}) } } })),
    loadPermissions(api),
    loadSupplierOptions(api),
  ]);
  if (!payments.ok) return <PageError error={payments.error} />;
  const rows = payments.data as unknown as SupplierPayment[];
  const names = new Map(options.suppliers.map((supplier) => [supplier.id, supplier.name]));
  const href = (next: number) => `/purchasing/payments?${new URLSearchParams({ ...(supplierId ? { supplier_id: supplierId } : {}), page: String(next) })}`;
  const money = (value: number, code: string) => moneyText(toFixed(value), code, precisionOf(code), locale);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          permissions.includes("supplier_payments.record") ? (
            <Link href="/purchasing/payments/new" className={buttonClasses()} data-testid="payment-new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </Link>
          ) : null
        }
      />
      <div className="mb-4">
        <SupplierFilter suppliers={options.suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))} value={supplierId ?? ""} />
      </div>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">{t("empty")}</p>
        ) : (
          <table className="w-full min-w-[48rem] text-sm" data-testid="payments-table">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.document")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.supplier")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("columns.date")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.amount")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.allocated")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("columns.credit")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
                <tr key={payment.id} className="border-t border-border" data-testid="payment-row">
                  <td className="px-3 py-2">
                    {permissions.includes("ledger.view") ? (
                      <Link href={entryHref(payment.journal_entry_id)} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                        {payment.document_number}
                      </Link>
                    ) : (
                      <span dir="ltr">{payment.document_number}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/purchasing/suppliers/${payment.supplier_id}`} className="hover:underline">
                      {names.get(payment.supplier_id) ?? payment.supplier_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{format.dateTime(new Date(payment.document_date), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" })}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{money(payment.amount_currency, payment.currency_code)}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{money(payment.allocated_currency, payment.currency_code)}</td>
                  <td className="px-3 py-2 text-end" dir="ltr">{money(payment.unallocated_currency, payment.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <nav className="mt-3 flex items-center justify-end gap-2 text-sm" aria-label={t("pagination")}>
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClasses({ variant: "ghost", size: "sm" })} aria-label={t("previous")}>
            <ChevronRight className="size-4 ltr:rotate-180" aria-hidden />
          </Link>
        ) : null}
        <span>{t("page", { page })}</span>
        {rows.length === PER_PAGE ? (
          <Link href={href(page + 1)} className={buttonClasses({ variant: "ghost", size: "sm" })} aria-label={t("next")}>
            <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
          </Link>
        ) : null}
      </nav>
    </>
  );
}
