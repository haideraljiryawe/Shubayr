"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { DataTable, TableSearch, type Column, type TableState } from "@/components/table/data-table";
import type { Product } from "@/lib/catalog";
import { availabilityTone, formatQuantity, stockHref } from "@/lib/inventory";

export function SkusView({ rows, state }: { rows: Product[]; state: TableState }) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const nameOf = (product: Product) =>
    (locale === "ar" ? product.name_ar : product.name_en) || product.name_en || product.name_ar || "";

  const columns: Column<Product>[] = [
    {
      key: "product",
      header: t("columns.product"),
      cell: (product) => (
        <Link href={`/catalog/products/${product.id}`} className="font-semibold text-primary-dark hover:underline">
          {nameOf(product)}
        </Link>
      ),
    },
    {
      key: "skus",
      header: t("columns.skus"),
      cell: (product) => (
        <table className="w-full text-sm">
          <tbody>
            {(product.variants ?? []).map((variant) => (
              <tr key={variant.id} data-testid="sku-row" data-sku={variant.sku}>
                <td className="py-1 pe-3 font-semibold" dir="ltr">
                  <Link href={stockHref({ variant_id: variant.id })} className="hover:underline" data-testid="sku-stock-link">
                    {variant.sku}
                  </Link>
                </td>
                <td className="py-1 pe-3 text-end" dir="ltr" data-testid="sku-available">
                  {formatQuantity(variant.available_qty ?? 0, locale)} <span className="text-text-muted">{variant.base_unit}</span>
                </td>
                <td className="py-1 pe-3">
                  <Badge tone={availabilityTone(variant.availability)} data-testid="sku-state" data-state={variant.availability}>
                    {t(`availability.${variant.availability ?? "out_of_stock"}`)}
                  </Badge>
                </td>
                <td className="py-1 text-xs text-text-muted">
                  {variant.low_stock_threshold !== null && variant.low_stock_threshold !== undefined
                    ? t("stock.threshold", { value: formatQuantity(variant.low_stock_threshold, locale), unit: variant.base_unit ?? "" })
                    : t("stock.thresholdDefault")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(product) => product.id ?? ""}
      state={state}
      caption={t("stock.tabSkus")}
      emptyLabel={t("stock.skusEmpty")}
      testId="skus-table"
      toolbar={<TableSearch placeholder={t("stock.searchProducts")} />}
    />
  );
}
