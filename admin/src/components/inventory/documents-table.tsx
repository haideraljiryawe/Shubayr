"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { DataTable, type Column, type TableState } from "@/components/table/data-table";
import { entryHref } from "@/lib/finance/links";
import {
  documentHref,
  formatQuantity,
  fromMilli,
  toMilli,
  type DocumentType,
  type InventoryDocument,
} from "@/lib/inventory";

function dateOf(document: InventoryDocument): string {
  return "document_date" in document ? document.document_date : document.snapshot_at;
}

/** One page of inventory documents of a single type, newest first. */
export function DocumentsTable({
  type,
  rows,
  state,
  canViewLedger,
}: {
  type: DocumentType;
  rows: InventoryDocument[];
  state: TableState;
  canViewLedger: boolean;
}) {
  const t = useTranslations("inventory");
  const locale = useLocale();
  const format = useFormatter();
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });

  const columns: Column<InventoryDocument>[] = [
    {
      key: "number",
      header: t("columns.document"),
      cell: (document) => (
        <Link href={documentHref(type, document.id)} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="document-link">
          {document.document_number}
        </Link>
      ),
    },
    {
      key: "date",
      header: type === "count" ? t("columns.snapshot") : t("columns.documentDate"),
      cell: (document) => <span className="text-sm">{day(dateOf(document))}</span>,
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (document) => (
        <Badge tone={document.status === "draft" ? "warning" : "success"} data-testid="document-status">
          {t(`documentStatus.${document.status}`)}
        </Badge>
      ),
    },
    {
      key: "lines",
      header: t("columns.lines"),
      cell: (document) => {
        const lines = document.lines as Array<{ quantity?: number; difference?: number }>;
        const quantity = lines.reduce((sum, line) => sum + toMilli(line.quantity ?? line.difference ?? 0), 0);
        return (
          <span className="text-sm" data-testid="document-lines">
            {t("lineCount", { count: lines.length })}
            {type === "count" ? null : (
              <span className="text-text-muted" dir="ltr">
                {" · "}
                {formatQuantity(fromMilli(quantity), locale)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "reason",
      header: t("columns.reason"),
      cell: (document) => <span className="line-clamp-2 text-sm">{"reason" in document ? document.reason : "—"}</span>,
    },
    {
      key: "entry",
      header: t("columns.journal"),
      cell: (document) => {
        const entry = "journal_entry" in document ? document.journal_entry : null;
        if (!entry) return <span className="text-text-muted">—</span>;
        return canViewLedger ? (
          <Link href={entryHref(entry.id)} className="text-sm font-semibold text-primary-dark hover:underline" dir="ltr">
            {entry.document_number}
          </Link>
        ) : (
          <span className="text-sm" dir="ltr">{entry.document_number}</span>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(document) => document.id}
      state={state}
      caption={t(`documents.${type}`)}
      emptyLabel={t("documentsEmpty")}
      testId="documents-table"
    />
  );
}
