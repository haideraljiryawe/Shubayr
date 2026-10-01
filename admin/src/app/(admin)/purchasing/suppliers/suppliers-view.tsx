"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { DataTable, type Column, type TableState } from "@/components/table/data-table";
import { SupplierDialog } from "@/components/purchasing/supplier-dialog";
import { browserApi, unwrap } from "@/lib/api/client";
import type { Supplier } from "@/lib/purchasing";

export function SuppliersView({ rows, state, canManage }: { rows: Supplier[]; state: TableState; canManage: boolean }) {
  const t = useTranslations("purchasing.suppliers");
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<Supplier | null>(null);

  async function reactivate(supplier: Supplier) {
    try {
      await unwrap(browserApi.PATCH("/admin/suppliers/{id}", { params: { path: { id: supplier.id } }, body: { is_active: true } }));
      toast(t("reactivated"));
      router.refresh();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : t("failed"));
    }
  }

  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: t("columns.name"),
      cell: (supplier) => (
        <Link href={`/purchasing/suppliers/${supplier.id}`} className="font-semibold text-primary-dark hover:underline" data-testid="supplier-link">
          {supplier.name}
        </Link>
      ),
    },
    { key: "currency", header: t("columns.currency"), cell: (supplier) => <span dir="ltr">{supplier.default_currency}</span> },
    { key: "terms", header: t("columns.terms"), cell: (supplier) => t("termsDays", { days: supplier.payment_terms_days }) },
    { key: "phone", header: t("columns.phone"), cell: (supplier) => <span dir="ltr">{supplier.phone ?? "—"}</span> },
    {
      key: "status",
      header: t("columns.status"),
      cell: (supplier) => (
        <Badge tone={supplier.is_active ? "success" : "neutral"} data-testid="supplier-status">
          {supplier.is_active ? t("active") : t("inactive")}
        </Badge>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: <span className="sr-only">{t("columns.actions")}</span>,
            cell: (supplier: Supplier) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(supplier)} data-testid="supplier-edit">
                  {t("edit")}
                </Button>
                {supplier.is_active ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeactivating(supplier)} data-testid="supplier-deactivate">
                    {t("deactivate")}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => void reactivate(supplier)} data-testid="supplier-reactivate">
                    {t("reactivate")}
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(supplier) => supplier.id}
        state={state}
        caption={t("title")}
        emptyLabel={t("empty")}
        testId="suppliers-table"
        toolbar={
          canManage ? (
            <Button onClick={() => setEditing("new")} data-testid="supplier-new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </Button>
          ) : null
        }
      />
      {editing ? (
        <SupplierDialog
          key={editing === "new" ? "new" : editing.id}
          supplier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            if (editing === "new") router.push(`/purchasing/suppliers/${saved.id}`);
            else router.refresh();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deactivating !== null}
        title={t("deactivateTitle", { name: deactivating?.name ?? "" })}
        body={t("deactivateBody")}
        confirmLabel={t("deactivate")}
        requireReason={false}
        onConfirm={async () => {
          await unwrap(browserApi.DELETE("/admin/suppliers/{id}", { params: { path: { id: deactivating!.id } } }));
          toast(t("deactivated"));
          router.refresh();
        }}
        onClose={() => setDeactivating(null)}
      />
    </>
  );
}
