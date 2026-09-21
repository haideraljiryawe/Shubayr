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
import { isE164, toE164, type Address, type AddressCreate } from "@/lib/api";

/* ---------------------------------------------------------------------------
 * Create / edit one saved address.
 *
 * The fields are the contract's AddressCreate. `contact_phone` is part of that
 * shape and belongs to the address rather than the account — an order can go to
 * someone else's number — so it is collected here and normalised to E.164,
 * which the server has required since v5.3.0.
 * ------------------------------------------------------------------------- */

export interface AddressValues {
  label: string;
  city: string;
  area: string;
  street: string;
  details: string;
  /** The recipient's number for THIS address, as typed. Normalised on submit. */
  phone: string;
  is_default: boolean;
}

export const EMPTY_ADDRESS: AddressValues = {
  label: "",
  city: "",
  area: "",
  street: "",
  details: "",
  phone: "",
  is_default: false,
};

export function valuesFromAddress(address: Address): AddressValues {
  return {
    label: address.label ?? "",
    city: address.city ?? "",
    area: address.area ?? "",
    street: address.street ?? "",
    details: address.details ?? "",
    phone: address.contact_phone ?? "",
    is_default: address.is_default ?? false,
  };
}

/**
 * `contact_phone` is the recipient's number for this address, which may differ
 * from the account's — a gift going to a relative is the obvious case — so the
 * form collects it rather than assuming the signed-in number.
 *
 * Since contract v5.3.0 the server enforces E.164, so the typed number is
 * normalised here: Iraqi customers write "07701234567" and the API wants
 * "+9647701234567". Create and edit both go through this one function, which
 * is what keeps the two paths from drifting apart.
 */
export function toAddressCreate(values: AddressValues): AddressCreate {
  return {
    label: values.label.trim(),
    city: values.city.trim(),
    area: values.area.trim(),
    street: values.street.trim(),
    details: values.details.trim() || null,
    contact_phone: toE164(values.phone.trim()),
    is_default: values.is_default,
  };
}

/**
 * The fields that differ from the address as it stands on the server.
 *
 * PATCH validates the MERGED state, and `additionalProperties: false` with
 * `minProperties: 1` means resending an unchanged field is not free: it is a
 * value the server re-validates and, for `is_default`, re-acts on. Sending
 * only what actually changed keeps an edit to the street from also clearing
 * and re-setting the default flag.
 */
export function addressPatchFor(
  address: Address,
  values: AddressValues,
): Partial<AddressCreate> {
  const next = toAddressCreate(values);
  const current = valuesFromAddress(address);
  const before = toAddressCreate(current);

  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof AddressCreate)[]) {
    if (next[key] !== before[key]) patch[key] = next[key];
  }
  return patch as Partial<AddressCreate>;
}

type FieldName = "label" | "city" | "area" | "street" | "phone";

const REQUIRED: FieldName[] = ["label", "city", "area", "street", "phone"];

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
    // Catch a number the server would reject before spending a round trip on
    // it, using the contract's own pattern against the normalised form.
    if (!found.phone && !isE164(toE164(values.phone.trim()))) {
      found.phone = t("errPhone");
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
          label={t("phone")}
          htmlFor={fieldId("phone")}
          hint={t("phoneHint")}
          error={errors.phone}
        >
          <Input
            id={fieldId("phone")}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            // A phone number is a Latin-digit run even in the Arabic UI.
            dir="ltr"
            value={values.phone}
            invalid={Boolean(errors.phone)}
            aria-describedby={
              errors.phone ? fieldErrorId(fieldId("phone")) : undefined
            }
            placeholder={t("phonePlaceholder")}
            data-testid="address-phone"
            onChange={(event) => set("phone", event.target.value)}
          />
        </Field>

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
