"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, fieldErrorId } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AddressInput } from "@/lib/api";

/* ---------------------------------------------------------------------------
 * Delivery address.
 *
 * The contract's AddressInput has no recipient name or phone — those live on
 * the user account — so a guest supplies them here: the name rides in the
 * address `label`, and the phone seeds the sign-in step. When saved addresses
 * arrive with authentication, this form becomes the "new address" half of a
 * list; `savedAddresses` is where that list renders.
 * ------------------------------------------------------------------------- */

export interface DeliveryDetails {
  name: string;
  phone: string;
  city: string;
  area: string;
  street: string;
  details: string;
  /** "lat, lng" as typed; parsed into the contract's numeric pair. */
  mapPoint: string;
}

export const EMPTY_DELIVERY: DeliveryDetails = {
  name: "",
  phone: "",
  city: "",
  area: "",
  street: "",
  details: "",
  mapPoint: "",
};

/** Iraqi mobile numbers: 11 digits beginning 07. */
const PHONE_PATTERN = /^07\d{9}$/;
const MAP_POINT_PATTERN = /^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/;

export type DeliveryErrors = Partial<Record<keyof DeliveryDetails, string>>;

/** Digits only, so a number typed as 0770 123 4567 still validates. */
function normalisePhone(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function validateDelivery(
  values: DeliveryDetails,
  t: (key: string) => string,
): DeliveryErrors {
  const errors: DeliveryErrors = {};
  if (!values.name.trim()) errors.name = t("errRequired");
  if (!PHONE_PATTERN.test(normalisePhone(values.phone))) {
    errors.phone = t("errPhone");
  }
  if (!values.city.trim()) errors.city = t("errRequired");
  if (!values.area.trim()) errors.area = t("errRequired");
  if (!values.street.trim()) errors.street = t("errRequired");
  if (values.mapPoint.trim() && !MAP_POINT_PATTERN.test(values.mapPoint)) {
    errors.mapPoint = t("errMapPoint");
  }
  return errors;
}

/** Map the form onto the contract's AddressInput. */
export function toAddressInput(values: DeliveryDetails): AddressInput {
  const point = values.mapPoint.trim().match(MAP_POINT_PATTERN);

  return {
    label: values.name.trim(),
    city: values.city.trim(),
    area: values.area.trim(),
    street: values.street.trim(),
    details: values.details.trim() || null,
    lat: point ? Number(point[1]) : null,
    lng: point ? Number(point[3]) : null,
    // Saved-address management arrives with authentication; a guest's one-off
    // address is never the account default.
    is_default: false,
  };
}

export function AddressForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  children,
}: {
  values: DeliveryDetails;
  onChange: (next: DeliveryDetails) => void;
  onSubmit: () => void;
  submitLabel: string;
  /** Payment block, rendered above the submit button. */
  children?: ReactNode;
}) {
  const t = useTranslations("checkout");
  const ids = useId();
  const [errors, setErrors] = useState<DeliveryErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const fieldId = (name: keyof DeliveryDetails) => `${ids}-${name}`;

  const set = (name: keyof DeliveryDetails, value: string) => {
    onChange({ ...values, [name]: value });
    // Clear a field's error as soon as it is edited; re-validated on submit.
    if (errors[name]) setErrors({ ...errors, [name]: undefined });
  };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateDelivery(values, t);
    setErrors(found);
    setSubmitted(true);

    const firstInvalid = (Object.keys(found) as (keyof DeliveryDetails)[])[0];
    if (firstInvalid) {
      // Keyboard and screen-reader users land on the problem, not the top.
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }
    onSubmit();
  }

  const hasErrors = Object.values(errors).some(Boolean);

  const text = (
    name: keyof DeliveryDetails,
    {
      type = "text",
      autoComplete,
      dir,
      inputMode,
    }: {
      type?: string;
      autoComplete?: string;
      dir?: "ltr";
      inputMode?: "text" | "tel" | "numeric";
    } = {},
  ) => (
    <Field
      label={t(name)}
      htmlFor={fieldId(name)}
      error={errors[name]}
      hint={name === "details" ? t("detailsHint") : undefined}
    >
      <Input
        id={fieldId(name)}
        name={name}
        type={type}
        dir={dir}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={values[name]}
        invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? fieldErrorId(fieldId(name)) : undefined}
        placeholder={t(`${name}Placeholder`)}
        onChange={(event) => set(name, event.target.value)}
        data-testid={`address-${name}`}
      />
    </Field>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <Card padding="md" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-bold text-text">{t("stepAddress")}</h2>
          <p className="flex items-start gap-1.5 text-xs text-text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("savedAddressesSoon")}
          </p>
        </div>

        {submitted && hasErrors ? (
          <p
            role="alert"
            className="rounded-md border border-error/40 bg-error/8 px-3 py-2 text-sm font-medium text-error-dark"
          >
            {t("errSummary")}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {text("name", { autoComplete: "name" })}
          {text("phone", {
            type: "tel",
            autoComplete: "tel",
            dir: "ltr",
            inputMode: "tel",
          })}
          {text("city", { autoComplete: "address-level1" })}
          {text("area", { autoComplete: "address-level2" })}
        </div>

        {text("street", { autoComplete: "address-line1" })}

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
            onChange={(event) => set("details", event.target.value)}
            data-testid="address-details"
          />
        </Field>

        <Field
          label={t("mapPoint")}
          htmlFor={fieldId("mapPoint")}
          error={errors.mapPoint}
          hint={t("mapPointHint")}
        >
          <Input
            id={fieldId("mapPoint")}
            name="mapPoint"
            dir="ltr"
            inputMode="text"
            value={values.mapPoint}
            invalid={Boolean(errors.mapPoint)}
            aria-describedby={
              errors.mapPoint ? fieldErrorId(fieldId("mapPoint")) : undefined
            }
            placeholder={t("mapPointPlaceholder")}
            onChange={(event) => set("mapPoint", event.target.value)}
            data-testid="address-mapPoint"
          />
        </Field>
      </Card>

      {children}

      <Button
        type="submit"
        variant="cta"
        size="lg"
        block
        data-testid="address-submit"
      >
        {submitLabel}
      </Button>
    </form>
  );
}
