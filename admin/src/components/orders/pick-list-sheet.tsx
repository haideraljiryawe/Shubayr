"use client";

import { useLocale, useTranslations } from "next-intl";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { formatQuantity } from "@/lib/inventory";
import { batchPickRows, type PickList } from "@/lib/orders";

/**
 * Pick lists ready for paper: one walking-order table for the whole batch
 * (warehouse → location → product, so the picker passes each shelf once),
 * with the order number on every line and a box to tick. The shell's menu
 * and header disappear when printing (print:hidden), the table keeps its
 * borders, and the page stays right-to-left in Arabic.
 */
export function PickListSheet({ lists, generatedAt }: { lists: PickList[]; generatedAt: string }) {
  const t = useTranslations("orders.pickList");
  const locale = useLocale();
  const dateTime = useStoreDateTime();
  const rows = batchPickRows(lists, locale);
  const name = (row: (typeof rows)[number]) => (locale === "ar" ? row.product_name_ar : row.product_name_en) ?? "";

  return (
    <div className="flex flex-col gap-4 print:gap-2" data-testid="pick-list-sheet">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold print:text-xl">{lists.length > 1 ? t("batchTitle", { count: lists.length }) : t("title")}</h1>
          <p className="text-sm text-text-muted print:text-black">
            {t("generated", { at: dateTime(generatedAt) })} · {lists.map((list) => list.order_number).join("، ")}
          </p>
        </div>
        <Button onClick={() => window.print()} className="print:hidden" data-testid="pick-list-print">
          <Printer className="size-4" aria-hidden />
          {t("print")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <table className="w-full border-collapse text-sm print:text-xs" data-testid="pick-list-table">
          <thead>
            <tr className="bg-card print:bg-transparent">
              <th className="border border-border px-2 py-1.5 text-start font-semibold print:border-black">{t("columns.location")}</th>
              <th className="border border-border px-2 py-1.5 text-start font-semibold print:border-black">{t("columns.product")}</th>
              <th className="border border-border px-2 py-1.5 text-start font-semibold print:border-black">{t("columns.lot")}</th>
              <th className="border border-border px-2 py-1.5 text-end font-semibold print:border-black">{t("columns.quantity")}</th>
              <th className="border border-border px-2 py-1.5 text-start font-semibold print:border-black">{t("columns.order")}</th>
              <th className="w-10 border border-border px-2 py-1.5 text-center font-semibold print:border-black">{t("columns.picked")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.id ?? index}`} className="break-inside-avoid" data-testid="pick-row" data-location={row.location_code} data-order={row.orderNumber}>
                <td className="border border-border px-2 py-1.5 font-semibold print:border-black" dir="ltr">
                  {row.warehouse_code} · {row.location_code}
                </td>
                <td className="border border-border px-2 py-1.5 print:border-black">{name(row)}</td>
                <td className="border border-border px-2 py-1.5 print:border-black" dir="ltr">
                  {row.lot_number ?? "—"}
                  {row.expiry_date ? <span className="block text-xs text-text-muted print:text-black">{row.expiry_date.slice(0, 10)}</span> : null}
                </td>
                <td className="border border-border px-2 py-1.5 text-end font-bold print:border-black" dir="ltr" data-testid="pick-quantity">
                  {formatQuantity(row.quantity, locale)}
                </td>
                <td className="border border-border px-2 py-1.5 print:border-black" dir="ltr">{row.orderNumber}</td>
                <td className="border border-border px-2 py-1.5 text-center print:border-black">
                  <span className="inline-block size-4 border border-current" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
