"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Button, Select, Spinner } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { FormError } from "@/components/forms/form-error";
import {
  formatQuantity,
  lineKey,
  toMilli,
  transferable,
  type Balance,
  type LocationInfo,
  type Warehouse,
} from "@/lib/inventory";
import { SkuPicker, type PickedSku } from "./sku-picker";

const PER_PAGE = 10;

/**
 * Lot/location balances to take stock from, read page by page from
 * GET /admin/inventory/balances with the API's own filters.
 *
 * Every row shows its lot identity (lot number, expiry, location) and its
 * split into on hand, reserved and available. What can be picked depends on
 * the document: a transfer moves unreserved stock only, so a row with
 * nothing available is shown but cannot be chosen; a write-down takes what
 * is on hand.
 */
export function BalancePicker({
  warehouses,
  locations,
  mode,
  picked,
  onPick,
  canSearchSku,
}: {
  warehouses: Warehouse[];
  locations: Record<string, LocationInfo>;
  mode: "transfer" | "writeDown";
  /** Rows already on the document (by batch:location), shown as added. */
  picked: ReadonlySet<string>;
  onPick: (row: Balance) => void;
  canSearchSku: boolean;
}) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const [warehouseId, setWarehouseId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sku, setSku] = useState<PickedSku | null>(null);
  const [page, setPage] = useState(1);
  const variantId = sku?.variantId ?? "";
  const request = [page, warehouseId, locationId, variantId].join("|");
  const [loaded, setLoaded] = useState<{ request: string; rows: Balance[]; total: number; error: ErrorKind | null } | null>(null);
  const pending = loaded?.request !== request;
  const rows = loaded?.rows ?? [];
  const total = loaded?.total ?? 0;
  const error = loaded?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    const query = {
      page,
      per_page: PER_PAGE,
      ...(warehouseId ? { warehouse_id: warehouseId } : {}),
      ...(locationId ? { location_id: locationId } : {}),
      ...(variantId ? { variant_id: variantId } : {}),
    };
    unwrap(browserApi.GET("/admin/inventory/balances", { params: { query } })).then(
      (result) => {
        if (!cancelled) setLoaded({ request, rows: result.data, total: result.total, error: null });
      },
      (cause: unknown) => {
        if (!cancelled) setLoaded({ request, rows: [], total: 0, error: errorKind(cause) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request, page, warehouseId, locationId, variantId]);

  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));
  const warehouseLocations = Object.values(locations).filter((info) => !warehouseId || info.warehouseId === warehouseId);
  const selectable = (row: Balance) => (mode === "transfer" ? transferable(row) : toMilli(row.quantity) > 0);

  return (
    <div className="flex flex-col gap-3" data-testid="balance-picker">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          <span>{t("filters.warehouse")}</span>
          <Select
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value);
              setLocationId("");
              setPage(1);
            }}
            data-testid="picker-warehouse"
          >
            <option value="">{t("filters.allWarehouses")}</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} · {warehouse.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          <span>{t("filters.location")}</span>
          <Select
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              setPage(1);
            }}
            data-testid="picker-location"
          >
            <option value="">{t("filters.allLocations")}</option>
            {warehouseLocations.map((info) => (
              <option key={info.id} value={info.id}>
                {info.warehouseCode} · {info.code}
                {info.sellable ? "" : ` (${t("nonSellable")})`}
              </option>
            ))}
          </Select>
        </label>
        {canSearchSku ? (
          <div className="flex flex-col gap-1 text-sm font-semibold">
            <span>{t("filters.sku")}</span>
            <SkuPicker
              value={sku}
              testId="picker-sku"
              onChange={(next) => {
                setSku(next);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </div>

      <FormError kind={error} />
      <div className="relative overflow-x-auto rounded-md border border-border">
        {pending ? <Spinner className="absolute end-3 top-3 text-text-muted" /> : null}
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-card text-text-muted">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.sku")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.lot")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("columns.location")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.onHand")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.reserved")}</th>
              <th className="px-3 py-2 text-end font-semibold">{t("columns.available")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !pending ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                  {t("picker.empty")}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const key = lineKey(row);
                const added = picked.has(key);
                const can = selectable(row);
                return (
                  <tr key={key} className="border-t border-border" data-testid="picker-row" data-sku={row.sku} data-lot={row.lot_number ?? ""} data-location={row.location_code}>
                    <td className="px-3 py-2 font-semibold" dir="ltr">{row.sku}</td>
                    <td className="px-3 py-2">
                      <span dir="ltr">{row.lot_number ?? t("noLotNumber")}</span>
                      {row.expiry_date ? (
                        <span className="block text-xs text-text-muted" dir="ltr">
                          {t("expires", { date: row.expiry_date.slice(0, 10) })}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <span dir="ltr">{locations[row.location_id]?.warehouseCode ?? ""} · {row.location_code}</span>
                      {row.is_sellable ? null : (
                        <Badge tone="warning" className="ms-2">
                          {t("nonSellable")}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">{formatQuantity(row.quantity, locale)}</td>
                    <td className="px-3 py-2 text-end" dir="ltr">{formatQuantity(row.reserved, locale)}</td>
                    <td className="px-3 py-2 text-end font-semibold" dir="ltr" data-testid="picker-available">
                      {formatQuantity(row.available, locale)}
                    </td>
                    <td className="px-3 py-2 text-end">
                      {added ? (
                        <Badge tone="info">{t("picker.added")}</Badge>
                      ) : can ? (
                        <Button size="sm" variant="secondary" onClick={() => onPick(row)} data-testid="picker-add">
                          {t("picker.add")}
                        </Button>
                      ) : (
                        <span className="text-xs text-text-muted" data-testid="picker-unavailable">
                          {mode === "transfer" ? t("picker.allReserved") : t("picker.nothingOnHand")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2 text-sm text-text-muted">
        <Button size="sm" variant="ghost" disabled={page <= 1 || pending} onClick={() => setPage(page - 1)} aria-label={t("picker.previous")}>
          <ChevronRight className="size-4 ltr:rotate-180" aria-hidden />
        </Button>
        <span>{t("picker.page", { page, last: lastPage })}</span>
        <Button size="sm" variant="ghost" disabled={page >= lastPage || pending} onClick={() => setPage(page + 1)} aria-label={t("picker.next")}>
          <ChevronLeft className="size-4 ltr:rotate-180" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
