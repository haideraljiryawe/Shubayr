"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DataTable, type Column } from "@/components/table/data-table";
import { formatReportAmount, formatReportNumber, type ReportCell, type ReportRowView, type ReportView } from "@/lib/reports";

function CellValue({ cell, field }: { cell: ReportCell; field: string }) {
  const locale = useLocale();
  const t = useTranslations("reports");
  let value: string;
  if (cell.kind === "money") value = formatReportAmount(cell.value, locale);
  else if (cell.kind === "number") value = typeof cell.value === "boolean" ? t(cell.value ? "yes" : "no") : formatReportNumber(cell.value, locale);
  else if (cell.kind === "percent") value = cell.value === null ? "—" : `${formatReportNumber(cell.value, locale)}%`;
  else if (cell.kind === "date" && typeof cell.value === "string") value = cell.value.slice(0, 10);
  else {
    const raw = cell.value === null || cell.value === "" ? "—" : String(cell.value);
    const key = field === "line" ? `fields.${raw}` : `values.${raw}`;
    value = raw !== "—" && t.has(key) ? t(key) : raw;
  }
  const content = <span className={cell.kind === "money" || cell.kind === "number" || cell.kind === "percent" ? "tabular-nums" : undefined}>{value}</span>;
  return cell.href ? <Link className="font-semibold text-primary-dark underline-offset-4 hover:underline" href={cell.href}>{content}</Link> : content;
}

export function ReportTable({ view }: { view: ReportView }) {
  const t = useTranslations("reports");
  const columns: Column<ReportRowView>[] = view.columns.map((key) => ({
    key,
    header: t(`fields.${key}`),
    cell: (row) => <CellValue field={key} cell={row.cells[key] ?? { value: null }} />,
    className: key.includes("amount") || key.includes("sales") || key.includes("cost") || key.includes("balance") || key.includes("quantity") || key.includes("count") || key.includes("profit") || key === "debit" || key === "credit" || key === "returns" || key === "value" ? "tabular-nums whitespace-nowrap" : undefined,
  }));
  return (
    <DataTable
      rows={view.rows}
      columns={columns}
      rowKey={(row) => row.id}
      state={{ page: view.page, perPage: view.perPage, total: view.total, sort: "", dir: "asc" }}
      emptyLabel={t("empty")}
      caption={t("tableCaption")}
      testId="report-table"
    />
  );
}

