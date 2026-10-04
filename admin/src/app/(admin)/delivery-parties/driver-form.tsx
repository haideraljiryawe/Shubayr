"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import type { DeliveryParty } from "@/lib/delivery-parties";
import { isE164, toE164 } from "@/lib/phone";

/** What the list needs from a saved driver (POST and PATCH answer the same). */
type Saved = { id: string; name: string; duplicate_phone_warning: boolean };

const FIELDS = ["name", "phone", "vehicle_number", "description", "notes"] as const;
type FieldName = (typeof FIELDS)[number];

/**
 * Create or edit an external driver (drivers.manage): a person without an
 * account who carries orders. A phone already used by another party is
 * allowed; the API answers with a warning the list then shows.
 */
export function DriverForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: DeliveryParty | null;
  onDone: (saved: Saved, created: boolean) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("parties");
  const tCommon = useTranslations("common");
  const form = useApiForm();
  const [values, setValues] = useState<Record<FieldName, string>>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    vehicle_number: initial?.vehicle_number ?? "",
    description: initial?.description ?? "",
    notes: initial?.notes ?? "",
  });

  const set = (name: FieldName) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [name]: event.target.value }));
    form.clearField(name);
  };

  async function submit() {
    const phone = toE164(values.phone);
    const errors: Record<string, string> = {};
    if (!values.name.trim()) errors.name = t("form.nameRequired");
    if (!isE164(phone)) errors.phone = t("form.phoneInvalid");
    if (Object.keys(errors).length) {
      form.setFieldErrors(errors);
      return;
    }
    const body = {
      name: values.name.trim(),
      phone,
      vehicle_number: values.vehicle_number.trim(),
      description: values.description.trim(),
      notes: values.notes.trim(),
    };
    const saved = await form.run(() =>
      initial
        ? unwrap(browserApi.PATCH("/admin/external-drivers/{id}", { params: { path: { id: initial.id } }, body }))
        : unwrap(
            browserApi.POST("/admin/external-drivers", {
              // Optional fields are left out rather than sent empty.
              body: {
                name: body.name,
                phone: body.phone,
                ...(body.vehicle_number ? { vehicle_number: body.vehicle_number } : {}),
                ...(body.description ? { description: body.description } : {}),
                ...(body.notes ? { notes: body.notes } : {}),
              },
            }),
          ),
    );
    if (saved) onDone(saved, initial === null);
  }

  return (
    <Card>
      <form
        noValidate
        className="flex flex-col gap-4"
        data-testid="driver-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <h2 className="text-lg font-bold">{initial ? t("form.editTitle", { name: initial.name }) : t("form.createTitle")}</h2>
          <p className="text-sm text-text-muted">{t("form.hint")}</p>
        </div>
        <FormError kind={form.formError} detail={form.formErrorDetail} />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("form.name")} error={form.fieldErrors.name} name="name">
            <Input value={values.name} maxLength={120} data-testid="driver-name" onChange={set("name")} />
          </Field>
          <Field label={t("form.phone")} hint={t("form.phoneHint")} error={form.fieldErrors.phone} name="phone">
            <Input dir="ltr" inputMode="tel" autoComplete="off" value={values.phone} maxLength={32} data-testid="driver-phone" onChange={set("phone")} />
          </Field>
          <Field label={t("form.vehicle")} error={form.fieldErrors.vehicle_number} name="vehicle_number">
            <Input dir="ltr" value={values.vehicle_number} maxLength={80} data-testid="driver-vehicle" onChange={set("vehicle_number")} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("form.description")} error={form.fieldErrors.description} name="description">
            <Textarea value={values.description} maxLength={2000} data-testid="driver-description" onChange={set("description")} />
          </Field>
          <Field label={t("form.notes")} error={form.fieldErrors.notes} name="notes">
            <Textarea value={values.notes} maxLength={2000} data-testid="driver-notes" onChange={set("notes")} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              {tCommon("cancel")}
            </Button>
          ) : null}
          <Button type="submit" pending={form.pending} data-testid="driver-submit">
            {initial ? t("form.save") : t("form.create")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
