"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeftRight, FolderPlus, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { NumberInput } from "@/components/forms/number-input";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import {
  canConvertToBrand,
  canHaveChildren,
  conversionTargets,
  departments,
  flattenTree,
  legacyNodes,
  parentChoices,
  SLUG_PATTERN,
  slugify,
  type Category,
} from "@/lib/catalog";

type Dialog =
  | { kind: "create"; parent: Category | null }
  | { kind: "edit"; category: Category }
  | { kind: "convert"; category: Category }
  | { kind: "delete"; category: Category }
  | null;

function nameOf(category: Category, locale: string): string {
  return (locale === "ar" ? category.name_ar : category.name_en) || category.name_en || category.name_ar || "";
}

/**
 * The two-level tree: departments, each with its subcategories. Adding a
 * child is offered on departments only, and a category's parent can only be
 * a department — so the screen cannot build a third level. Anything deeper
 * that an older tree still holds is listed for review (convert it to a brand,
 * or move it under a department).
 */
export function CategoriesView({ tree, canConvert }: { tree: Category[]; canConvert: boolean }) {
  const t = useTranslations("categories");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const legacy = legacyNodes(tree);
  const close = () => setDialog(null);

  const row = (category: Category, depth: number) => {
    const leaf = canConvertToBrand(category);
    return (
      <li
        key={category.id}
        className="flex flex-wrap items-center gap-3 border-t border-border py-2.5 first:border-t-0"
        data-testid={`category-row-${category.slug}`}
        data-depth={depth}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">
            {nameOf(category, locale)}
            {depth >= 2 ? (
              <Badge tone="warning" className="ms-2" data-testid="legacy-badge">
                <TriangleAlert className="me-1 size-3" aria-hidden />
                {t("legacyBadge")}
              </Badge>
            ) : null}
            {category.is_visible === false ? (
              <Badge className="ms-2">{t("hidden")}</Badge>
            ) : null}
          </span>
          <span className="text-xs text-text-muted" dir="ltr">
            {nameOf(category, locale === "ar" ? "en" : "ar")} · /{category.slug}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {canHaveChildren(category) ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDialog({ kind: "create", parent: category })}
              data-testid={`category-add-child-${category.slug}`}
            >
              <FolderPlus className="size-4" aria-hidden />
              {t("addSubcategory")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDialog({ kind: "edit", category })}
            data-testid={`category-edit-${category.slug}`}
          >
            <Pencil className="size-4" aria-hidden />
            {t("edit")}
          </Button>
          {canConvert && leaf ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDialog({ kind: "convert", category })}
              data-testid={`category-convert-${category.slug}`}
            >
              <ArrowLeftRight className="size-4" aria-hidden />
              {t("convert.action")}
            </Button>
          ) : null}
          {leaf ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-error-dark"
              onClick={() => setDialog({ kind: "delete", category })}
              data-testid={`category-delete-${category.slug}`}
            >
              <Trash2 className="size-4" aria-hidden />
              {t("delete")}
            </Button>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{t("twoLevels")}</p>
        <Button onClick={() => setDialog({ kind: "create", parent: null })} data-testid="category-new">
          <Plus className="size-4" aria-hidden />
          {t("newDepartment")}
        </Button>
      </div>

      {legacy.length ? (
        <Alert tone="info" data-testid="legacy-alert">
          {t("legacyAlert", { count: legacy.length })}
        </Alert>
      ) : null}

      {departments(tree).length === 0 ? (
        <Card className="text-sm text-text-muted" data-testid="categories-empty">
          {t("empty")}
        </Card>
      ) : null}

      {departments(tree).map((department) => {
        // Subcategories, and — flagged — anything an older tree nests deeper.
        const below = flattenTree(department.children ?? [], 1);
        return (
          <Card key={department.id} className="p-0" data-testid={`department-${department.slug}`}>
            <ul className="px-5 py-2">
              {row(department, 0)}
              {below.length ? (
                <li className="border-t border-border py-1">
                  <ul className="ms-4 border-s border-border ps-4">
                    {below.map(({ category, depth }) => row(category, depth))}
                  </ul>
                </li>
              ) : (
                <li className="border-t border-border py-2 text-xs text-text-muted">{t("noSubcategories")}</li>
              )}
            </ul>
          </Card>
        );
      })}

      {dialog?.kind === "create" || dialog?.kind === "edit" ? (
        <CategoryForm
          key={dialog.kind === "edit" ? dialog.category.id : `new-${dialog.parent?.id ?? "root"}`}
          tree={tree}
          editing={dialog.kind === "edit" ? dialog.category : null}
          parent={dialog.kind === "create" ? dialog.parent : null}
          onClose={close}
          onSaved={(saved, created) => {
            toast(created ? t("created", { name: nameOf(saved, locale) }) : t("saved", { name: nameOf(saved, locale) }));
            close();
            router.refresh();
          }}
        />
      ) : null}

      {dialog?.kind === "convert" ? (
        <ConvertDialog
          key={dialog.category.id}
          tree={tree}
          source={dialog.category}
          onClose={close}
          onConverted={(message) => {
            toast(message);
            close();
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("deleteTitle", { name: dialog?.kind === "delete" ? nameOf(dialog.category, locale) : "" })}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        requireReason={false}
        onClose={close}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await unwrap(
            browserApi.DELETE("/admin/categories/{id}", {
              params: { path: { id: dialog.category.id ?? "" } },
            }),
          );
          toast(t("deleted"));
          router.refresh();
        }}
      />
    </div>
  );
}

/**
 * Create or edit one category. The parent list holds departments only; a
 * category that has subcategories cannot take a parent at all. If the tree
 * changed since the page loaded, the API refuses with its own reason, which
 * is shown as sent.
 */
function CategoryForm({
  tree,
  editing,
  parent,
  onClose,
  onSaved,
}: {
  tree: Category[];
  editing: Category | null;
  parent: Category | null;
  onClose: () => void;
  onSaved: (category: Category, created: boolean) => void;
}) {
  const t = useTranslations("categories");
  const locale = useLocale();
  const api = useApiForm();
  const { options, lock } = parentChoices(tree, editing);
  const initialParent = editing ? (editing.parent_id ?? "") : (parent?.id ?? "");
  const [parentId, setParentId] = useState(initialParent);
  const [nameAr, setNameAr] = useState(editing?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(editing?.name_en ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [sortOrder, setSortOrder] = useState<number | null>(editing?.sort_order ?? 0);
  const [visible, setVisible] = useState(editing?.is_visible ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const title = editing
    ? t("editTitle", { name: nameOf(editing, locale) })
    : parent
      ? t("newSubcategoryTitle", { name: nameOf(parent, locale) })
      : t("newDepartmentTitle");

  async function submit() {
    const found: Record<string, string> = {};
    if (!nameAr.trim()) found.name_ar = t("errors.nameAr");
    if (!nameEn.trim()) found.name_en = t("errors.nameEn");
    if (slug.trim() && !SLUG_PATTERN.test(slug.trim())) found.slug = t("errors.slug");
    if (sortOrder === null || sortOrder < 0) found.sort_order = t("errors.sortOrder");
    setErrors(found);
    if (Object.keys(found).length) return;

    // The storefront routes categories by slug, so a new one always gets one.
    const finalSlug = slug.trim() || (editing ? "" : slugify(nameEn));
    const fields = {
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      ...(finalSlug ? { slug: finalSlug } : {}),
      sort_order: sortOrder ?? 0,
      is_visible: visible,
    };
    const saved = await api.run(() =>
      editing
        ? unwrap(
            browserApi.PATCH("/admin/categories/{id}", {
              params: { path: { id: editing.id ?? "" } },
              // The parent is sent only when it changed, so an unrelated edit
              // never re-checks the hierarchy.
              body: parentId !== initialParent ? { ...fields, parent_id: parentId || null } : fields,
            }),
          )
        : unwrap(
            browserApi.POST("/admin/categories", {
              body: { ...fields, parent_id: parentId || null },
            }),
          ),
    );
    if (saved) onSaved(saved, !editing);
  }

  const error = (name: string) => errors[name] ?? api.fieldErrors[name] ?? null;

  return (
    <FormDialog
      open
      title={title}
      submitLabel={editing ? t("save") : t("create")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="category-form"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("fields.nameAr")} name="name_ar" error={error("name_ar")}>
          <Input value={nameAr} dir="rtl" onChange={(e) => setNameAr(e.target.value)} data-testid="category-name-ar" />
        </Field>
        <Field label={t("fields.nameEn")} name="name_en" error={error("name_en")}>
          <Input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} data-testid="category-name-en" />
        </Field>
        <Field label={t("fields.slug")} name="slug" error={error("slug")} hint={t("fields.slugHint")}>
          <Input
            value={slug}
            dir="ltr"
            placeholder={slugify(nameEn)}
            onChange={(e) => setSlug(e.target.value)}
            data-testid="category-slug"
          />
        </Field>
        <Field label={t("fields.sortOrder")} name="sort_order" error={error("sort_order")}>
          <NumberInput
            value={sortOrder}
            parse={{ integer: true, min: 0 }}
            onValueChange={setSortOrder}
            data-testid="category-sort"
          />
        </Field>
      </div>

      <Field
        label={t("fields.parent")}
        name="parent_id"
        error={error("parent_id")}
        hint={lock === "hasChildren" ? t("parentLocked") : t("parentHint")}
      >
        <Select
          value={parentId}
          disabled={lock === "hasChildren"}
          onChange={(e) => setParentId(e.target.value)}
          data-testid="category-parent"
        >
          <option value="">{t("noParent")}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {nameOf(option, locale)}
            </option>
          ))}
        </Select>
      </Field>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
          data-testid="category-visible"
        />
        {t("fields.visible")}
      </label>

      <FormError kind={api.formError} detail={api.formErrorDetail} />
    </FormDialog>
  );
}

