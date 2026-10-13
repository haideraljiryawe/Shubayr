"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Copy, EyeOff, ImageOff, Send, X } from "lucide-react";
import { Alert, Badge, Button, Select } from "@/components/ui";
import { DataTable, TableFilter, TableSearch, type Column, type TableState } from "@/components/table/data-table";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { flattenTree, subcategories, type Brand, type Category, type Product } from "@/lib/catalog";
import { formatAmount } from "@/lib/finance/money";
import { availabilityTone } from "@/lib/inventory";
import {
  STATUS_FILTERS,
  STOCK_FILTERS,
  bulkTargets,
  primaryImage,
  type BulkAction,
  type BulkOutcome,
} from "@/lib/product-list";

/** Whole units for the dinar; the product carries its currency code. */
export function priceText(value: number | null | undefined, currency: string, locale: string): string {
  return formatAmount(value ?? null, currency, currency === "IQD" ? 0 : 2, locale);
}

/**
 * Every product, a page at a time from the server, searched and filtered by
 * category, brand, status and stock. Rows can be selected (this page) for a
 * bulk change — publish, hide, move to a subcategory, change brand — applied
 * in one idempotent transaction. A row the API refuses (publishing without an
 * approved price, say) is reported by name and stays selected.
 */
export function ProductsTable({
  rows,
  state,
  tree,
  brands,
  canBulkEdit,
}: {
  rows: Product[];
  state: TableState;
  tree: Category[];
  brands: Brand[];
  /** Product changes need prices.change as well as catalog.products. */
  canBulkEdit: boolean;
}) {
  const t = useTranslations("products");
  const locale = useLocale();
  const router = useRouter();
  const nameOf = (item: { name_ar?: string; name_en?: string }) =>
    (locale === "ar" ? item.name_ar : item.name_en) || item.name_en || item.name_ar || "";
  const nodes = new Map(flattenTree(tree).map(({ category }) => [category.id, category]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [brandTo, setBrandTo] = useState("");
  const pageIds = rows.map((product) => product.id ?? "").filter(Boolean);
  // A selection only ever covers the rows on screen (after paging or a filter
  // change the rows that left simply drop out).
  const chosen = rows.filter((product) => product.id && selected.has(product.id));
  const allChosen = pageIds.length > 0 && chosen.length === pageIds.length;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function apply(action: BulkAction) {
    const targets = bulkTargets(chosen, action);
    setOutcome(null);
    setRunning({ done: 0, total: targets.length });
    if (targets.length === 0) {
      setRunning(null);
      setOutcome({ done: 0, failed: [] });
      return;
    }
    const common = {
      operation_id: crypto.randomUUID(),
      ids: targets.map((product) => product.id ?? ""),
    };
    const body =
      action.kind === "category"
        ? { ...common, action: "set_category" as const, category_id: action.categoryId }
        : action.kind === "brand"
          ? { ...common, action: "set_brand" as const, brand_id: action.brandId }
          : { ...common, action: action.kind as "publish" | "hide" };
    try {
      const result = await unwrap(browserApi.POST("/admin/products/bulk", { body }));
      const byId = new Map(targets.map((product) => [product.id ?? "", product]));
      const failed = result.results.flatMap((item) => {
        if (item.status !== "error") return [];
        const product = byId.get(item.id);
        return [{
          id: item.id,
          name: product ? nameOf(product) : item.id,
          message: item.message ?? item.code ?? t("bulk.failedUnknown"),
        }];
      });
      setRunning(null);
      setOutcome({ done: result.results.length - failed.length, failed });
      setSelected(new Set(failed.map((item) => item.id)));
      router.refresh();
    } catch (cause) {
      const failed = targets.map((product) => ({
        id: product.id ?? "",
        name: nameOf(product),
        message: cause instanceof ApiError ? cause.message : t("bulk.failedUnknown"),
      }));
      setRunning(null);
      setOutcome({ done: 0, failed });
    }
  }

  const selectColumn: Column<Product> = {
    key: "select",
    header: (
      <input
        type="checkbox"
        aria-label={t("bulk.selectPage")}
        checked={allChosen}
        disabled={running !== null || pageIds.length === 0}
        onChange={(event) => setSelected(event.target.checked ? new Set(pageIds) : new Set())}
        data-testid="products-select-all"
      />
    ),
    className: "w-10",
    cell: (product) => (
      <input
        type="checkbox"
        aria-label={t("bulk.selectOne", { name: nameOf(product) })}
        checked={selected.has(product.id ?? "")}
        disabled={running !== null}
        onChange={(event) => toggle(product.id ?? "", event.target.checked)}
        data-testid="product-select"
      />
    ),
  };

  const columns: Column<Product>[] = [
    ...(canBulkEdit ? [selectColumn] : []),
    {
      key: "name",
      header: t("columns.name"),
      cell: (product) => {
        const image = primaryImage(product);
        return (
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- API media URLs
                <img src={image} alt="" className="size-full object-cover" loading="lazy" data-testid="product-thumb" />
              ) : (
                <ImageOff className="size-4 text-text-muted" aria-label={t("noImage")} />
              )}
            </span>
            <Link
              href={`/catalog/products/${product.id}`}
              className="font-semibold text-primary-dark hover:underline"
              data-testid="product-link"
            >
              {nameOf(product)}
            </Link>
          </div>
        );
      },
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
      // On a tablet the status and actions matter more; the brand stays a filter.
      className: "hidden lg:table-cell",
      cell: (product) => (product.brand ? nameOf(product.brand) : <span className="text-text-muted">—</span>),
    },
    {
      key: "skus",
      header: t("columns.skus"),
      className: "hidden xl:table-cell",
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
      key: "stock",
      header: t("columns.stock"),
      cell: (product) => (
        <Badge tone={availabilityTone(product.availability)} className="whitespace-nowrap" data-testid="product-availability">
          {t(`filters.stock.${product.availability ?? "out_of_stock"}`)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (product) => (
        <div className="flex flex-wrap gap-1" data-testid="product-status-cell" data-status={product.status}>
          <Badge
            tone={product.status === "active" ? "success" : product.status === "archived" ? "danger" : "neutral"}
            className="whitespace-nowrap"
          >
            {t(`status.${product.status ?? "hidden"}`)}
          </Badge>
          {product.status === "active" && !product.published_at ? <Badge tone="warning">{t("unpublished")}</Badge> : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columns.actions")}</span>,
      cell: (product) => (
        <Link
          href={`/catalog/products/new?from=${product.id}`}
          className="inline-flex size-9 items-center justify-center rounded-md text-text hover:bg-card"
          aria-label={t("duplicateNamed", { name: nameOf(product) })}
          title={t("duplicate")}
          data-testid="product-row-duplicate"
        >
          <Copy className="size-4" aria-hidden />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {canBulkEdit && (chosen.length > 0 || running) ? (
        <div
          className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-surface px-4 py-3 shadow-sm"
          data-testid="bulk-bar"
          role="region"
          aria-label={t("bulk.label")}
        >
          <span className="me-2 text-sm font-semibold" data-testid="bulk-count" aria-live="polite">
            {running ? t("bulk.running", { done: running.done, total: running.total }) : t("bulk.selected", { count: chosen.length })}
          </span>
          <Button size="sm" onClick={() => void apply({ kind: "publish" })} disabled={running !== null} data-testid="bulk-publish">
            <Send className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("bulk.publish")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void apply({ kind: "hide" })} disabled={running !== null} data-testid="bulk-hide">
            <EyeOff className="size-4" aria-hidden />
            {t("bulk.hide")}
          </Button>
          <span className="flex items-center gap-1">
            <Select
              className="h-9 w-auto min-w-40"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              aria-label={t("bulk.moveTo")}
              disabled={running !== null}
              data-testid="bulk-category"
            >
              <option value="">{t("bulk.moveTo")}</option>
              {subcategories(tree).map((group) => (
                <optgroup key={group.department.id} label={nameOf(group.department)}>
                  {group.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {nameOf(child)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              disabled={running !== null || !moveTo}
              onClick={() => void apply({ kind: "category", categoryId: moveTo })}
              data-testid="bulk-category-apply"
            >
              {t("bulk.apply")}
            </Button>
          </span>
          <span className="flex items-center gap-1">
            <Select
              className="h-9 w-auto min-w-40"
              value={brandTo}
              onChange={(e) => setBrandTo(e.target.value)}
              aria-label={t("bulk.brandTo")}
              disabled={running !== null}
              data-testid="bulk-brand"
            >
              <option value="">{t("bulk.brandTo")}</option>
              <option value="none">{t("noBrand")}</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {nameOf(brand)}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              disabled={running !== null || !brandTo}
              onClick={() => void apply({ kind: "brand", brandId: brandTo === "none" ? null : brandTo })}
              data-testid="bulk-brand-apply"
            >
              {t("bulk.apply")}
            </Button>
          </span>
          <Button size="sm" variant="ghost" className="ms-auto" disabled={running !== null} onClick={() => setSelected(new Set())} data-testid="bulk-clear">
            <X className="size-4" aria-hidden />
            {t("bulk.clear")}
          </Button>
        </div>
      ) : null}

      {outcome ? (
        <Alert tone={outcome.failed.length ? "danger" : "success"} data-testid="bulk-outcome">
          <p className="font-semibold">{t("bulk.done", { count: outcome.done })}</p>
          {outcome.failed.length ? (
            <>
              <p className="mt-1">{t("bulk.failed", { count: outcome.failed.length })}</p>
              <ul className="mt-1 list-disc ps-5">
                {outcome.failed.map((item) => (
                  <li key={item.id}>
                    <span className="font-semibold">{item.name}</span>: {item.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Alert>
      ) : null}

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
            <TableFilter
              name="status"
              label={t("columns.status")}
              options={[
                { value: "", label: t("filters.allStatuses") },
                ...STATUS_FILTERS.map((value) => ({ value, label: t(`status.${value}`) })),
              ]}
            />
            <TableFilter
              name="stock"
              label={t("columns.stock")}
              options={[
                { value: "", label: t("filters.allStock") },
                ...STOCK_FILTERS.map((value) => ({ value, label: t(`filters.stock.${value}`) })),
              ]}
            />
            <TableFilter
              name="image"
              label={t("filters.image.label")}
              options={[
                { value: "", label: t("filters.image.all") },
                { value: "with", label: t("filters.image.with") },
                { value: "without", label: t("filters.image.without") },
              ]}
            />
          </>
        }
      />
    </div>
  );
}
