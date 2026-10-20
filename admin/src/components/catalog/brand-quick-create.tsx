"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { englishOrArabic, slugFor, uniqueSlug, type Brand } from "@/lib/catalog";

/**
 * A brand made without leaving the product: the Arabic name is enough (the
 * English one defaults to it), and the slug is made from the name and kept
 * clear of every brand already loaded. The full brand screen still edits
 * the rest — logo, order, visibility.
 */
export function BrandQuickCreate({
  open,
  existing,
  onClose,
  onCreated,
}: {
  open: boolean;
  existing: readonly Brand[];
  onClose: () => void;
  onCreated: (brand: Brand) => void;
}) {
  const t = useTranslations("brands");
  const api = useApiForm();
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!nameAr.trim()) {
      setError(t("errors.nameAr"));
      return;
    }
    setError(null);
    const slug = uniqueSlug(slugFor(nameEn, nameAr), existing.map((brand) => brand.slug));
    const created = await api.run(() =>
      unwrap(
        browserApi.POST("/admin/brands", {
          body: {
            name_ar: nameAr.trim(),
            name_en: englishOrArabic(nameEn, nameAr),
            slug,
            is_visible: true,
            sort_order: 0,
          },
        }),
      ),
    );
    if (created) {
      setNameAr("");
      setNameEn("");
      onCreated(created);
    }
  }

  return (
    <FormDialog
      open={open}
      title={t("newTitle")}
      submitLabel={t("create")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="brand-quick-form"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("fields.nameAr")} name="name_ar" error={error ?? api.fieldErrors.name_ar}>
          <Input value={nameAr} dir="rtl" onChange={(e) => setNameAr(e.target.value)} data-testid="brand-quick-name-ar" />
        </Field>
        <Field label={t("fields.nameEnOptional")} name="name_en" error={api.fieldErrors.name_en} hint={t("fields.nameEnHint")}>
          <Input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} data-testid="brand-quick-name-en" />
        </Field>
      </div>
      <FormError kind={api.formError} code={api.formErrorCode} />
    </FormDialog>
  );
}
