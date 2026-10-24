"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Copy, EyeOff, ImageOff, ListChecks, Send, Trash2, X, XCircle } from "lucide-react";
import { Alert, Badge, Button, Select } from "@/components/ui";
import { DataTable, TableFilter, TableSearch, type Column, type TableState } from "@/components/table/data-table";
import { ProductDeleteDialog, ProductDeleteOutcome } from "@/components/catalog/product-delete";
import type { DeleteSummary } from "@/lib/product-delete";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, describeError } from "@/lib/api/errors";
import { flattenTree, subcategories, type Brand, type Category, type Product } from "@/lib/catalog";
import { OperationKey } from "@/lib/finance/cash-receipts";
import { formatAmount } from "@/lib/finance/money";
import { availabilityTone } from "@/lib/inventory";
import {
  BULK_LIMIT,
  MAX_PER_PAGE,
  STATUS_FILTERS,
  STOCK_FILTERS,
  bulkBody,
  bulkOutcome,
  bulkTargets,
  primaryImage,
  type BulkAction,
  type BulkOutcome,
  type ProductListQuery,
} from "@/lib/product-list";

/** Whole units for the dinar; the product carries its currency code. */
export function priceText(value: number | null | undefined, currency: string, locale: string): string {
  return formatAmount(value ?? null, currency, currency === "IQD" ? 0 : 2, locale);
}

/**
 * Every product, a page at a time from the server: searched (names, SKU,
 * barcode), filtered by category, brand, status, stock and picture, and
 * sorted — all in the database. Rows can be selected on this page, or every
 * matching product up to the bulk limit (500), for one bulk change — show,
 * hide, move to a subcategory, change brand — applied in one idempotent
 * transaction; the result is listed product by product, and the ones the API
 * refused (showing without an approved price, say) stay selected.
 */
