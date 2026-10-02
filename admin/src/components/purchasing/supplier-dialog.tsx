"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { NumberInput } from "@/components/forms/number-input";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import type { CurrencyCode, Supplier } from "@/lib/purchasing";

/** Create or edit a supplier: name, contacts, default currency and payment terms. */
export function SupplierDialog({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
}) {
  const t = useTranslations("purchasing.suppliers");
  const toast = useToast();
  const api = useApiForm();
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(supplier?.default_currency ?? "IQD");
  const [terms, setTerms] = useState<number | null>(supplier?.payment_terms_days ?? 30);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const found: Record<string, string> = {};
    if (name.trim().length < 2 || name.trim().length > 160) found.name = t("errors.name");
    if (terms === null || terms < 0 || terms > 3650) found.payment_terms_days = t("errors.terms");
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) found.email = t("errors.email");
    setErrors(found);
    if (Object.keys(found).length || terms === null) return;
    const body = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      default_currency: currency,
      payment_terms_days: terms,
    };
    const saved = await api.run(() =>
      supplier
        ? unwrap(browserApi.PATCH("/admin/suppliers/{id}", { params: { path: { id: supplier.id } }, body }))
        : unwrap(browserApi.POST("/admin/suppliers", { body })),
    );
    if (!saved) return;
    toast(supplier ? t("saved") : t("created", { name: saved.name }));
    onSaved(saved);
  }

  return (
    <FormDialog
      open
      title={supplier ? t("editTitle", { name: supplier.name }) : t("new")}
      submitLabel={supplier ? t("save") : t("create")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="supplier-dialog"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("columns.name")} name="name" error={errors.name ?? api.fieldErrors.name}>
          <Input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} data-testid="supplier-name" />
        </Field>
        <Field label={t("columns.phone")} name="phone" error={api.fieldErrors.phone}>
          <Input value={phone} maxLength={32} dir="ltr" inputMode="tel" onChange={(event) => setPhone(event.target.value)} />
        </Field>
        <Field label={t("email")} name="email" error={errors.email ?? api.fieldErrors.email}>
          <Input value={email} maxLength={160} dir="ltr" type="email" onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label={t("columns.currency")} name="default_currency" hint={t("currencyHint")}>
          <Select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} data-testid="supplier-currency">
            <option value="IQD">IQD</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
        <Field label={t("columns.terms")} name="payment_terms_days" error={errors.payment_terms_days ?? api.fieldErrors.payment_terms_days} hint={t("termsHint")}>
          <NumberInput value={terms} onValueChange={setTerms} parse={{ integer: true, min: 0, max: 3650 }} data-testid="supplier-terms" />
        </Field>
        <Field label={t("address")} name="address">
          <Input value={address} maxLength={1000} onChange={(event) => setAddress(event.target.value)} />
        </Field>
      </div>
      <Field label={t("notes")} name="notes">
        <Textarea value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <FormError kind={api.formError} detail={api.formErrorDetail} />
    </FormDialog>
  );
}
