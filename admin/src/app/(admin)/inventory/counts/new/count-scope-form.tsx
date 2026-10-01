"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Select, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { SkuPicker, type PickedSku } from "@/components/inventory/sku-picker";
import { browserApi, unwrap } from "@/lib/api/client";
import { documentHref, locationLabel, type LocationInfo, type Warehouse } from "@/lib/inventory";

type Scope = "warehouse" | "location" | "sku";

/**
 * A count starts as a snapshot of the system quantities in one scope — a
 * warehouse, a location or a SKU. The counted quantities are entered on the
 * draft, and approval posts the differences.
 */
export function CountScopeForm({
  warehouses,
  locations,
  canSearchSku,
}: {
  warehouses: Warehouse[];
  locations: LocationInfo[];
  canSearchSku: boolean;
}) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const api = useApiForm();
  const [scope, setScope] = useState<Scope>("location");
  const [warehouseId, setWarehouseId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [sku, setSku] = useState<PickedSku | null>(null);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const found: Record<string, string> = {};
    if (scope === "warehouse" && !warehouseId) found.scope = t("errors.scope");
    if (scope === "location" && !locationId) found.scope = t("errors.scope");
    if (scope === "sku" && !sku) found.scope = t("errors.scope");
    if (reason.trim().length < 3) found.reason = t("errors.reason");
    setErrors(found);
    if (Object.keys(found).length) return;
    const created = await api.run(() =>
      unwrap(
        browserApi.POST("/admin/inventory/counts", {
          body: {
            reason: reason.trim(),
            ...(scope === "warehouse" ? { warehouse_id: warehouseId } : {}),
            ...(scope === "location" ? { location_id: locationId } : {}),
            ...(scope === "sku" && sku ? { variant_id: sku.variantId } : {}),
          },
        }),
      ),
    );
    if (created) router.push(documentHref("count", created.id));
  }

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        noValidate
        data-testid="count-scope-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-sm font-semibold">{t("count.scope")}</legend>
          {(["warehouse", "location", "sku"] as const).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="scope"
                className="size-4"
                checked={scope === option}
                disabled={option === "sku" && !canSearchSku}
                onChange={() => setScope(option)}
                data-testid={`count-scope-${option}`}
              />
              {t(`count.scopes.${option}`)}
            </label>
          ))}
        </fieldset>
        {scope === "warehouse" ? (
          <Field label={t("filters.warehouse")} name="scope" error={errors.scope}>
            <Select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} data-testid="count-warehouse">
              <option value="">{t("pickWarehouse")}</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} · {warehouse.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {scope === "location" ? (
          <Field label={t("filters.location")} name="scope" error={errors.scope}>
            <Select value={locationId} onChange={(event) => setLocationId(event.target.value)} data-testid="count-location">
              <option value="">{t("pickLocation")}</option>
              {locations.map((info) => (
                <option key={info.id} value={info.id}>
                  {locationLabel(info)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {scope === "sku" ? (
          <Field label={t("columns.sku")} name="scope" error={errors.scope}>
            <div>
              <SkuPicker value={sku} onChange={setSku} testId="count-sku" />
            </div>
          </Field>
        ) : null}
        {canSearchSku ? null : <Alert tone="info">{t("skuPicker.needsCatalog")}</Alert>}
        <Field label={t("columns.reason")} name="reason" error={errors.reason ?? api.fieldErrors.reason}>
          <Textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} data-testid="count-reason" />
        </Field>
        <FormError kind={api.formError} detail={api.formErrorDetail} />
        <div className="flex justify-end">
          <Button type="submit" pending={api.pending} data-testid="count-create">
            {t("count.snapshot")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
