"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Truck } from "lucide-react";
import { Badge, buttonClasses } from "@/components/ui";
import { restockHref } from "../stock-view";
import { DataTable, TableSearch, type Column, type TableState } from "@/components/table/data-table";
import type { Product } from "@/lib/catalog";
import { availabilityTone, formatQuantity, stockHref } from "@/lib/inventory";
import { useUnitName } from "@/components/catalog/unit-name";
import { Table, TBody, Tr, Td } from "@/components/table/table";

export function SkusView({ rows, state, canRestock = false }: { rows: Product[]; state: TableState; canRestock?: boolean }) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const unitName = useUnitName();
  const nameOf = (product: Product) =>
    (locale === "ar" ? product.name_ar : product.name_en) || product.name_en || product.name_ar || "";

  const columns: Column<Product>[] = [
    {
      key: "product",
      header: t("columns.product"),
      cell: (product) => (
        <div className="flex flex-col items-start gap-2">
          <Link href={`/catalog/products/${product.id}`} className="font-semibold text-primary-dark hover:underline">
            {nameOf(product)}
          </Link>
          {canRestock && product.id ? (
            <Link href={restockHref(product.id)} className={buttonClasses({ size: "sm", variant: "secondary" })} data-testid="skus-restock" data-product-id={product.id}>
            <Truck className="size-4" aria-hidden />
            {t("restock")}
          </Link>
          ) : null}
        </div>
      ),
    },
    {
      key: "skus",
      header: t("columns.skus"),
      cell: (product) => (
        <Table>
          <TBody>
            {(product.variants ?? []).map((variant) => (
              <Tr key={variant.id} data-testid="sku-row" data-sku={variant.sku}>
                <Td className="pe-3 font-semibold" dir="ltr">
                  <Link href={stockHref({ variant_id: variant.id })} className="hover:underline" data-testid="sku-stock-link">
                    {variant.sku}
                  </Link>
                </Td>
                <Td className="pe-3" dir="ltr" data-testid="sku-available">
                  {formatQuantity(variant.available_qty ?? 0, locale)} <span className="text-text-muted">{unitName(variant.base_unit)}</span>
                </Td>
                <Td className="pe-3">
                  <Badge tone={availabilityTone(variant.availability)} data-testid="sku-state" data-state={variant.availability}>
                    {t(`availability.${variant.availability ?? "out_of_stock"}`)}
                  </Badge>
                </Td>
                <Td className="text-text-muted">
                  {variant.low_stock_threshold !== null && variant.low_stock_threshold !== undefined
                    ? t("stock.threshold", { value: formatQuantity(variant.low_stock_threshold, locale), unit: variant.base_unit ?? "" })
                    : t("stock.thresholdDefault")}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
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
