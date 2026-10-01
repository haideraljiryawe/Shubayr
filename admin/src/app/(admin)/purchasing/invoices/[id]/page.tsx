import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Badge, buttonClasses, Card, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { loadInvoice } from "@/lib/api/purchasing-server";
import { serverApi } from "@/lib/api/server";
import { entryHref } from "@/lib/finance/links";
import { formatQuantity, locationLabel, lotHref, UUID } from "@/lib/inventory";
import { moneyText, precisionOf, toFixed } from "@/lib/purchasing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("purchasing.invoice");
  return { title: t("detailTitle") };
}

/**
 * A posted purchase invoice, read-only: the original document never
 * changes; later changes are their own documents (payments, returns, cost
 * corrections), listed here. Each line links to the lot it created. Costs
 * show only with cost.view (the API omits them otherwise).
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("purchasing.invoice");
  const locale = await getLocale();
  const format = await getFormatter();
  const api = await serverApi();
  const [invoice, permissions, { locations }] = await Promise.all([loadInvoice(api, id), loadPermissions(api), loadWarehouses(api)]);
  if (!invoice.ok) {
    if (invoice.error.status === 404) notFound();
    return <PageError error={invoice.error} />;
  }
  const doc = invoice.data;
  const can = (key: string) => permissions.includes(key);
  const canCost = can("cost.view");
  const currency = doc.currency_code;
  const money = (value: number | undefined, code: string, digits = precisionOf(code)) =>
    value === undefined ? "—" : moneyText(toFixed(value), code, digits, locale);
  const day = (iso: string | null | undefined) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" }) : "—";
  const settlement = doc.settlement_status ?? "open";

  return (
    <>
      <Link href="/purchasing/invoices" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader
        title={<span dir="ltr" data-testid="invoice-number-title">{doc.document_number}</span>}
        description={t("detailDescription")}
        actions={
          <>
            {can("supplier_payments.record") && settlement !== "paid" ? (
              <Link href={`/purchasing/payments/new?supplier_id=${doc.supplier_id}&invoice_id=${doc.id}`} className={buttonClasses({ variant: "secondary" })} data-testid="invoice-pay">
                {t("pay")}
              </Link>
            ) : null}
            {can("supplier_returns.create") ? (
              <Link href={`/purchasing/returns/new?invoice_id=${doc.id}`} className={buttonClasses({ variant: "secondary" })} data-testid="invoice-return">
                {t("returnGoods")}
              </Link>
            ) : null}
            {can("purchases.correct") ? (
              <Link href={`/purchasing/corrections/new?invoice_id=${doc.id}`} className={buttonClasses({ variant: "secondary" })} data-testid="invoice-correct">
                {t("correct")}
              </Link>
            ) : null}
          </>
        }
      />
      <div className="flex flex-col gap-6" data-testid="invoice-detail" data-invoice-id={doc.id}>
        <Card>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Item label={t("supplier")}>
              <Link href={`/purchasing/suppliers/${doc.supplier_id}`} className="font-semibold text-primary-dark hover:underline">
                {doc.supplier?.name ?? doc.supplier_id.slice(0, 8)}
              </Link>
            </Item>
            <Item label={t("invoiceNumber")}><span dir="ltr">{doc.invoice_number ?? "—"}</span></Item>
            <Item label={t("documentDate")}>{day(doc.document_date)}</Item>
            <Item label={t("dueDate")}>{day(doc.due_date)}</Item>
            <Item label={t("currency")}><span dir="ltr">{currency}</span></Item>
            {canCost ? (
              <Item label={t("rateLabel")}><span dir="ltr" data-testid="invoice-rate-value">{doc.exchange_rate ?? "—"}</span></Item>
            ) : null}
            <Item label={t("settlementLabel")}>
              <Badge tone={settlement === "paid" ? "success" : settlement === "partial" ? "warning" : "info"} data-testid="invoice-settlement">
                {t(`settlement.${settlement}`)}
              </Badge>
            </Item>
            <Item label={t("remaining")}>
              <span dir="ltr" data-testid="invoice-remaining">{money(doc.remaining_currency, currency)}</span>
            </Item>
            {canCost ? (
              <>
                <Item label={t("subtotal")}><span dir="ltr">{money(doc.subtotal_currency, currency)}</span></Item>
                <Item label={t("landedInCurrency", { currency })}><span dir="ltr">{money(doc.landed_cost_currency, currency)}</span></Item>
                <Item label={t("total")}><span dir="ltr" data-testid="invoice-total">{money(doc.total_cost, currency)}</span></Item>
                <Item label={t("totalIqd")}><span dir="ltr" data-testid="invoice-total-iqd-value">{money(doc.total_iqd, "IQD")}</span></Item>
              </>
            ) : null}
            <Item label={t("journal")}>
              {doc.journal_entry ? (
                can("ledger.view") ? (
                  <Link href={entryHref(doc.journal_entry.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr">
                    {doc.journal_entry.document_number}
                  </Link>
                ) : (
                  <span dir="ltr">{doc.journal_entry.document_number}</span>
                )
              ) : (
                "—"
              )}
            </Item>
          </dl>
          <p className="mt-3 text-xs text-text-muted">{t("readOnly")}</p>
        </Card>

        <Card className="overflow-x-auto">
          <h2 className="mb-3 text-lg font-bold">{t("lines")}</h2>
          <table className="w-full min-w-[56rem] text-sm" data-testid="invoice-lines">
            <thead className="text-text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("sku")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("packsTimesSize")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("baseQuantity")}</th>
                {canCost ? (
                  <>
                    <th className="px-3 py-2 text-end font-semibold" data-testid="cost-column">{t("costPerPackShort")}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t("costPerBaseUnit")}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t("landedShare")}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t("landedUnitCost")}</th>
                  </>
                ) : null}
                <th className="px-3 py-2 text-start font-semibold">{t("lineLocation")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("lotLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {(doc.items ?? []).map((item) => (
                <tr key={item.id} className="border-t border-border" data-testid="invoice-line-row" data-sku={item.variant?.sku ?? ""}>
                  <td className="px-3 py-2 font-semibold" dir="ltr">{item.variant?.sku ?? item.variant_id.slice(0, 8)}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {formatQuantity(item.purchase_quantity, locale)} × {formatQuantity(item.pack_size, locale)}
                  </td>
                  <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="invoice-line-base">
                    {formatQuantity(item.quantity, locale)} {item.variant?.base_unit ?? ""}
                  </td>
                  {canCost ? (
                    <>
                      <td className="px-3 py-2 text-end" dir="ltr">{money(item.unit_cost, currency)}</td>
                      <td className="px-3 py-2 text-end" dir="ltr" data-testid="invoice-line-base-cost">{money(item.base_unit_cost_currency, currency, Math.max(precisionOf(currency), 2))}</td>
                      <td className="px-3 py-2 text-end" dir="ltr" data-testid="invoice-line-share">{money(item.landed_cost_share_iqd, "IQD", 2)}</td>
                      <td className="px-3 py-2 text-end" dir="ltr">{money(item.landed_unit_cost_iqd, "IQD", 2)}</td>
                    </>
                  ) : null}
                  <td className="px-3 py-2" dir="ltr">{locationLabel(locations.get(item.location_id), item.location?.code ?? "—")}</td>
                  <td className="px-3 py-2">
                    {item.lot_id ? (
                      <Link href={lotHref(item.lot_id)} className="text-primary-dark hover:underline" dir="ltr" data-testid="invoice-lot-link">
                        {item.lot_number ?? t("lotLink")}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {item.expiry_date ? <span className="block text-xs text-text-muted" dir="ltr">{item.expiry_date.slice(0, 10)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {canCost && (doc.landed_costs ?? []).length ? (
          <Card>
            <h2 className="mb-3 text-lg font-bold">{t("landedCosts")}</h2>
            <ul className="text-sm">
              {(doc.landed_costs ?? []).map((cost) => (
                <li key={cost.id} className="flex justify-between border-t border-border py-2 first:border-t-0">
                  <span>{cost.kind}{cost.description ? ` · ${cost.description}` : ""}</span>
                  <span dir="ltr">
                    {money(cost.amount_currency, cost.currency_code)}
                    {cost.currency_code !== "IQD" ? <span className="text-text-muted"> = {money(cost.amount_iqd, "IQD")}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <h2 className="mb-3 text-lg font-bold">{t("settlements")}</h2>
          <ul className="flex flex-col gap-1 text-sm" data-testid="invoice-settlements">
            {(doc.payment_allocations ?? []).map((row) => (
              <li key={row.id} data-testid="invoice-payment">
                {t("paidAmount", { amount: money(row.amount_invoice_currency, currency) })}
                {canCost && row.fx_difference_iqd ? (
                  <span className="text-text-muted"> · {t("fxLine", { amount: money(Math.abs(row.fx_difference_iqd), "IQD"), kind: row.fx_difference_iqd > 0 ? t("fxLoss") : t("fxGain") })}</span>
                ) : null}
              </li>
            ))}
            {(doc.credit_allocations ?? []).map((row) => (
              <li key={row.id}>{t("creditApplied", { amount: money(row.amount_invoice_currency, currency) })}</li>
            ))}
            {(doc.return_documents ?? []).map((row) => (
              <li key={row.id}>
                <span dir="ltr">{row.document_number}</span> · {t("returned", { amount: money(row.total_currency, currency) })}
              </li>
            ))}
            {canCost
              ? (doc.corrections ?? []).map((row) => (
                  <li key={row.id} data-testid="invoice-correction">
                    <span dir="ltr">{row.document_number}</span> · {t(`correctionKind.${row.kind === "late_landed_cost" ? "late_landed_cost" : "cost_correction"}`)} ·{" "}
                    {t("splitLine", { stock: money(row.inventory_iqd, "IQD"), custody: money(row.custody_iqd, "IQD"), sold: money(row.cogs_iqd, "IQD") })}
                  </li>
                ))
              : null}
            {!(doc.payment_allocations?.length || doc.credit_allocations?.length || doc.return_documents?.length || doc.corrections?.length) ? (
              <li className="text-text-muted">{t("noSettlements")}</li>
            ) : null}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
