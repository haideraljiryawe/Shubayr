"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { DataTable, TableFilter, TableSearch, type Column, type TableState } from "@/components/table/data-table";
import { browserApi, unwrap } from "@/lib/api/client";
import { PARTY_KINDS, type DeliveryParty } from "@/lib/delivery-parties";
import { DriverForm } from "./driver-form";

type Pending = { party: DeliveryParty; action: "deactivate" | "activate" | "remove" };

/**
 * The parties table. External drivers can be created, edited, deactivated
 * or reactivated (drivers.manage). "Remove" deletes a driver nobody has used
 * yet; once a driver has any delivery, custody or retrieval the API keeps
 * the record and deactivates it instead, and the page says which happened.
 */
export function PartiesView({
  rows,
  state,
  canManageDrivers,
  canViewCustody,
}: {
  rows: DeliveryParty[];
  state: TableState;
  canManageDrivers: boolean;
  canViewCustody: boolean;
}) {
  const t = useTranslations("parties");
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<DeliveryParty | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{ kind: "duplicatePhone" | "deleted" | "deactivated"; name: string } | null>(null);

  const columns: Column<DeliveryParty>[] = [
    {
      key: "name",
      header: t("columns.name"),
      cell: (party) =>
        canViewCustody ? (
          <Link href={`/delivery-parties/${party.id}`} className="font-semibold text-primary-dark hover:underline" data-testid="party-link">
            {party.name}
          </Link>
        ) : (
          <span className="font-semibold">{party.name}</span>
        ),
    },
    {
      key: "kind",
      header: t("columns.kind"),
      cell: (party) => (
        <Badge tone={party.kind === "external_driver" ? "warning" : "info"} data-testid="party-kind" data-kind={party.kind}>
          {t(`kinds.${party.kind}`)}
        </Badge>
      ),
    },
    { key: "phone", header: t("columns.phone"), cell: (party) => <span dir="ltr">{party.phone}</span> },
    { key: "vehicle", header: t("columns.vehicle"), cell: (party) => (party.vehicle_number ? <span dir="ltr">{party.vehicle_number}</span> : "—") },
    {
      key: "status",
      header: t("columns.status"),
      cell: (party) => (
        <Badge tone={party.is_active ? "success" : "neutral"} data-testid="party-status" data-active={String(party.is_active)}>
          {party.is_active ? t("status.active") : t("status.inactive")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columns.actions")}</span>,
      className: "text-end",
      cell: (party) => (
        <div className="flex flex-wrap justify-end gap-2">
          {canViewCustody ? (
            <Link href={`/delivery-parties/${party.id}`} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-semibold text-primary-dark hover:bg-card" data-testid="party-custody-link">
              {t("viewCustody")}
            </Link>
          ) : null}
          {canManageDrivers && party.kind === "external_driver" ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                data-testid="driver-edit"
                onClick={() => {
                  setEditing(party);
                  setNotice(null);
                  formRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {t("edit")}
              </Button>
              <Button size="sm" variant="secondary" data-testid={party.is_active ? "driver-deactivate" : "driver-activate"} onClick={() => setPending({ party, action: party.is_active ? "deactivate" : "activate" })}>
                {party.is_active ? t("deactivate") : t("activate")}
              </Button>
              <Button size="sm" variant="danger" data-testid="driver-remove" onClick={() => setPending({ party, action: "remove" })}>
                {t("remove")}
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {canManageDrivers ? (
        <div ref={formRef}>
          <DriverForm
            key={editing?.id ?? "new"}
            initial={editing}
            onDone={(saved, created) => {
              setEditing(null);
              setNotice(saved.duplicate_phone_warning ? { kind: "duplicatePhone", name: saved.name } : null);
              toast(created ? t("created") : t("updated"));
              router.refresh();
            }}
            onCancel={editing ? () => setEditing(null) : undefined}
          />
        </div>
      ) : null}

      {notice ? (
        <Alert tone={notice.kind === "deleted" ? "success" : "info"} data-testid="party-notice" data-kind={notice.kind}>
          {t(`notice.${notice.kind}`, { name: notice.name })}
        </Alert>
      ) : null}

      <DataTable
        testId="parties-table"
        caption={t("title")}
        rows={rows}
        columns={columns}
        rowKey={(party) => party.id}
        state={state}
        emptyLabel={t("empty")}
        toolbar={
          <>
            <TableSearch placeholder={t("search")} />
            <TableFilter
              name="kind"
              label={t("columns.kind")}
              options={[{ value: "", label: t("allKinds") }, ...PARTY_KINDS.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) }))]}
            />
            <TableFilter
              name="status"
              label={t("columns.status")}
              options={[
                { value: "", label: t("allStatuses") },
                { value: "active", label: t("status.active") },
                { value: "inactive", label: t("status.inactive") },
              ]}
            />
          </>
        }
      />

      <ConfirmDialog
        open={pending !== null}
        requireReason={false}
        tone={pending?.action === "activate" ? "primary" : "danger"}
        title={pending ? t(`confirm.${pending.action}Title`, { name: pending.party.name }) : ""}
        body={pending ? t(`confirm.${pending.action}Body`) : undefined}
        confirmLabel={pending ? t(pending.action) : ""}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          const { party, action } = pending;
          if (action === "remove") {
            const removed = await unwrap(browserApi.DELETE("/admin/external-drivers/{id}", { params: { path: { id: party.id } } }));
            setNotice({ kind: removed.disposition, name: party.name });
          } else {
            await unwrap(
              browserApi.PATCH("/admin/external-drivers/{id}", {
                params: { path: { id: party.id } },
                body: { is_active: action === "activate" },
              }),
            );
            setNotice(null);
            toast(action === "activate" ? t("activated") : t("deactivated"));
          }
          if (editing?.id === party.id) setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}
