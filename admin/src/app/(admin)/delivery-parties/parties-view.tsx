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
import { MANAGED_KINDS, PARTY_KINDS, PARTY_TONE, managedPartyPath, type DeliveryParty, type ManagedKind } from "@/lib/delivery-parties";
import { CourierForm } from "./courier-form";
import { DriverForm } from "./driver-form";

type Pending = { party: DeliveryParty; action: "deactivate" | "activate" | "remove" };

/**
 * The parties table. External drivers and courier companies can be created,
 * edited, deactivated or reactivated (drivers.manage). "Remove" deletes one
 * nobody has used yet; once it has any delivery, custody or retrieval the
 * API keeps the record and deactivates it instead, and the page says which
 * happened.
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
  /** Which kind the "add" form creates. */
  const [creating, setCreating] = useState<ManagedKind>("external_driver");
  // A new key empties the form after each save.
  const [saves, setSaves] = useState(0);
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
      key: "contact",
      header: t("columns.contact"),
      cell: (party) => (party.contact_person ? <span data-testid="party-contact">{party.contact_person}</span> : "—"),
    },
    {
      key: "kind",
      header: t("columns.kind"),
      cell: (party) => (
        <Badge tone={PARTY_TONE[party.kind]} data-testid="party-kind" data-kind={party.kind}>
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
      align: "end",
      cell: (party) => (
        <div className="flex flex-wrap justify-end gap-2">
          {canViewCustody ? (
            <Link href={`/delivery-parties/${party.id}`} className="inline-flex h-8 items-center rounded-md px-2 text-label text-primary-dark hover:bg-card" data-testid="party-custody-link">
              {t("viewCustody")}
            </Link>
          ) : null}
          {canManageDrivers && party.kind !== "internal_agent" ? (
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

  const formKind: ManagedKind = editing ? (editing.kind === "courier_company" ? "courier_company" : "external_driver") : creating;
  const done = (saved: { name: string; duplicate_phone_warning: boolean }, created: boolean) => {
    setEditing(null);
    setSaves((count) => count + 1);
    setNotice(saved.duplicate_phone_warning ? { kind: "duplicatePhone", name: saved.name } : null);
    toast(created ? t("created") : t("updated"));
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      {canManageDrivers ? (
        <div ref={formRef} className="flex flex-col gap-3">
          {editing ? null : (
            <div className="flex flex-wrap gap-4 text-body" role="radiogroup" aria-label={t("addKind")} data-testid="party-add-kind">
              <span className="font-semibold">{t("addKind")}</span>
              {MANAGED_KINDS.map((kind) => (
                <label key={kind} className="flex items-center gap-2">
                  <input type="radio" name="party-add-kind" checked={creating === kind} onChange={() => setCreating(kind)} data-testid={`party-add-${kind}`} />
                  {t(`kinds.${kind}`)}
                </label>
              ))}
            </div>
          )}
          {formKind === "courier_company" ? (
            <CourierForm key={`${editing?.id ?? "new"}:${saves}`} initial={editing} onDone={done} onCancel={editing ? () => setEditing(null) : undefined} />
          ) : (
            <DriverForm key={`${editing?.id ?? "new"}:${saves}`} initial={editing} onDone={done} onCancel={editing ? () => setEditing(null) : undefined} />
          )}
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
          const path = managedPartyPath(party.kind === "courier_company" ? "courier_company" : "external_driver");
          if (action === "remove") {
            const removed = await unwrap(browserApi.DELETE(path, { params: { path: { id: party.id } } }));
            setNotice({ kind: removed.disposition, name: party.name });
          } else {
            await unwrap(
              browserApi.PATCH(path, {
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
