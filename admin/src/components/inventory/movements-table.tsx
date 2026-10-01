"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui";
import { DataTable, TableFilter, useTableUrl, type Column, type TableState } from "@/components/table/data-table";
import {
  formatCost,
  formatQuantity,
  locationLabel,
  lotHref,
  MOVEMENT_TYPES,
  shortId,
  sourceLink,
  type LocationInfo,
  type Movement,
  type MovementType,
} from "@/lib/inventory";

/**
 * Movement types and their tones. `return_to_supplier` (API 9.0) is sent by
 * the server but not yet listed in the contract's enum; any other type the
 * contract does not know falls back to a neutral badge with its raw name.
 */
const TYPE_TONES: Record<MovementType | "return_to_supplier", BadgeTone> = {
  receive: "success",
  reserve: "info",
  release: "neutral",
  issue_to_custody: "info",
  custody_to_sold: "neutral",
  return_in: "success",
  transfer: "info",
  adjust: "warning",
  write_down: "danger",
  return_to_supplier: "warning",
};

/**
 * The append-only movement ledger, one page at a time, filtered by the API
 * (type, location, SKU, lot, custody party). Unit cost shows with cost.view.
 */
export function MovementsTable({
  rows,
  state,
  locations,
  filters,
  canViewCost,
  showLot = true,
  lotLabels = {},
}: {
  rows: Movement[];
  state: TableState;
  locations: Record<string, LocationInfo>;
  filters: Record<string, string>;
  canViewCost: boolean;
  /** Off on a lot's own page. */
  showLot?: boolean;
  /** Lot numbers already known to the page, by lot id. */
  lotLabels?: Record<string, string>;
}) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const format = useFormatter();
  const { update } = useTableUrl();
  const when = (iso: string | undefined) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" }) : "—";
  const where = (id: string | null | undefined) => (id ? locationLabel(locations[id], shortId(id)) : "—");

  const columns: Column<Movement>[] = [
    { key: "at", header: t("columns.date"), cell: (row) => <span className="whitespace-nowrap text-xs">{when(row.created_at)}</span> },
    {
      key: "type",
      header: t("columns.type"),
      cell: (row) => (
        <Badge tone={TYPE_TONES[row.type as keyof typeof TYPE_TONES] ?? "neutral"} data-testid="movement-type" data-type={row.type}>
          {row.type && t.has(`movementType.${row.type}`) ? t(`movementType.${row.type}`) : (row.type ?? "—")}
        </Badge>
      ),
    },
    ...(showLot
      ? [
          {
            key: "lot",
            header: t("columns.lot"),
            cell: (row: Movement) =>
              row.batch_id ? (
                <Link href={lotHref(row.batch_id)} className="text-primary-dark hover:underline" dir="ltr">
                  {row.batch?.lot_number ?? lotLabels[row.batch_id] ?? shortId(row.batch_id)}
                </Link>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    {
      key: "route",
      header: t("columns.fromTo"),
      cell: (row) => (
        <span className="whitespace-nowrap text-xs" dir="ltr" data-testid="movement-route">
          {where(row.from_location)} → {where(row.to_location)}
        </span>
      ),
    },
    {
      key: "custody",
      header: t("columns.custodyParty"),
      cell: (row) =>
        row.custody_party_id ? (
          <button
            type="button"
            className="cursor-pointer text-xs text-primary-dark hover:underline"
            dir="ltr"
            title={row.custody_party_id}
            onClick={() => update({ custody_party_id: row.custody_party_id ?? null })}
          >
            {shortId(row.custody_party_id)}
          </button>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "quantity",
      header: t("columns.quantity"),
      className: "text-end",
      cell: (row) => (
        <span className="font-semibold" dir="ltr" data-testid="movement-quantity">
          {formatQuantity(row.quantity, locale)}
        </span>
      ),
    },
    ...(canViewCost
      ? [
          {
            key: "cost",
            header: t("columns.unitCost"),
            className: "text-end",
            cell: (row: Movement) => (
              <span dir="ltr" className="text-xs" data-testid="movement-cost">
                {formatCost(row.unit_cost_iqd, locale)}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "source",
      header: t("columns.source"),
      cell: (row) => {
        const link = sourceLink({ source_type: row.source_type ?? "", source_id: row.source_id, reference: row.reference });
        const label = row.reference ?? (t.has(`source.${row.source_type}`) ? t(`source.${row.source_type}`) : row.source_type);
        return link.kind === "none" ? (
          <span className="text-xs" dir="ltr">{label ?? "—"}</span>
        ) : (
          <Link href={link.href} className="text-xs font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="movement-source">
            {label}
          </Link>
        );
      },
    },
    {
      key: "actor",
      header: t("columns.actor"),
      cell: (row) => (
        <span className="text-xs text-text-muted" dir="ltr" title={row.user_id ?? undefined}>
          {shortId(row.user_id)}
        </span>
      ),
    },
  ];

  const chips = (["variant_id", "batch_id", "custody_party_id"] as const)
    .filter((key) => filters[key])
    .map((key) => ({ key, label: `${t(`filters.${key}`)}: ${shortId(filters[key])}` }));

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id ?? ""}
      state={state}
      caption={t("movements.title")}
      emptyLabel={t("movements.empty")}
      testId="movements-table"
      toolbar={
        <>
          <TableFilter
            name="type"
            label={t("columns.type")}
            options={[
              { value: "", label: t("filters.allTypes") },
              ...MOVEMENT_TYPES.map((type) => ({ value: type, label: t(`movementType.${type}`) })),
            ]}
          />
          <TableFilter
            name="location_id"
            label={t("filters.location")}
            options={[
              { value: "", label: t("filters.allLocations") },
              ...Object.values(locations).map((info) => ({ value: info.id, label: locationLabel(info) })),
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
  );
}
