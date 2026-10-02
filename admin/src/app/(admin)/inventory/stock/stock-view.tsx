"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { DataTable, TableFilter, useTableUrl, type Column, type TableState } from "@/components/table/data-table";
import {
  availabilityTone,
  formatQuantity,
  isExpired,
  lotHref,
  stockHref,
  toMilli,
  type Availability,
  type Balance,
  type LocationInfo,
  type StockTotals,
  type Warehouse,
} from "@/lib/inventory";

export interface SkuSummary {
  variantId: string;
  sku: string | null;
  totals: StockTotals;
  /** False when the SKU has more rows than the summary reads. */
  complete: boolean;
  /** The catalog's own view of the SKU (needs catalog.products). */
  catalog: {
    productId: string;
    productName: { ar: string; en: string };
    availability: Availability | null;
    availableQty: number | null;
    threshold: number | null;
    baseUnit: string;
  } | null;
}

export function StockView({
  rows,
  state,
  warehouses,
  locations,
  filters,
  summary,
  today,
}: {
  rows: Balance[];
  state: TableState;
  warehouses: Warehouse[];
  locations: Record<string, LocationInfo>;
  filters: Record<string, string>;
  summary: SkuSummary | null;
  today: string;
}) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const { update } = useTableUrl();
  const qty = (value: number | null | undefined) => formatQuantity(value, locale);
  const warehouseLocations = Object.values(locations).filter(
    (info) => !filters.warehouse_id || info.warehouseId === filters.warehouse_id,
  );

  const columns: Column<Balance>[] = [
    {
      key: "sku",
      header: t("columns.sku"),
      cell: (row) => (
        <Link href={stockHref({ variant_id: row.variant_id })} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="stock-sku">
          {row.sku}
        </Link>
      ),
    },
    {
      key: "lot",
      header: t("columns.lot"),
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <Link href={lotHref(row.batch_id)} className="text-primary-dark hover:underline" dir="ltr" data-testid="stock-lot">
            {row.lot_number ?? t("noLotNumber")}
          </Link>
          {row.expiry_date ? (
            <span className="text-xs text-text-muted" dir="ltr">
              {t("expires", { date: row.expiry_date.slice(0, 10) })}
            </span>
          ) : null}
          {isExpired(row.expiry_date, today) ? (
            <Badge tone="danger" data-testid="stock-expired">
              {t("expired")}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "location",
      header: t("columns.location"),
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          <Link href={stockHref({ location_id: row.location_id })} className="hover:underline" dir="ltr">
            {locations[row.location_id]?.warehouseCode ?? ""} · {row.location_code}
          </Link>
          {row.is_sellable ? null : (
            <Badge tone="warning" data-testid="stock-non-sellable">
              {t("nonSellable")}
            </Badge>
          )}
        </div>
      ),
    },
    { key: "onHand", header: t("columns.onHand"), className: "text-end", cell: (row) => <span dir="ltr" data-testid="stock-on-hand">{qty(row.quantity)}</span> },
    { key: "reserved", header: t("columns.reserved"), className: "text-end", cell: (row) => <span dir="ltr" data-testid="stock-reserved">{qty(row.reserved)}</span> },
    {
      key: "available",
      header: t("columns.available"),
      className: "text-end",
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-1">
          {row.is_sellable && toMilli(row.available) <= 0 ? (
            <Badge tone="danger" data-testid="stock-row-out">
              {t("rowOut")}
            </Badge>
          ) : null}
          <span className="font-semibold" dir="ltr" data-testid="stock-available">
            {qty(row.available)}
          </span>
        </span>
      ),
    },
    {
      key: "custody",
      header: <span title={t("custodyHint")}>{t("columns.custody")}</span>,
      className: "text-end",
      cell: (row) => <span dir="ltr" className="text-text-muted" data-testid="stock-custody">{qty(row.custody)}</span>,
    },
  ];

  const chips: Array<{ key: string; label: string }> = [];
  if (filters.variant_id) chips.push({ key: "variant_id", label: t("stock.skuChip", { sku: summary?.sku ?? filters.variant_id.slice(0, 8) }) });
  if (filters.batch_id) {
    const lot = rows.find((row) => row.batch_id === filters.batch_id);
    chips.push({ key: "batch_id", label: t("stock.lotChip", { lot: lot?.lot_number ?? filters.batch_id.slice(0, 8) }) });
  }

  return (
    <div className="flex flex-col gap-6">
      {summary ? <SummaryCard summary={summary} /> : null}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => `${row.batch_id}:${row.location_id}`}
        state={state}
        caption={t("stock.title")}
        emptyLabel={t("stock.empty")}
        testId="stock-table"
        toolbar={
          <>
            <TableFilter
              name="warehouse_id"
              label={t("filters.warehouse")}
              options={[
                { value: "", label: t("filters.allWarehouses") },
                ...warehouses.map((warehouse) => ({ value: warehouse.id ?? "", label: `${warehouse.code} · ${warehouse.name}` })),
              ]}
            />
            <TableFilter
              name="location_id"
              label={t("filters.location")}
              options={[
                { value: "", label: t("filters.allLocations") },
                ...warehouseLocations.map((info) => ({
                  value: info.id,
                  label: `${info.warehouseCode} · ${info.code}${info.sellable ? "" : ` (${t("nonSellable")})`}`,
                })),
              ]}
            />
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="inline-flex h-11 cursor-pointer items-center gap-1 self-end rounded-full bg-info/10 px-3 text-sm font-semibold text-info-dark"
                onClick={() => update({ [chip.key]: null })}
                data-testid={`chip-${chip.key}`}
              >
                <span dir="ltr">{chip.label}</span>
                <X className="size-4" aria-label={t("filters.clear")} />
              </button>
            ))}
          </>
        }
      />
    </div>
  );
}

