"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin, Plus } from "lucide-react";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { errorCode, errorKind, type ErrorKind } from "@/lib/api/errors";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { stockHref, type Warehouse, type WarehouseLocation } from "@/lib/inventory";
import { useLocaleScopedState } from "@/components/forms/use-locale-scoped-state";
import { Table, TableCard, THead, TBody, Tr, Th, Td } from "@/components/table/table";

type Editing =
  | { kind: "warehouse"; warehouse: Warehouse | null }
  | { kind: "location"; warehouseId: string; location: WarehouseLocation | null };

type Deleting = { kind: "warehouse"; id: string; label: string } | { kind: "location"; id: string; label: string };

export function WarehousesView({ warehouses, canManage }: { warehouses: Warehouse[]; canManage: boolean }) {
  const t = useTranslations("inventory.warehouses");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [toggleError, setToggleError] = useState<{ id: string; kind: ErrorKind; code: string | null } | null>(null);

  /** Deactivate or reactivate; the API refuses to deactivate while stock remains. */
  async function setActive(kind: "warehouse" | "location", id: string, active: boolean) {
    setToggleError(null);
    try {
      if (kind === "warehouse") {
        await unwrap(browserApi.PATCH("/admin/inventory/warehouses/{id}", { params: { path: { id } }, body: { is_active: active } }));
      } else {
        await unwrap(browserApi.PATCH("/admin/inventory/locations/{id}", { params: { path: { id } }, body: { is_active: active } }));
      }
      toast(active ? t("activated") : t("deactivated"));
      router.refresh();
    } catch (cause) {
      setToggleError({ id, kind: errorKind(cause), code: errorCode(cause) ?? null });
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="warehouses">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing({ kind: "warehouse", warehouse: null })} data-testid="warehouse-new">
            <Plus className="size-4" aria-hidden />
            {t("newWarehouse")}
          </Button>
        </div>
      ) : null}
      {warehouses.length === 0 ? <p className="text-sm text-text-muted">{t("empty")}</p> : null}

      {warehouses.map((warehouse) => (
        <TableCard
          key={warehouse.id}
          data-testid="warehouse-card"
          data-code={warehouse.code}
          title={
            <>
              <h2 className="flex flex-wrap items-center gap-2 text-section">
                <span dir="ltr">{warehouse.code}</span>
                <span className="text-text-muted">·</span>
                <span>{warehouse.name}</span>
                <Badge tone={warehouse.is_active ? "success" : "neutral"} data-testid="warehouse-status">
                  {warehouse.is_active ? t("active") : t("inactive")}
                </Badge>
              </h2>
              <Link href={stockHref({ warehouse_id: warehouse.id })} className="text-label text-primary-dark hover:underline">
                {t("viewStock")}
              </Link>
            </>
          }
          toolbar={
            canManage ? (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "warehouse", warehouse })} data-testid="warehouse-edit">
                  {t("edit")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void setActive("warehouse", warehouse.id!, !warehouse.is_active)} data-testid="warehouse-toggle">
                  {warehouse.is_active ? t("deactivate") : t("activate")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDeleting({ kind: "warehouse", id: warehouse.id!, label: warehouse.code ?? "" })}
                  data-testid="warehouse-delete"
                >
                  {t("delete")}
                </Button>
              </div>
            ) : null
          }
          footer={
            canManage && warehouse.is_active ? (
              <div className="border-t border-border px-4 py-3">
                <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "location", warehouseId: warehouse.id!, location: null })} data-testid="location-new">
                  <MapPin className="size-4" aria-hidden />
                  {t("newLocation")}
                </Button>
              </div>
            ) : null
          }
        >
          {toggleError && toggleError.id === warehouse.id ? (
            <div className="px-4 pt-3">
              <FormError kind={toggleError.kind} code={toggleError.code} />
            </div>
          ) : null}

            <Table minWidth="36rem" data-testid="locations-table">
              <THead>
                <Tr>
                  <Th>{t("columns.code")}</Th>
                  <Th>{t("columns.description")}</Th>
                  <Th>{t("columns.sellable")}</Th>
                  <Th>{t("columns.status")}</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {(warehouse.locations ?? []).length === 0 ? (
                  <Tr>
                    <Td align="center" colSpan={5} className="text-text-muted">
                      {t("noLocations")}
                    </Td>
                  </Tr>
                ) : (
                  (warehouse.locations ?? []).map((location) => (
                    <Tr key={location.id} data-testid="location-row" data-code={location.code}>
                      <Td className="font-semibold" dir="ltr">
                        <Link href={stockHref({ location_id: location.id })} className="hover:underline">
                          {location.code}
                        </Link>
                      </Td>
                      <Td className="text-text-muted">{location.description || "—"}</Td>
                      <Td>
                        <Badge tone={location.is_sellable ? "info" : "warning"} data-testid="location-sellable">
                          {location.is_sellable ? t("sellable") : t("nonSellable")}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={location.is_active ? "success" : "neutral"} data-testid="location-status">
                          {location.is_active ? t("active") : t("inactive")}
                        </Badge>
                        {toggleError && toggleError.id === location.id ? (
                          <span className="mt-1 block text-xs font-semibold text-error-dark" role="alert" data-testid="location-toggle-error">
                            {toggleError.code && tErrors.has(`codes.${toggleError.code}`) ? tErrors(`codes.${toggleError.code}`) : tErrors(toggleError.kind)}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        {canManage ? (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing({ kind: "location", warehouseId: warehouse.id!, location })}
                              data-testid="location-edit"
                            >
                              {t("edit")}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void setActive("location", location.id!, !location.is_active)} data-testid="location-toggle">
                              {location.is_active ? t("deactivate") : t("activate")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleting({ kind: "location", id: location.id!, label: location.code ?? "" })}
                              data-testid="location-delete"
                            >
                              {t("delete")}
                            </Button>
                          </div>
                        ) : null}
                      </Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
        </TableCard>
      ))}

      {editing?.kind === "warehouse" ? (
        <WarehouseDialog
          key={editing.warehouse?.id ?? "new"}
          warehouse={editing.warehouse}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
      {editing?.kind === "location" ? (
        <LocationDialog
          key={editing.location?.id ?? `new-${editing.warehouseId}`}
          warehouseId={editing.warehouseId}
          location={editing.location}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={t(deleting?.kind === "location" ? "deleteLocationTitle" : "deleteWarehouseTitle", { code: deleting?.label ?? "" })}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        requireReason={false}
        onConfirm={async () => {
          // A used record is refused with 409 and the API's own message
          // ("…deactivate it instead"), which the dialog shows in place.
          if (deleting!.kind === "warehouse") {
            await unwrap(browserApi.DELETE("/admin/inventory/warehouses/{id}", { params: { path: { id: deleting!.id } } }));
          } else {
            await unwrap(browserApi.DELETE("/admin/inventory/locations/{id}", { params: { path: { id: deleting!.id } } }));
          }
          toast(t("deleted"));
          router.refresh();
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function WarehouseDialog({ warehouse, onClose, onSaved }: { warehouse: Warehouse | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("inventory.warehouses");
  const toast = useToast();
  const api = useApiForm();
  const [code, setCode] = useState(warehouse?.code ?? "");
  const [name, setName] = useState(warehouse?.name ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const found: Record<string, string> = {};
    if (code.trim().length < 2 || code.trim().length > 40) found.code = t("errors.code");
    if (name.trim().length < 2 || name.trim().length > 120) found.name = t("errors.name");
    setErrors(found);
    if (Object.keys(found).length) return;
    const body = { code: code.trim(), name: name.trim() };
    const saved = await api.run(() =>
      warehouse
        ? unwrap(browserApi.PATCH("/admin/inventory/warehouses/{id}", { params: { path: { id: warehouse.id! } }, body }))
        : unwrap(browserApi.POST("/admin/inventory/warehouses", { body })),
    );
    if (!saved) return;
    toast(warehouse ? t("saved") : t("created", { code: saved.code ?? body.code }));
    onSaved();
  }

  return (
    <FormDialog
      open
      title={warehouse ? t("editWarehouse", { code: warehouse.code ?? "" }) : t("newWarehouse")}
      submitLabel={warehouse ? t("save") : t("create")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="warehouse-dialog"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("columns.code")} name="code" error={errors.code ?? api.fieldErrors.code} hint={t("codeHint")}>
          <Input value={code} maxLength={40} dir="ltr" onChange={(event) => setCode(event.target.value)} data-testid="warehouse-code" />
        </Field>
        <Field label={t("columns.name")} name="name" error={errors.name ?? api.fieldErrors.name}>
          <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} data-testid="warehouse-name" />
        </Field>
      </div>
      <FormError kind={api.formError} code={api.formErrorCode} />
    </FormDialog>
  );
}

function LocationDialog({
  warehouseId,
  location,
  onClose,
  onSaved,
}: {
  warehouseId: string;
  location: WarehouseLocation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("inventory.warehouses");
  const toast = useToast();
  const api = useApiForm();
  const [code, setCode] = useState(location?.code ?? "");
  const [description, setDescription] = useState(location?.description ?? "");
  const [sellable, setSellable] = useState(location?.is_sellable ?? true);
  const [codeError, setCodeError] = useLocaleScopedState<string | null>(null);

  async function submit() {
    if (code.trim().length < 1 || code.trim().length > 40) {
      setCodeError(t("errors.locationCode"));
      return;
    }
    setCodeError(null);
    const body = { code: code.trim(), description: description.trim(), is_sellable: sellable };
    const saved = await api.run(() =>
      location
        ? unwrap(browserApi.PATCH("/admin/inventory/locations/{id}", { params: { path: { id: location.id! } }, body }))
        : unwrap(browserApi.POST("/admin/inventory/warehouses/{id}/locations", { params: { path: { id: warehouseId } }, body })),
    );
    if (!saved) return;
    toast(location ? t("saved") : t("locationCreated", { code: saved.code ?? body.code }));
    onSaved();
  }

  return (
    <FormDialog
      open
      title={location ? t("editLocation", { code: location.code ?? "" }) : t("newLocation")}
      submitLabel={location ? t("save") : t("create")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="location-dialog"
    >
      <Field label={t("columns.code")} name="code" error={codeError ?? api.fieldErrors.code} hint={t("locationCodeHint")}>
        <Input value={code} maxLength={40} dir="ltr" onChange={(event) => setCode(event.target.value)} data-testid="location-code" />
      </Field>
      <Field label={t("columns.description")} name="description" error={api.fieldErrors.description}>
        <Textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} data-testid="location-description" />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4" checked={sellable} onChange={(event) => setSellable(event.target.checked)} data-testid="location-sellable-input" />
        <span>
          <span className="font-semibold">{t("sellable")}</span>
          <span className="block text-xs text-text-muted">{t("sellableHint")}</span>
        </span>
      </label>
      <FormError kind={api.formError} code={api.formErrorCode} />
    </FormDialog>
  );
}