/**
 * «تحويل القسم إلى علامة تجارية» — an audited, one-shot restructure: create
 * the brand, move the category's products to a chosen subcategory with the
 * brand assigned, and delete the category. The preview names every effect,
 * with the real product count, before anything is changed.
 */
function ConvertDialog({
  tree,
  source,
  onClose,
  onConverted,
}: {
  tree: Category[];
  source: Category;
  onClose: () => void;
  onConverted: (message: string) => void;
}) {
  const t = useTranslations("categories");
  const tc = useTranslations("common");
  const locale = useLocale();
  const api = useApiForm();
  const groups = conversionTargets(tree, source);
  const [nameAr, setNameAr] = useState(source.name_ar ?? "");
  const [nameEn, setNameEn] = useState(source.name_en ?? "");
  const [slug, setSlug] = useState(source.slug ?? slugify(source.name_en ?? ""));
  const [target, setTarget] = useState(
    // An older third-level node usually belongs in the subcategory above it.
    groups.flatMap((group) => group.children).find((child) => child.id === source.parent_id)?.id ?? "",
  );
  const [visible, setVisible] = useState(source.is_visible ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ products: number } | null>(null);
  const [counting, setCounting] = useState(false);
  const [countFailed, setCountFailed] = useState(false);
  const targetNode = groups.flatMap((group) => group.children).find((child) => child.id === target);

  async function showPreview() {
    const found: Record<string, string> = {};
    if (!nameAr.trim()) found.name_ar = t("errors.nameAr");
    if (!nameEn.trim()) found.name_en = t("errors.nameEn");
    if (!SLUG_PATTERN.test(slug.trim())) found.slug = t("errors.slug");
    if (!target) found.target_category_id = t("errors.target");
    setErrors(found);
    if (Object.keys(found).length) return;
    setCounting(true);
    setCountFailed(false);
    try {
      const page = await unwrap(
        browserApi.GET("/admin/products", {
          params: { query: { category_id: source.id, per_page: 1 } },
        }),
      );
      setPreview({ products: page.total ?? 0 });
    } catch {
      setCountFailed(true);
    } finally {
      setCounting(false);
    }
  }

  async function convert() {
    const result = await api.run(() =>
      unwrap(
        browserApi.POST("/admin/categories/{id}/convert-to-brand", {
          params: { path: { id: source.id ?? "" } },
          body: {
            name_ar: nameAr.trim(),
            name_en: nameEn.trim(),
            slug: slug.trim(),
            is_visible: visible,
            // The brand takes the category's place in the display order.
            sort_order: source.sort_order ?? 0,
            target_category_id: target,
          },
        }),
      ),
    );
    if (!result) return;
    onConverted(
      t("convert.done", {
        brand: (locale === "ar" ? result.brand.name_ar : result.brand.name_en) ?? "",
        count: result.moved_products,
      }),
    );
  }

  const error = (name: string) => errors[name] ?? api.fieldErrors[name] ?? null;

  return (
    <FormDialog
      open
      title={t("convert.title", { name: nameOf(source, locale) })}
      submitLabel={t("convert.preview")}
      pending={counting}
      onSubmit={() => void (preview ? convert() : showPreview())}
      onClose={onClose}
      testId="convert-dialog"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={api.pending}>
            {tc("cancel")}
          </Button>
          {preview ? (
            <>
              <Button variant="secondary" onClick={() => setPreview(null)} disabled={api.pending} data-testid="convert-back">
                {t("convert.back")}
              </Button>
              <Button type="submit" pending={api.pending} data-testid="convert-confirm">
                {t("convert.confirm")}
              </Button>
            </>
          ) : (
            <Button type="submit" pending={counting} data-testid="convert-preview">
              {t("convert.preview")}
            </Button>
          )}
        </div>
      }
    >
      {preview ? (
        <div className="flex flex-col gap-3" data-testid="convert-summary">
          <p className="text-sm">{t("convert.summaryIntro")}</p>
          <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm">
            <li data-testid="convert-effect-brand">
              {t("convert.effectBrand", { ar: nameAr.trim(), en: nameEn.trim(), slug: slug.trim() })}
            </li>
            <li data-testid="convert-effect-products" data-count={preview.products}>
              {t("convert.effectProducts", {
                count: preview.products,
                source: nameOf(source, locale),
                target: targetNode ? nameOf(targetNode, locale) : "",
              })}
            </li>
            <li data-testid="convert-effect-delete">{t("convert.effectDelete", { source: nameOf(source, locale) })}</li>
            <li>{t("convert.effectAudit")}</li>
          </ul>
          <FormError kind={api.formError} detail={api.formErrorDetail} />
        </div>
      ) : (
        <>
          <p className="text-sm text-text-muted">{t("convert.intro")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("fields.brandNameAr")} name="name_ar" error={error("name_ar")}>
              <Input value={nameAr} dir="rtl" onChange={(e) => setNameAr(e.target.value)} data-testid="convert-name-ar" />
            </Field>
            <Field label={t("fields.brandNameEn")} name="name_en" error={error("name_en")}>
              <Input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} data-testid="convert-name-en" />
            </Field>
            <Field label={t("fields.brandSlug")} name="slug" error={error("slug")}>
              <Input value={slug} dir="ltr" onChange={(e) => setSlug(e.target.value)} data-testid="convert-slug" />
            </Field>
            <Field label={t("fields.target")} name="target_category_id" error={error("target_category_id")} hint={t("convert.targetHint")}>
              <Select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="convert-target">
                <option value="">{t("convert.chooseTarget")}</option>
                {groups.map((group) => (
                  <optgroup key={group.department.id} label={nameOf(group.department, locale)}>
                    {group.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {nameOf(child, locale)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            {t("fields.brandVisible")}
          </label>
          {countFailed ? <FormError kind="unknown" /> : null}
          <FormError kind={api.formError} detail={api.formErrorDetail} />
        </>
      )}
    </FormDialog>
  );
}
