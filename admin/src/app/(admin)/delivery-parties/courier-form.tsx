"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { courierBody, courierPatch, courierValues, type CourierValues, type DeliveryParty } from "@/lib/delivery-parties";
import { isE164 } from "@/lib/phone";

/** What the list needs from a saved company (POST and PATCH answer the same). */
type Saved = { id: string; name: string; duplicate_phone_warning: boolean };

/**
 * Create or edit a courier company (drivers.manage, contract 17.8.0): a
 * delivery company without an account — a company name, a phone and an
 * optional contact person. It is assigned, handed orders and hands in cash
 * exactly like the store's own drivers; it has no trip fares.
 */
export function CourierForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: DeliveryParty | null;
  onDone: (saved: Saved, created: boolean) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("parties.courier");
  const tForm = useTranslations("parties.form");
  const tCommon = useTranslations("common");
  const form = useApiForm();
  const [values, setValues] = useState<CourierValues>(() => courierValues(initial));

  const set = (name: keyof CourierValues, apiName: string) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [name]: event.target.value }));
    form.clearField(apiName);
  };

  async function submit() {
    const body = courierBody(values);
    const errors: Record<string, string> = {};
    if (!body.company_name) errors.company_name = t("nameRequired");
    if (!isE164(body.phone)) errors.phone = tForm("phoneInvalid");
    if (Object.keys(errors).length) {
      form.setFieldErrors(errors);
      return;
    }
    const saved = await form.run(() => {
      if (!initial) return unwrap(browserApi.POST("/admin/courier-companies", { body }));
      const patch = courierPatch(initial, values);
      return patch
        ? unwrap(browserApi.PATCH("/admin/courier-companies/{id}", { params: { path: { id: initial.id } }, body: patch }))
        : Promise.resolve({ id: initial.id, name: initial.name, duplicate_phone_warning: false });
    });
    if (saved) onDone(saved, initial === null);
  }

  return (
    <Card id={initial ? undefined : "courier-form"} className="scroll-mt-20">
      <form
        noValidate
        className="flex flex-col gap-4"
        data-testid="courier-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <h2 className="text-section">{initial ? tForm("editTitle", { name: initial.name }) : t("createTitle")}</h2>
          <p className="text-body text-text-muted">{t("hint")}</p>
        </div>
        <FormError kind={form.formError} code={form.formErrorCode} />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("name")} error={form.fieldErrors.company_name} name="company_name">
            <Input value={values.companyName} maxLength={120} dir="auto" data-testid="courier-name" onChange={set("companyName", "company_name")} />
          </Field>
          <Field label={tForm("phone")} hint={tForm("phoneHint")} error={form.fieldErrors.phone} name="phone">
            <Input dir="ltr" inputMode="tel" autoComplete="off" value={values.phone} maxLength={32} data-testid="courier-phone" onChange={set("phone", "phone")} />
          </Field>
          <Field label={t("contactPerson")} error={form.fieldErrors.contact_person} name="contact_person">
            <Input value={values.contactPerson} maxLength={120} dir="auto" data-testid="courier-contact" onChange={set("contactPerson", "contact_person")} />
          </Field>
        </div>
        <Field label={tForm("notes")} error={form.fieldErrors.notes} name="notes">
          <Textarea value={values.notes} maxLength={2000} data-testid="courier-notes" onChange={set("notes", "notes")} />
        </Field>
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              {tCommon("cancel")}
            </Button>
          ) : null}
          <Button type="submit" pending={form.pending} data-testid="courier-submit">
            {initial ? tForm("save") : t("create")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
