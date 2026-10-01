"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { DataTable, TableFilter, TableSearch, type Column, type TableState } from "@/components/table/data-table";
import { flattenTree, subcategories, type Brand, type Category, type Product } from "@/lib/catalog";
import { formatAmount } from "@/lib/finance/money";

/** Whole units for the dinar; the product carries its currency code. */
export function priceText(value: number | null | undefined, currency: string, locale: string): string {
  return formatAmount(value ?? null, currency, currency === "IQD" ? 0 : 2, locale);
}

export function ProductsTable({
  rows,
  state,
  tree,
  brands,
}: {
  rows: Product[];
  state: TableState;
  tree: Category[];
  brands: Brand[];
}) {
  const t = useTranslations("products");
  const locale = useLocale();
  const nameOf = (item: { name_ar?: string; name_en?: string }) =>
    (locale === "ar" ? item.name_ar : item.name_en) || item.name_en || item.name_ar || "";
  const nodes = new Map(flattenTree(tree).map(({ category }) => [category.id, category]));

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: t("columns.name"),
      cell: (product) => (
        <Link
          href={`/catalog/products/${product.id}`}
          className="font-semibold text-primary-dark hover:underline"
          data-testid="product-link"
        >
          {nameOf(product)}
        </Link>
      ),
    },
    {
      key: "category",
      header: t("columns.category"),
      cell: (product) => {
        const category = nodes.get(product.category_id);
        const department = category?.parent_id ? nodes.get(category.parent_id) : undefined;
        return category ? (
          <span className="text-sm">
            {department ? <span className="text-text-muted">{nameOf(department)} › </span> : null}
            {nameOf(category)}
          </span>
        ) : (
          "—"
        );
      },
    },
    {
      key: "brand",
      header: t("columns.brand"),
      cell: (product) => (product.brand ? nameOf(product.brand) : <span className="text-text-muted">—</span>),
    },
    {
      key: "skus",
      header: t("columns.skus"),
      cell: (product) => (
        <span className="text-sm" data-testid="product-sku-count">
          {t("skuCount", { count: product.variants?.length ?? 0 })}
          {(product.variants ?? []).some((variant) => variant.pricing_mode === "linked") ? (
            <Badge tone="info" className="ms-2">
              {t("linkedBadge")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "price",
      header: t("columns.price"),
      sortKey: "price",
      cell: (product) => {
        const prices = (product.variants ?? []).map((variant) => variant.effective_price ?? 0);
        const range = new Set(prices).size > 1;
        return (
          <span dir="ltr" className="whitespace-nowrap">
            {range ? `${t("from")} ` : ""}
            {priceText(product.effective_price, product.currency ?? "IQD", locale)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (product) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={product.status === "active" ? "success" : product.status === "archived" ? "danger" : "neutral"}>
            {t(`status.${product.status ?? "hidden"}`)}
          </Badge>
          <Badge tone={product.published_at ? "info" : "warning"}>
            {product.published_at ? t("published") : t("unpublished")}
          </Badge>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(product) => product.id ?? ""}
      state={state}
      caption={t("title")}
      emptyLabel={t("empty")}
      testId="products-table"
      toolbar={
        <>
          <TableSearch placeholder={t("search")} />
          <TableFilter
            name="category_id"
            label={t("columns.category")}
            options={[
              { value: "", label: t("allCategories") },
              ...subcategories(tree).flatMap((group) =>
                group.children.map((child) => ({
                  value: child.id ?? "",
                  label: `${nameOf(group.department)} › ${nameOf(child)}`,
                })),
              ),
            ]}
          />
          <TableFilter
            name="brand_id"
            label={t("columns.brand")}
            options={[
              { value: "", label: t("allBrands") },
              ...brands.map((brand) => ({ value: brand.id, label: nameOf(brand) })),
            ]}
          />
        </>
      }
    />
  );
}
