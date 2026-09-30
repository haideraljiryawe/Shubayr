"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Alert, Input, Select } from "@/components/ui";
import {
  DataTable,
  useTableUrl,
  type Column,
  type TableState,
} from "@/components/table/data-table";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, auditChanges, type AuditLog } from "@/lib/audit";

export function AuditTable({
  rows,
  state,
  invalidRange,
}: {
  rows: AuditLog[];
  state: TableState;
  invalidRange: boolean;
}) {
  const t = useTranslations("audit");
  const format = useFormatter();
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Asia/Baghdad",
      numberingSystem: "latn",
    });

  const columns: Column<AuditLog>[] = [
    {
      key: "when",
      header: t("columns.when"),
      cell: (row) => <span className="whitespace-nowrap text-xs">{when(row.created_at)}</span>,
    },
    {
      key: "actor",
      header: t("columns.actor"),
      cell: (row) =>
        row.actor ? (
          <div className="flex flex-col">
            <span className="font-semibold">{row.actor.name || row.actor.username}</span>
            <span className="text-xs text-text-muted" dir="ltr">{row.actor.username}</span>
          </div>
        ) : (
          <span className="text-text-muted">{t("system")}</span>
        ),
    },
    {
      key: "action",
      header: t("columns.action"),
      cell: (row) => (
        <code dir="ltr" className="text-xs" data-testid="audit-action">
          {row.action}
        </code>
      ),
    },
    {
      key: "entity",
      header: t("columns.entity"),
      cell: (row) => (
        <div className="flex flex-col text-xs" dir="ltr">
          <span data-testid="audit-entity">{row.entity_type}</span>
          {row.entity_id ? <span className="text-text-muted">{row.entity_id}</span> : null}
        </div>
      ),
    },
    {
      key: "change",
      header: t("columns.change"),
      cell: (row) => {
        const changes = auditChanges(row.before, row.after);
        return (
          <div className="flex flex-col gap-1 text-xs">
            {row.reason ? (
              <span data-testid="audit-reason">
                <span className="text-text-muted">{t("reason")}:</span> {row.reason}
              </span>
            ) : null}
            {changes.slice(0, 6).map((change) => (
              <span key={change.field} dir="ltr" className="break-all">
                <span className="text-text-muted">{change.field}:</span> {change.before} → {change.after}
              </span>
            ))}
            {changes.length > 6 ? (
              <span className="text-text-muted">{t("moreChanges", { count: changes.length - 6 })}</span>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {invalidRange ? <Alert tone="info" data-testid="audit-invalid-range">{t("invalidRange")}</Alert> : null}
      <DataTable
        testId="audit-table"
        caption={t("title")}
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        state={state}
        emptyLabel={t("empty")}
        toolbar={
          <>
            <TextFilter name="actor" label={t("filters.actor")} placeholder={t("filters.actorHint")} />
            <ListFilter name="action" label={t("filters.action")} any={t("filters.anyAction")} values={AUDIT_ACTIONS} />
            <ListFilter name="entity_type" label={t("filters.entity")} any={t("filters.anyEntity")} values={AUDIT_ENTITIES} />
            <TextFilter name="entity_id" label={t("filters.entityId")} placeholder="00000000-…" ltr />
            <DayFilter name="from" label={t("filters.from")} />
            <DayFilter name="to" label={t("filters.to")} />
          </>
        }
      />
      <p className="text-xs text-text-muted">{t("timezoneNote")}</p>
    </div>
  );
}

/** A debounced text box bound to one URL key; a change returns to page 1. */
function TextFilter({
  name,
  label,
  placeholder,
  ltr = false,
}: {
  name: string;
  label: string;
  placeholder?: string;
  ltr?: boolean;
}) {
  const { update, searchParams } = useTableUrl();
  const current = searchParams.get(name) ?? "";
  const [value, setValue] = useState(current);

  useEffect(() => {
    if (value.trim() === current) return;
    const timer = window.setTimeout(() => update({ [name]: value.trim() || null }), 300);
    return () => window.clearTimeout(timer);
    // The debounce keys on the text only; `update` is recreated per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold sm:w-auto">
      <span>{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        dir={ltr ? "ltr" : undefined}
        data-testid={`filter-${name}`}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}

/** A select over known values; a value from the URL it does not know is kept. */
function ListFilter({
  name,
  label,
  any,
  values,
}: {
  name: string;
  label: string;
  any: string;
  values: readonly string[];
}) {
  const { update, searchParams } = useTableUrl();
  const current = searchParams.get(name) ?? "";
  const options = current && !values.includes(current) ? [current, ...values] : values;
  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold sm:w-auto">
      <span>{label}</span>
      <Select
        value={current}
        dir="ltr"
        data-testid={`filter-${name}`}
        onChange={(event) => update({ [name]: event.target.value || null })}
      >
        <option value="">{any}</option>
        {options.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select>
    </label>
  );
}

function DayFilter({ name, label }: { name: string; label: string }) {
  const { update, searchParams } = useTableUrl();
  return (
    <label className="flex w-full flex-col gap-1 text-sm font-semibold sm:w-auto">
      <span>{label}</span>
      <Input
        type="date"
        value={searchParams.get(name) ?? ""}
        data-testid={`filter-${name}`}
        onChange={(event) => update({ [name]: event.target.value || null })}
      />
    </label>
  );
}
