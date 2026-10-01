"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { NumberInput } from "@/components/forms/number-input";
import { useApiForm } from "@/components/forms/use-api-form";
import { DataTable, TableSearch, type Column, type TableState } from "@/components/table/data-table";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { SLUG_PATTERN, slugify, type Brand } from "@/lib/catalog";

type Dialog = { kind: "form"; brand: Brand | null } | { kind: "delete"; brand: Brand } | null;

export function BrandsView({ rows, state }: { rows: Brand[]; state: TableState }) {
  const t = useTranslations("brands");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; kind: ErrorKind; detail: string } | null>(null);
  const close = () => setDialog(null);
  const nameOf = (brand: Brand) => (locale === "ar" ? brand.name_ar : brand.name_en);

  async function toggleVisible(brand: Brand) {
    setToggling(brand.id);
    setRowError(null);
    try {
      await unwrap(
        browserApi.PATCH("/admin/brands/{id}", {
          params: { path: { id: brand.id } },
          body: { is_visible: !brand.is_visible },
        }),
      );
      toast(brand.is_visible ? t("hiddenToast", { name: nameOf(brand) }) : t("shownToast", { name: nameOf(brand) }));
      router.refresh();
    } catch (cause) {
      setRowError({ id: brand.id, kind: errorKind(cause), detail: cause instanceof Error ? cause.message : "" });
    } finally {
      setToggling(null);
    }
  }

  const columns: Column<Brand>[] = [
    {
      key: "name",
      header: t("columns.name"),
      cell: (brand) => (
        <div className="flex flex-col" data-testid={`brand-row-${brand.slug}`}>
          <span className="font-semibold">{nameOf(brand)}</span>
          <span className="text-xs text-text-muted">{locale === "ar" ? brand.name_en : brand.name_ar}</span>
        </div>
      ),
    },
    {
      key: "slug",
      header: t("columns.slug"),
      cell: (brand) => <code dir="ltr">{brand.slug}</code>,
    },
    {
      key: "sort",
      header: t("columns.sortOrder"),
      cell: (brand) => brand.sort_order,
    },
    {
      key: "visible",
      header: t("columns.visibility"),
      cell: (brand) => (
        <Badge tone={brand.is_visible ? "success" : "neutral"} data-testid={`brand-visibility-${brand.slug}`}>
          {brand.is_visible ? t("visible") : t("hidden")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columns.actions")}</span>,
      cell: (brand) => (
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "form", brand })} data-testid={`brand-edit-${brand.slug}`}>
              <Pencil className="size-4" aria-hidden />
              {t("edit")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              pending={toggling === brand.id}
              onClick={() => void toggleVisible(brand)}
              data-testid={`brand-toggle-${brand.slug}`}
            >
              {brand.is_visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              {brand.is_visible ? t("hide") : t("show")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-error-dark"
              onClick={() => setDialog({ kind: "delete", brand })}
              data-testid={`brand-delete-${brand.slug}`}
            >
              <Trash2 className="size-4" aria-hidden />
              {t("delete")}
            </Button>
          </div>
          {rowError?.id === brand.id ? <FormError kind={rowError.kind} detail={rowError.detail} /> : null}
        </div>
      ),
      className: "text-end",
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(brand) => brand.id}
        state={state}
        caption={t("title")}
        emptyLabel={t("empty")}
        testId="brands-table"
        toolbar={
          <>
            <TableSearch placeholder={t("search")} />
            <Button onClick={() => setDialog({ kind: "form", brand: null })} data-testid="brand-new">
              <Plus className="size-4" aria-hidden />
              {t("new")}
            </Button>
          </>
        }
      />

      {dialog?.kind === "form" ? (
        <BrandForm
          key={dialog.brand?.id ?? "new"}
          brand={dialog.brand}
          onClose={close}
          onSaved={(saved, created) => {
            toast(created ? t("created", { name: nameOf(saved) }) : t("saved", { name: nameOf(saved) }));
            close();
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("deleteTitle", { name: dialog?.kind === "delete" ? nameOf(dialog.brand) : "" })}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        requireReason={false}
        onClose={close}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await unwrap(browserApi.DELETE("/admin/brands/{id}", { params: { path: { id: dialog.brand.id } } }));
          toast(t("deleted"));
          router.refresh();
        }}
      />
    </>
  );
}

function BrandForm({
  brand,
  onClose,
  onSaved,
}: {
  brand: Brand | null;
  onClose: () => void;
  onSaved: (brand: Brand, created: boolean) => void;
}) {
  const t = useTranslations("brands");
  const api = useApiForm();
  const [nameAr, setNameAr] = useState(brand?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(brand?.name_en ?? "");
  const [slug, setSlug] = useState(brand?.slug ?? "");
  const [logo, setLogo] = useState(brand?.logo_url ?? "");
  const [sortOrder, setSortOrder] = useState<number | null>(brand?.sort_order ?? 0);
  const [visible, setVisible] = useState(brand?.is_visible ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const finalSlug = slug.trim() || slugify(nameEn);
    const found: Record<string, string> = {};
    if (!nameAr.trim()) found.name_ar = t("errors.nameAr");
    if (!nameEn.trim()) found.name_en = t("errors.nameEn");
    if (!SLUG_PATTERN.test(finalSlug)) found.slug = t("errors.slug");
    if (logo.trim() && !/^https?:\/\/\S+$/.test(logo.trim())) found.logo_url = t("errors.logo");
    if (sortOrder === null || sortOrder < 0) found.sort_order = t("errors.sortOrder");
    setErrors(found);
    if (Object.keys(found).length) return;

    // The API accepts only logos uploaded through the media service, so the
    // stored URL is sent back only when someone actually changed it.
    const nextLogo = logo.trim() || null;
    const body = {
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      slug: finalSlug,
      ...(nextLogo !== (brand?.logo_url ?? null) ? { logo_url: nextLogo } : {}),
      sort_order: sortOrder ?? 0,
      is_visible: visible,
    };
    const saved = await api.run(() =>
      brand
        ? unwrap(browserApi.PATCH("/admin/brands/{id}", { params: { path: { id: brand.id } }, body }))
        : unwrap(browserApi.POST("/admin/brands", { body })),
    );
    if (saved) onSaved(saved, !brand);
  }

  const error = (name: string) => errors[name] ?? api.fieldErrors[name] ?? null;

  return (
    <FormDialog
      open
      title={brand ? t("editTitle") : t("newTitle")}
      submitLabel={brand ? t("save") : t("create")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="brand-form"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("fields.nameAr")} name="name_ar" error={error("name_ar")}>
          <Input value={nameAr} dir="rtl" onChange={(e) => setNameAr(e.target.value)} data-testid="brand-name-ar" />
        </Field>
        <Field label={t("fields.nameEn")} name="name_en" error={error("name_en")}>
          <Input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} data-testid="brand-name-en" />
        </Field>
        <Field label={t("fields.slug")} name="slug" error={error("slug")} hint={t("fields.slugHint")}>
          <Input value={slug} dir="ltr" placeholder={slugify(nameEn)} onChange={(e) => setSlug(e.target.value)} data-testid="brand-slug" />
        </Field>
        <Field label={t("fields.sortOrder")} name="sort_order" error={error("sort_order")}>
          <NumberInput value={sortOrder} parse={{ integer: true, min: 0 }} onValueChange={setSortOrder} data-testid="brand-sort" />
        </Field>
      </div>
      <Field label={t("fields.logo")} name="logo_url" error={error("logo_url")} hint={t("fields.logoHint")}>
        <Input value={logo} dir="ltr" type="url" onChange={(e) => setLogo(e.target.value)} data-testid="brand-logo" />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} data-testid="brand-visible" />
        {t("fields.visible")}
      </label>
      <FormError kind={api.formError} detail={api.formErrorDetail} />
    </FormDialog>
  );
}
