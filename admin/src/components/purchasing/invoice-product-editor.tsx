"use client";

import { forwardRef } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Save, X } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { DecimalInput } from "@/components/forms/decimal-input";
import { Field } from "@/components/forms/field";
import { SkuPicker } from "@/components/inventory/sku-picker";
import { locationLabel, type LocationInfo } from "@/lib/inventory";
import type { EntryErrors, InvoiceEntry } from "@/lib/invoice-entry";
import { cn } from "@/lib/cn";

/**
 * The one product editor of a purchase invoice (VIS-022), above the list of
 * invoice products. In add mode it adds the product as one summary row and
 * comes back empty for the next one; in edit mode it holds one row's values,
 * "Save changes" puts them back in that row and "Cancel editing" leaves the
 * row as it was. Errors show beside their fields and no incomplete row is
 * ever created. Nothing here posts the invoice.
 */
export const InvoiceProductEditor = forwardRef<
  HTMLDivElement,
  {
    entry: InvoiceEntry;
    onChange: (patch: Partial<InvoiceEntry>) => void;
    /** Shown after a failed Add / Save. */
    errors: EntryErrors;
    mode: "add" | "edit";
    onSubmit: () => void;
    onCancelEdit: () => void;
    currency: string;
    locations: LocationInfo[];
    manualShares: boolean;
    /** Changes when the editor is loaded or cleared, so its number fields start again. */
    generation: number;
    disabled?: boolean;
  }
>(function InvoiceProductEditor(
  { entry, onChange, errors, mode, onSubmit, onCancelEdit, currency, locations, manualShares, generation, disabled = false },
  ref,
) {
  const t = useTranslations("purchasing.invoice");
  const unit = entry.sku?.baseUnit ?? "";
  const error = (field: keyof EntryErrors) => (errors[field] ? t(`errors.${errors[field]}`) : undefined);
  const editing = mode === "edit";

  return (
    <div
      ref={ref}
      className={cn("flex scroll-mt-24 flex-col gap-4 rounded-lg border p-4", editing ? "border-primary bg-primary/5" : "border-border bg-surface")}
      data-testid="invoice-editor"
      data-mode={mode}
    >
      <h3 className="flex items-center gap-2 text-base font-bold" data-testid="invoice-editor-title">
        {editing ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        {editing ? t("editor.editTitle") : t("editor.addTitle")}
      </h3>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <Field label={t("editor.product")} name="variant_id" error={error("sku")}>
            <div>
              <SkuPicker
                value={entry.sku}
                onChange={(sku) => onChange({ sku })}
                placeholder={t("editor.searchPlaceholder")}
                testId="line-sku"
                disabled={disabled}
              />
            </div>
          </Field>
        </div>
        <Field key={`packs-${generation}`} label={t("packs")} name="quantity" error={error("packs")} hint={t("packsHint")}>
          <DecimalInput value={entry.packs} parse={{ maxDecimals: 3 }} disabled={disabled} onValueChange={(_, text) => onChange({ packs: text.trim() })} data-testid="line-packs" />
        </Field>
        <Field key={`size-${generation}`} label={t("packSize", { unit: unit || t("baseUnits") })} name="pack_size" error={error("packSize")}>
          <DecimalInput value={entry.packSize} parse={{ maxDecimals: 3 }} disabled={disabled} onValueChange={(_, text) => onChange({ packSize: text.trim() })} data-testid="line-pack-size" />
        </Field>
        <Field
          key={`cost-${generation}`}
          label={t("costPerPack", { currency })}
          name="unit_cost"
          error={error("cost")}
          hint={entry.lastCost ? t("restock.lastCost", { cost: entry.lastCost.value, currency: entry.lastCost.currency }) : undefined}
        >
          <DecimalInput value={entry.cost} parse={{ maxDecimals: 6 }} disabled={disabled} onValueChange={(_, text) => onChange({ cost: text.trim() })} data-testid="line-cost" />
        </Field>
        <Field label={t("lineLocation")} name="location_id">
          <Select value={entry.locationId} disabled={disabled} onValueChange={(value) => onChange({ locationId: value })} data-testid="line-location">
            <option value="">{t("useDefaultLocation")}</option>
            {locations.map((info) => (
              <option key={info.id} value={info.id}>
                {locationLabel(info)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("lot")} name="lot_number">
          <Input value={entry.lot} maxLength={80} dir="ltr" disabled={disabled} onChange={(event) => onChange({ lot: event.target.value })} data-testid="line-lot" />
        </Field>
        <Field label={entry.sku?.tracksExpiry ? t("expiryTracked") : t("expiry")} name="expiry_date">
          <Input type="date" value={entry.expiry} disabled={disabled} onChange={(event) => onChange({ expiry: event.target.value })} data-testid="line-expiry" />
        </Field>
        {manualShares ? (
          <Field key={`manual-${generation}`} label={t("manualShare")} name="manual_landed_cost_iqd">
            <DecimalInput value={entry.manual} parse={{ maxDecimals: 4 }} disabled={disabled} onValueChange={(_, text) => onChange({ manual: text.trim() })} data-testid="line-manual" />
          </Field>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <Button variant="ghost" onClick={onCancelEdit} disabled={disabled} data-testid="invoice-editor-cancel">
            <X className="size-4" aria-hidden />
            {t("editor.cancelEdit")}
          </Button>
        ) : null}
        <Button variant={editing ? "primary" : "secondary"} onClick={onSubmit} disabled={disabled} data-testid="invoice-editor-submit">
          {editing ? <Save className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {editing ? t("editor.save") : t("editor.add")}
        </Button>
      </div>
    </div>
  );
});
