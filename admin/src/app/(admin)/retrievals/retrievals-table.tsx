"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { DataTable, TableFilter, type Column, type TableState } from "@/components/table/data-table";
import { DateFilter } from "@/components/finance/date-filter";
import { RETRIEVAL_STATUSES, type RetrievalListItem } from "@/lib/retrievals";

export function RetrievalsTable({
  rows,
  state,
  agents,
}: {
  rows: RetrievalListItem[];
  state: TableState;
  /** Delivery agents to filter by, or null without orders.assign_agent. */
  agents: Array<{ id: string; label: string }> | null;
}) {
  const t = useTranslations("retrievals");
  const tl = useTranslations("retrievals.list");
  const format = useFormatter();
  const day = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", numberingSystem: "latn", timeZone: "UTC" });

  const columns: Column<RetrievalListItem>[] = [
    {
      key: "number",
      header: tl("columns.document"),
      cell: (row) => (
        <Link href={`/retrievals/${row.id}`} className="font-semibold text-primary-dark hover:underline" dir="ltr" data-testid="retrieval-list-link">
          {row.document_number}
        </Link>
      ),
    },
    {
      key: "order",
      header: tl("columns.order"),
      cell: (row) => (
        <Link href={`/orders/${row.order_id}`} className="hover:underline" dir="ltr" data-testid="retrieval-list-order">
          {row.order.order_number}
        </Link>
      ),
    },
    {
      key: "party",
      header: tl("columns.party"),
      cell: (row) => (
        // Filtering by a party works from any row, even without the agent list.
        <Link href={`/retrievals?party_id=${row.custody_party_id}`} className="hover:underline" data-testid="retrieval-list-party">
          {row.custody_party.name || <span dir="ltr">{row.custody_party.phone}</span>}
        </Link>
      ),
    },
    { key: "date", header: tl("columns.date"), cell: (row) => day(row.document_date) },
    { key: "outcome", header: tl("columns.outcome"), cell: (row) => t(`outcomes.${row.outcome}`) },
    { key: "lines", header: tl("columns.lines"), className: "text-end", cell: (row) => <span dir="ltr">{row.line_count}</span> },
    {
      key: "status",
      header: tl("columns.status"),
      cell: (row) => (
        <Badge tone={row.status === "received" || row.status === "closed" ? "success" : "warning"} data-testid="retrieval-list-status" data-status={row.status}>
          {t(`statuses.${row.status}`)}
        </Badge>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      state={state}
      caption={tl("title")}
      emptyLabel={tl("empty")}
      testId="retrievals-table"
      toolbar={
        <>
          <TableFilter
            name="status"
            label={tl("columns.status")}
            options={[{ value: "", label: tl("allStatuses") }, ...RETRIEVAL_STATUSES.map((status) => ({ value: status, label: t(`statuses.${status}`) }))]}
          />
          {agents ? (
            <TableFilter
              name="party_id"
              label={tl("columns.party")}
              options={[{ value: "", label: tl("allParties") }, ...agents.map((agent) => ({ value: agent.id, label: agent.label }))]}
            />
          ) : null}
          <DateFilter name="from" label={tl("from")} />
          <DateFilter name="to" label={tl("to")} />
        </>
      }
    />
  );
}
