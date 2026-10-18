"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { localName, type AdminGovernorate } from "@/lib/delivery-pricing";

/**
 * The 18 governorates and Halabja. An inactive one is not offered in the
 * store's address forms; which zone serves each one is set on the zones tab.
 */
export function GovernoratesView({ governorates }: { governorates: AdminGovernorate[] }) {
  const t = useTranslations("governorates");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<AdminGovernorate | null>(null);

  return (
    <>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[36rem] text-sm" data-testid="governorates-table">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="bg-card text-text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 text-start font-semibold">{t("columns.nameAr")}</th>
              <th scope="col" className="px-4 py-3 text-start font-semibold">{t("columns.nameEn")}</th>
              <th scope="col" className="px-4 py-3 text-start font-semibold">{t("columns.zone")}</th>
              <th scope="col" className="px-4 py-3 text-start font-semibold">{t("columns.status")}</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">{t("columns.actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {governorates.map((governorate) => (
              <tr key={governorate.id} className="border-t border-border" data-testid="governorate-row" data-code={governorate.code}>
                <td className="px-4 py-3 font-semibold" dir="rtl">{governorate.name_ar}</td>
                <td className="px-4 py-3" dir="ltr">{governorate.name_en}</td>
                <td className="px-4 py-3">
                  {governorate.delivery_zone ? (
                    <span>
                      {localName(governorate.delivery_zone, locale)}
                      {governorate.delivery_zone.is_active ? null : <Badge className="ms-2">{t("zoneInactive")}</Badge>}
                    </span>
                  ) : (
                    <Badge tone="warning">{t("noZone")}</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={governorate.is_active ? "success" : "neutral"} data-testid="governorate-status">
                    {governorate.is_active ? t("active") : t("inactive")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(governorate)} data-testid="governorate-edit">
                    <Pencil className="size-4" aria-hidden />
                    {t("edit")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {editing ? (
        <GovernorateForm
          key={editing.id}
          governorate={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            toast(t("saved", { name }));
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function GovernorateForm({
  governorate,
  onClose,
  onSaved,
}: {
  governorate: AdminGovernorate;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const t = useTranslations("governorates");
  const locale = useLocale();
  const api = useApiForm();
  const [nameAr, setNameAr] = useState(governorate.name_ar);
  const [nameEn, setNameEn] = useState(governorate.name_en);
  const [active, setActive] = useState(governorate.is_active);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const found: Record<string, string> = {};
    if (!nameAr.trim()) found.name_ar = t("errors.nameAr");
    if (!nameEn.trim()) found.name_en = t("errors.nameEn");
    setErrors(found);
    if (Object.keys(found).length) return;
    const saved = await api.run(() =>
      unwrap(
        browserApi.PATCH("/admin/governorates/{id}", {
          params: { path: { id: governorate.id } },
          body: { name_ar: nameAr.trim(), name_en: nameEn.trim(), is_active: active },
        }),
      ),
    );
    if (saved) onSaved(localName(saved, locale));
  }

  return (
    <FormDialog
      open
      title={t("editTitle", { name: localName(governorate, locale) })}
      submitLabel={t("save")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="governorate-form"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("columns.nameAr")} name="name_ar" error={errors.name_ar ?? api.fieldErrors.name_ar}>
          <Input value={nameAr} dir="rtl" maxLength={120} onChange={(e) => setNameAr(e.target.value)} data-testid="governorate-name-ar" />
        </Field>
        <Field label={t("columns.nameEn")} name="name_en" error={errors.name_en ?? api.fieldErrors.name_en}>
          <Input value={nameEn} dir="ltr" maxLength={120} onChange={(e) => setNameEn(e.target.value)} data-testid="governorate-name-en" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} data-testid="governorate-active" />
        {t("activeLabel")}
      </label>
      <p className="-mt-2 text-xs text-text-muted">{t("activeHint")}</p>
      <FormError kind={api.formError} detail={api.formErrorDetail} />
    </FormDialog>
  );
}
