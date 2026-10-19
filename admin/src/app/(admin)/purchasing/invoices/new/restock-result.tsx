"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, FileText } from "lucide-react";
import { buttonClasses, Card } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { formatQuantity, stockTotals, type StockTotals } from "@/lib/inventory";
import type { PurchaseInvoice } from "@/lib/purchasing";
import type { RestockPrefill } from "./invoice-form";

/**
 * After a restock posts: what each restocked SKU now holds (read again from
 * the lot balances), with the way back to the product and to the invoice.
 */
export function RestockResult({ invoice, restock }: { invoice: PurchaseInvoice; restock: RestockPrefill }) {
  const t = useTranslations("purchasing.invoice.restock");
  const locale = useLocale();
  const added = new Map<string, number>();
  for (const item of invoice.items ?? []) added.set(item.variant_id, (added.get(item.variant_id) ?? 0) + item.quantity);
  const variantIds = [...added.keys()];
  const [totals, setTotals] = useState<Record<string, StockTotals> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      variantIds.map(async (id) => {
        const page = await unwrap(browserApi.GET("/admin/inventory/balances", { params: { query: { variant_id: id, per_page: 100 } } }));
        return [id, stockTotals(page.data)] as const;
      }),
    ).then(
      (entries) => {
        if (!cancelled) setTotals(Object.fromEntries(entries));
      },
      () => {
        if (!cancelled) setTotals({});
      },
    );
    return () => {
      cancelled = true;
    };
    // The posted invoice doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id]);

  const skuOf = (id: string) => restock.lines.find((line) => line.sku.variantId === id)?.sku.sku ?? id.slice(0, 8);

  return (
    <Card className="flex flex-col gap-4 border-success/40" data-testid="restock-result">
      <div>
        <h2 className="text-lg font-bold">{t("doneTitle")}</h2>
        <p className="text-sm text-text-muted">{t("doneBody", { name: restock.productName })}</p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-text-muted">
          <tr>
            <th className="px-3 py-1 text-start font-semibold">{t("columns.sku")}</th>
            <th className="px-3 py-1 text-end font-semibold">{t("columns.added")}</th>
            <th className="px-3 py-1 text-end font-semibold">{t("columns.onHand")}</th>
            <th className="px-3 py-1 text-end font-semibold">{t("columns.available")}</th>
          </tr>
        </thead>
        <tbody>
          {variantIds.map((id) => (
            <tr key={id} className="border-t border-border" data-testid="restock-result-row" data-sku={skuOf(id)}>
              <td className="px-3 py-2 font-semibold" dir="ltr">{skuOf(id)}</td>
              <td className="px-3 py-2 text-end" dir="ltr" data-testid="restock-result-added">+{formatQuantity(added.get(id), locale)}</td>
              <td className="px-3 py-2 text-end" dir="ltr" data-testid="restock-result-on-hand">
                {totals ? (totals[id] ? formatQuantity(totals[id].onHand, locale) : "—") : "…"}
              </td>
              <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="restock-result-available">
                {totals ? (totals[id] ? formatQuantity(totals[id].available, locale) : "—") : "…"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2">
        <Link href={`/catalog/products/${restock.productId}`} className={buttonClasses({})} data-testid="restock-back-to-product">
          <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
          {t("backToProduct")}
        </Link>
        <Link href={`/purchasing/invoices/${invoice.id}`} className={buttonClasses({ variant: "secondary" })} data-testid="restock-open-invoice">
          <FileText className="size-4" aria-hidden />
          {t("openInvoice", { number: invoice.document_number })}
        </Link>
      </div>
    </Card>
  );
}
