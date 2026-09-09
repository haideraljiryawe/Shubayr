"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Address, AddressInput } from "@/lib/api";

/* ---------------------------------------------------------------------------
 * Create / edit one saved address.
 *
 * The fields are the contract's AddressInput — no recipient name or phone,
 * because a signed-in customer's contact details live on their profile. That is
 * the difference from the guest checkout form, which has to collect them.
 * ------------------------------------------------------------------------- */

export interface AddressValues {
  label: string;
  city: string;
  area: string;
  street: string;
  details: string;
  is_default: boolean;
}

export const EMPTY_ADDRESS: AddressValues = {
  label: "",
  city: "",
  area: "",
  street: "",
  details: "",
  is_default: false,
};

export function valuesFromAddress(address: Address): AddressValues {
  return {
    label: address.label ?? "",
    city: address.city ?? "",
    area: address.area ?? "",
    street: address.street ?? "",
    details: address.details ?? "",
    is_default: address.is_default ?? false,
  };
}

export function toAddressInput(values: AddressValues): AddressInput {
  return {
    label: values.label.trim(),
    city: values.city.trim(),
    area: values.area.trim(),
    street: values.street.trim(),
    details: values.details.trim() || null,
    is_default: values.is_default,
  };
}

type FieldName = "label" | "city" | "area" | "street";

const REQUIRED: FieldName[] = ["label", "city", "area", "street"];

export function AddressEditor({
  title,
  values,
  onChange,
  onSubmit,
  onCancel,
  saving,
  error,
}: {
  title: string;
  values: AddressValues;
  onChange: (next: AddressValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const t = useTranslations("addresses");
  const ids = useId();
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});

  const fieldId = (name: string) => `${ids}-${name}`;

  const set = (name: keyof AddressValues, value: string | boolean) => {
    onChange({ ...values, [name]: value });
    if (name in errors) setErrors({ ...errors, [name as FieldName]: undefined });
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: Partial<Record<FieldName, string>> = {};
    for (const name of REQUIRED) {
      if (!values[name].trim()) found[name] = t("errRequired");
    }
    setErrors(found);

    const firstInvalid = REQUIRED.find((name) => found[name]);
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }
    onSubmit();
  }

  const text = (name: FieldName, autoComplete?: string) => (
    <Field label={t(name)} htmlFor={fieldId(name)} error={errors[name]}>
      <Input
        id={fieldId(name)}
        name={name}
        autoComplete={autoComplete}
        value={values[name]}
        invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? fieldErrorId(fieldId(name)) : undefined}
        placeholder={t(`${name}Placeholder`)}
        data-testid={`address-${name}`}
        onChange={(event) => set(name, event.target.value)}
      />
    </Field>
  );

  return (
    <Card padding="md" data-testid="address-editor">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h3 className="text-base font-bold text-text">{title}</h3>

        {error ? (
          <p
            role="alert"
            data-testid="address-error"
            className="rounded-md border border-error/40 bg-error/8 px-3 py-2 text-sm font-medium text-error-dark"
          >
            {error}
          </p>
        ) : Object.values(errors).some(Boolean) ? (
          <p
            role="alert"
            className="rounded-md border border-error/40 bg-error/8 px-3 py-2 text-sm font-medium text-error-dark"
          >
            {t("errSummary")}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {text("label")}
          {text("city", "address-level1")}
          {text("area", "address-level2")}
          {text("street", "address-line1")}
        </div>

        <Field
          label={t("details")}
          htmlFor={fieldId("details")}
          hint={t("detailsHint")}
        >
          <Textarea
            id={fieldId("details")}
            name="details"
            rows={3}
            value={values.details}
            placeholder={t("detailsPlaceholder")}
            data-testid="address-details"
            onChange={(event) => set("details", event.target.value)}
          />
        </Field>

        <Checkbox
          label={t("makeDefaultField")}
          checked={values.is_default}
          data-testid="address-default"
          onChange={(event) => set("is_default", event.target.checked)}
        />

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            variant="cta"
            disabled={saving}
            data-testid="address-save"
            startIcon={
              saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null
            }
          >
            {saving ? t("saving") : t("save")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
