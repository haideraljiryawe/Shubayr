"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { EmptyRow, Table, TBody, Td, Th, THead, Tr } from "@/components/table/table";
import type { InvoiceLine } from "@/lib/invoice-entry";
import { cn } from "@/lib/cn";

/** One invoice product as the list shows it, with its numbers already worked out. */
export interface InvoiceProductRow {
  line: InvoiceLine;
  /** Restock: a variant still without a quantity — shown, but not on the invoice. */
  blank: boolean;
  quantity: ReactNode;
  packCost: ReactNode;
  lineTotal: ReactNode;
  baseQuantity: ReactNode;
  baseUnitCost: ReactNode;
  landedShare: ReactNode;
  landedUnitCost: ReactNode;
  location: ReactNode;
  /** Messages for a row that no longer passes the invoice's checks (an older draft). */
  problems: string[];
}

/**
 * The compact list of invoice products (VIS-022): one row per product added,
 * grouped — product, quantity and cost, derived costs, receiving details —
 * with Edit and Remove — a table on wide screens, one stacked card per product
 * on a phone. The row being edited is marked. Rows are never merged:
 * the same product can be on the invoice twice with another batch, location
 * or cost.
 */
export function InvoiceProductsList({
  rows,
  editingKey,
  onEdit,
  onRemove,
  locked,
}: {
  rows: InvoiceProductRow[];
  editingKey: number | null;
  onEdit: (key: number) => void;
  onRemove: (key: number) => void;
  locked: boolean;
}) {
  const t = useTranslations("purchasing.invoice");
  return (
    <Table caption={t("editor.listTitle")} framed className="max-md:block md:min-w-[52rem]" data-testid="invoice-products">
      <THead className="max-md:hidden">
        <Tr>
          <Th>{t("editor.columns.product")}</Th>
          <Th>{t("editor.columns.quantityCost")}</Th>
          <Th>{t("editor.columns.derived")}</Th>
          <Th>{t("editor.columns.receiving")}</Th>
          {locked ? null : (
            <Th align="end">
              <span className="sr-only">{t("editor.columns.actions")}</span>
            </Th>
          )}
        </Tr>
      </THead>
      <TBody className="max-md:block">
        {rows.length === 0 ? (
          <EmptyRow colSpan={locked ? 4 : 5}>
            <span data-testid="invoice-products-empty">{t("editor.empty")}</span>
          </EmptyRow>
        ) : null}
        {rows.map((row) => {
          const sku = row.line.sku;
          const editing = row.line.key === editingKey;
          return (
            <Tr
              key={row.line.key}
              className={cn(
                "align-top max-md:grid max-md:gap-1 max-md:py-2",
                editing && "bg-primary/5 outline outline-2 -outline-offset-2 outline-primary",
                row.blank && "text-text-muted",
              )}
              data-testid="invoice-line"
              data-key={row.line.key}
              data-sku={sku?.sku ?? ""}
              data-blank={row.blank ? "true" : "false"}
              data-editing={editing ? "true" : "false"}
              aria-current={editing ? "true" : undefined}
            >
              <Td className="align-top max-md:block max-md:py-1">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold text-text" data-testid="line-product">
                    {sku?.productName ?? "—"}
                  </span>
                  {sku?.variantLabel ? <span className="text-caption text-text-muted">{sku.variantLabel}</span> : null}
                  <span className="text-caption text-text-muted" dir="ltr">
                    {sku?.sku}
                  </span>
                  {editing ? (
                    <Badge tone="info" className="mt-1 self-start" data-testid="line-editing-badge">
                      {t("editor.editingBadge")}
                    </Badge>
                  ) : null}
                  {row.blank ? (
                    <Badge tone="neutral" className="mt-1 self-start" data-testid="line-blank-badge">
                      {t("blankLine")}
                    </Badge>
                  ) : null}
                  {row.problems.map((problem) => (
                    <span key={problem} className="text-caption font-semibold text-error-dark" data-testid="line-problem">
                      {problem}
                    </span>
                  ))}
                </div>
              </Td>
              <Td className="align-top max-md:block max-md:py-1">
                <Pairs
                  items={[
                    [t("editor.quantity"), row.quantity, "line-quantity"],
                    [t("costPerPackShort"), row.packCost, "line-pack-cost"],
                    [t("editor.lineTotal"), row.lineTotal, "line-total"],
                  ]}
                />
              </Td>
              <Td className="align-top max-md:block max-md:py-1">
                <Pairs
                  items={[
                    [t("baseQuantity"), row.baseQuantity, "line-base"],
                    [t("costPerBaseUnit"), row.baseUnitCost, "line-base-cost"],
                    [t("landedShare"), row.landedShare, "line-share"],
                    [t("landedUnitCost"), row.landedUnitCost, "line-landed-unit"],
                  ]}
                />
              </Td>
              <Td className="align-top max-md:block max-md:py-1">
                <Pairs
                  items={[
                    [t("lineLocation"), row.location, "line-location-shown"],
                    ...(row.line.lot ? ([[t("lotLabel"), <span key="lot" dir="ltr">{row.line.lot}</span>, "line-lot-shown"]] as const) : []),
                    ...(row.line.expiry ? ([[t("editor.expiryShort"), <span key="expiry" dir="ltr">{row.line.expiry}</span>, "line-expiry-shown"]] as const) : []),
                  ]}
                />
              </Td>
              {locked ? null : (
                <Td align="end" className="align-top max-md:block max-md:py-1">
                  <div className="flex flex-wrap justify-end gap-1 max-md:justify-start">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(row.line.key)} disabled={editing} data-testid="line-edit">
                      <Pencil className="size-4" aria-hidden />
                      {t("editor.edit")}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-error-dark" onClick={() => onRemove(row.line.key)} data-testid="line-remove">
                      <Trash2 className="size-4" aria-hidden />
                      {t("editor.remove")}
                    </Button>
                  </div>
                </Td>
              )}
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}

/** Label/value pairs stacked in one cell, so related values stay together and readable. */
function Pairs({ items }: { items: ReadonlyArray<readonly [string, ReactNode, string]> }) {
  return (
    <dl className="grid gap-1">
      {items.map(([label, value, testId]) => (
        <div key={testId} className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-caption text-text-muted">{label}</dt>
          <dd className="font-semibold text-text" data-testid={testId}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