function SummaryCard({ summary }: { summary: SkuSummary }) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const qty = (value: number | null | undefined) => formatQuantity(value, locale);
  const catalog = summary.catalog;
  const tiles = [
    { key: "onHand", value: summary.totals.onHand },
    { key: "reserved", value: summary.totals.reserved },
    { key: "available", value: summary.totals.available },
    { key: "custody", value: summary.totals.custody },
    { key: "nonSellableQty", value: summary.totals.nonSellable },
  ] as const;

  return (
    <Card className="flex flex-col gap-4" data-testid="sku-summary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" dir="ltr">{summary.sku ?? summary.variantId.slice(0, 8)}</h2>
          {catalog ? (
            <Link href={`/catalog/products/${catalog.productId}`} className="text-sm text-primary-dark hover:underline">
              {(locale === "ar" ? catalog.productName.ar : catalog.productName.en) || catalog.productName.en}
            </Link>
          ) : null}
        </div>
        {catalog?.availability ? (
          <div className="flex flex-col items-end gap-1">
            <Badge tone={availabilityTone(catalog.availability)} data-testid="sku-availability" data-state={catalog.availability}>
              {t(`availability.${catalog.availability}`)}
            </Badge>
            <span className="text-xs text-text-muted">
              {catalog.threshold !== null
                ? t("stock.threshold", { value: qty(catalog.threshold), unit: catalog.baseUnit })
                : t("stock.thresholdDefault")}
            </span>
          </div>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.key} className="rounded-md bg-card p-3">
            <dt className="text-xs text-text-muted">{t(`columns.${tile.key}`)}</dt>
            <dd className="text-lg font-bold" dir="ltr" data-testid={`summary-${tile.key}`}>
              {qty(tile.value)}
            </dd>
          </div>
        ))}
      </dl>
      {catalog && catalog.availableQty !== null ? (
        <p className="text-xs text-text-muted" data-testid="sku-catalog-available">
          {t("stock.catalogAvailable", { value: qty(catalog.availableQty) })}
        </p>
      ) : null}
      {summary.complete ? null : <p className="text-xs text-warning-dark">{t("stock.partial")}</p>}
    </Card>
  );
}
