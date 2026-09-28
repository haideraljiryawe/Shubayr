"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, buttonClasses } from "@/components/ui";
import {
  DataTable,
  TableFilter,
  TableSearch,
  type Column,
  type TableState,
} from "@/components/table/data-table";

export interface PresetRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: number;
}

export function PresetTable({
  rows,
  state,
}: {
  rows: PresetRow[];
  state: TableState;
}) {
  const t = useTranslations("presets");

  const columns: Column<PresetRow>[] = [
    {
      key: "name",
      header: t("columns.name"),
      sortKey: "name",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 font-semibold" dir="ltr">
            {row.name}
            {row.isSystem ? <Badge tone="info">{t("system")}</Badge> : null}
          </span>
          {row.description ? (
            <span className="text-xs text-text-muted">{row.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "permissions",
      header: t("columns.permissions"),
      sortKey: "permissions",
      cell: (row) => t("permissionCount", { count: row.permissions }),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columns.actions")}</span>,
      className: "text-end",
      cell: (row) => (
        <Link
          href={`/presets/${row.id}`}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
          data-testid={`preset-edit-${row.name}`}
        >
          {t("edit")}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      testId="preset-table"
      caption={t("title")}
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      state={state}
      emptyLabel={t("empty")}
      toolbar={
        <>
          <TableSearch placeholder={t("search")} />
          <TableFilter
            name="kind"
            label={t("filters.kind")}
            options={[
              { value: "", label: t("filters.any") },
              { value: "system", label: t("system") },
              { value: "custom", label: t("custom") },
            ]}
          />
        </>
      }
    />
  );
}
