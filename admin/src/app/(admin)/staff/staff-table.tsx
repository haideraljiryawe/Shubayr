"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, buttonClasses } from "@/components/ui";
import {
  DataTable,
  TableFilter,
  TableSearch,
  type Column,
  type TableState,
} from "@/components/table/data-table";
import type { StaffUser } from "@/lib/staff-query";

export function StaffStatus({ user }: { user: StaffUser }) {
  const t = useTranslations("staff");
  if (!user.is_active)
    return <Badge tone="danger">{t("status.inactive")}</Badge>;
  if (user.must_change_password)
    return <Badge tone="warning">{t("status.must_change")}</Badge>;
  return <Badge tone="success">{t("status.active")}</Badge>;
}

export function StaffTable({
  rows,
  state,
  presets,
}: {
  rows: StaffUser[];
  state: TableState;
  presets: Array<{ id: string; name: string }> | null;
}) {
  const t = useTranslations("staff");
  const format = useFormatter();

  const columns: Column<StaffUser>[] = [
    {
      key: "name",
      header: t("columns.name"),
      sortKey: "name",
      cell: (user) => (
        <div className="flex flex-col">
          <span className="font-semibold">{user.name || "—"}</span>
          <span className="text-xs text-text-muted" dir="ltr">
            {user.email ?? ""}
          </span>
        </div>
      ),
    },
    {
      key: "username",
      header: t("columns.username"),
      sortKey: "username",
      cell: (user) => (
        <code dir="ltr" data-testid="staff-username">
          {user.username}
        </code>
      ),
    },
    {
      key: "presets",
      header: t("columns.presets"),
      cell: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.presets.map((preset) => (
            <Badge key={preset.id} tone="info" dir="ltr">
              {preset.name}
            </Badge>
          ))}
          {user.extra_grants.length > 0 ? (
            <Badge>
              {t("extraCount", { count: user.extra_grants.length })}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (user) => <StaffStatus user={user} />,
    },
    {
      key: "created_at",
      header: t("columns.created"),
      sortKey: "created_at",
      cell: (user) =>
        format.dateTime(new Date(user.created_at), { dateStyle: "medium" }),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columns.actions")}</span>,
      className: "text-end",
      cell: (user) => (
        <Link
          href={`/staff/${user.id}`}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
          data-testid={`staff-edit-${user.username}`}
        >
          {t("manage")}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      testId="staff-table"
      caption={t("title")}
      rows={rows}
      columns={columns}
      rowKey={(user) => user.id}
      state={state}
      emptyLabel={t("empty")}
      toolbar={
        <>
          <TableSearch placeholder={t("search")} />
          <TableFilter
            name="status"
            label={t("filters.status")}
            options={[
              { value: "", label: t("filters.any") },
              { value: "active", label: t("status.active") },
              { value: "inactive", label: t("status.inactive") },
              { value: "must_change", label: t("status.must_change") },
            ]}
          />
          {presets ? (
            <TableFilter
              name="preset"
              label={t("filters.preset")}
              options={[
                { value: "", label: t("filters.any") },
                ...presets.map((preset) => ({
                  value: preset.id,
                  label: preset.name,
                })),
              ]}
            />
          ) : null}
        </>
      }
    />
  );
}