export function ProductsTable({
  rows,
  state,
  query,
  tree,
  brands,
  canBulkEdit,
}: {
  rows: Product[];
  state: TableState;
  /** The list's filters, search and sort as API parameters (for "select all matching"). */
  query: ProductListQuery;
  tree: Category[];
  brands: Brand[];
  /** Product changes need prices.change as well as catalog.products. */
  canBulkEdit: boolean;
}) {
  const t = useTranslations("products");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const nameOf = (item: { name_ar?: string; name_en?: string }) =>
    (locale === "ar" ? item.name_ar : item.name_en) || item.name_en || item.name_ar || "";
  const nodes = new Map(flattenTree(tree).map(({ category }) => [category.id, category]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Every product matching the list, read for "select all matching"; kept
  // only while the list's query is the one it was read for.
  const queryKey = JSON.stringify(query);
  const [matching, setMatching] = useState<{ key: string; products: Product[] } | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [brandTo, setBrandTo] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteSummary, setDeleteSummary] = useState<DeleteSummary | null>(null);
  // One operation id per exact change: a double click or a retry after a lost
  // answer replays it instead of applying it twice.
  const operation = useRef(new OperationKey(() => `bulk-${crypto.randomUUID()}`));
  const pool = matching?.key === queryKey ? matching.products : rows;
  const known = new Map(pool.concat(rows).map((product) => [product.id ?? "", product]));
  const pageIds = rows.map((product) => product.id ?? "").filter(Boolean);
  const chosen = pool.filter((product) => product.id && selected.has(product.id));
  const allChosen = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const reachable = Math.min(state.total, BULK_LIMIT);
  const busy = running || loadingAll;
  const canSelectMatching = allChosen && state.total > pageIds.length && chosen.length < reachable;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Reads every matching product (at most the bulk limit) and selects them. */
  async function selectMatching() {
    setLoadingAll(true);
    setProblem(null);
    try {
      const pages = Math.ceil(reachable / MAX_PER_PAGE);
      const results = await Promise.all(
        Array.from({ length: pages }, (_, index) =>
          unwrap(browserApi.GET("/admin/products", { params: { query: { ...query, page: index + 1, per_page: MAX_PER_PAGE } } })),
        ),
      );
      const products = results.flatMap((page) => page.data).slice(0, BULK_LIMIT);
      setMatching({ key: queryKey, products });
      setSelected(new Set(products.map((product) => product.id ?? "").filter(Boolean)));
    } catch (cause) {
      setProblem(cause instanceof ApiError ? describeError(tErrors, cause) : t("bulk.failedUnknown"));
    } finally {
      setLoadingAll(false);
    }
  }

  function clearSelection() {
    setSelected(new Set());
    setMatching(null);
  }

  async function apply(action: BulkAction) {
    const targets = bulkTargets(chosen, action);
    setOutcome(null);
    setProblem(null);
    if (targets.length === 0) {
      setOutcome({ done: 0, failed: 0, lines: [] });
      return;
    }
    const request = bulkBody(action, targets.map((product) => product.id ?? ""));
    const body = { ...request, operation_id: operation.current.id(JSON.stringify(request)) };
    setRunning(true);
    try {
      const result = await unwrap(browserApi.POST("/admin/products/bulk", { body }));
      operation.current.reset();
      const report = bulkOutcome(
        result,
        (id) => {
          const product = known.get(id);
          return product ? nameOf(product) : id;
        },
        (code) => (code && tErrors.has(`codes.${code}`) ? tErrors(`codes.${code}`) : t("bulk.failedUnknown")),
      );
      setOutcome(report);
      setSelected(new Set(report.lines.filter((line) => !line.ok).map((line) => line.id)));
      if (report.failed === 0) setMatching(null);
      router.refresh();
    } catch (cause) {
      // Nothing was applied (one transaction); the same click retries the same operation.
      setProblem(cause instanceof ApiError ? describeError(tErrors, cause) : t("bulk.failedUnknown"));
    } finally {
      setRunning(false);
    }
  }

  const selectColumn: Column<Product> = {
    key: "select",
    header: (
      <input
        type="checkbox"
        aria-label={t("bulk.selectPage")}
        checked={allChosen}
        disabled={busy || pageIds.length === 0}
        onChange={(event) => (event.target.checked ? setSelected(new Set(pageIds)) : clearSelection())}
        data-testid="products-select-all"
      />
    ),
    className: "w-10",
    cell: (product) => (
      <input
        type="checkbox"
        aria-label={t("bulk.selectOne", { name: nameOf(product) })}
        checked={selected.has(product.id ?? "")}
        disabled={busy}
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
      sortKey: "name",
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
          <span className="text-body">
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
      sortKey: "sku",
      // Visible on a tablet: it carries the SKU sort.
      className: "hidden md:table-cell",
      cell: (product) => (
        <span className="text-body" data-testid="product-sku-count">
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
      align: "end",
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
      {canBulkEdit && (chosen.length > 0 || busy) ? (
        <div
          className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-surface px-4 py-3 shadow-sm"
          data-testid="bulk-bar"
          role="region"
          aria-label={t("bulk.label")}
        >
          <span className="me-2 text-label" data-testid="bulk-count" aria-live="polite">
            {running ? t("bulk.applying", { count: chosen.length }) : t("bulk.selected", { count: chosen.length })}
          </span>
          {canSelectMatching ? (
            <Button size="sm" variant="ghost" onClick={() => void selectMatching()} disabled={busy} data-testid="bulk-select-matching">
              <ListChecks className="size-4" aria-hidden />
              {loadingAll
                ? t("bulk.selectingMatching")
                : state.total > BULK_LIMIT
                  ? t("bulk.selectFirstMatching", { count: BULK_LIMIT, total: state.total })
                  : t("bulk.selectMatching", { count: state.total })}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => void apply({ kind: "publish" })} disabled={busy} data-testid="bulk-publish">
            <Send className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("bulk.publish")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void apply({ kind: "hide" })} disabled={busy} data-testid="bulk-hide">
            <EyeOff className="size-4" aria-hidden />
            {t("bulk.hide")}
          </Button>
          <span className="flex items-center gap-1">
            <Select
              className="h-9 w-auto min-w-40"
              value={moveTo}
              onValueChange={(value) => setMoveTo(value)}
              aria-label={t("bulk.moveTo")}
              disabled={busy}
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
              disabled={busy || !moveTo}
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
              onValueChange={(value) => setBrandTo(value)}
              aria-label={t("bulk.brandTo")}
              disabled={busy}
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
              disabled={busy || !brandTo}
              onClick={() => void apply({ kind: "brand", brandId: brandTo === "none" ? null : brandTo })}
              data-testid="bulk-brand-apply"
            >
              {t("bulk.apply")}
            </Button>
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="text-error-dark"
            disabled={busy}
            onClick={() => {
              setDeleteSummary(null);
              setOutcome(null);
              setDeleting(true);
            }}
            data-testid="bulk-delete"
          >
            <Trash2 className="size-4" aria-hidden />
            {t("delete.bulk")}
          </Button>
          <Button size="sm" variant="ghost" className="ms-auto" disabled={busy} onClick={clearSelection} data-testid="bulk-clear">
            <X className="size-4" aria-hidden />
            {t("bulk.clear")}
          </Button>
        </div>
      ) : null}

      <ProductDeleteDialog
        open={deleting}
        products={chosen.map((product) => ({ id: product.id ?? "", name: nameOf(product) }))}
        onClose={() => setDeleting(false)}
        onDone={(summary) => {
          setDeleteSummary(summary);
          clearSelection();
          router.refresh();
        }}
      />
      {deleteSummary ? <ProductDeleteOutcome summary={deleteSummary} /> : null}

      {problem ? (
        <Alert tone="danger" data-testid="bulk-problem">
          {t("bulk.problem")} {problem}
        </Alert>
      ) : null}

      {outcome ? (
        <Alert tone={outcome.failed ? "danger" : "success"} data-testid="bulk-outcome">
          <p className="font-semibold">{t("bulk.done", { count: outcome.done })}</p>
          {outcome.failed ? <p className="mt-1">{t("bulk.failed", { count: outcome.failed })}</p> : null}
          {outcome.lines.length ? (
            <details className="mt-2" open={outcome.failed > 0 && outcome.lines.length <= 20}>
              <summary className="cursor-pointer text-label">{t("bulk.perProduct", { count: outcome.lines.length })}</summary>
              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pe-2 text-body" data-testid="bulk-results">
                {outcome.lines.map((line) => (
                  <li key={line.id} className="flex items-start gap-2" data-testid="bulk-result" data-status={line.ok ? "updated" : "error"}>
                    {line.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label={t("bulk.updated")} />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-error" aria-label={t("bulk.notUpdated")} />
                    )}
                    <span>
                      <Link href={`/catalog/products/${line.id}`} className="font-semibold hover:underline">
                        {line.name}
                      </Link>
                      {line.message ? <>: {line.message}</> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
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
                { value: "", label: t("filters.allButArchived") },
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
