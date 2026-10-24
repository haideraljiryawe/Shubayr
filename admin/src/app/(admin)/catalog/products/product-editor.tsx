"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Clock, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select, Textarea, ActionBar } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { BelowCostPanel } from "@/components/orders/lifecycle-panels";
import { BrandQuickCreate } from "@/components/catalog/brand-quick-create";
import { ImageManager } from "@/components/catalog/image-manager";
import { PRODUCT_CROP } from "@/lib/image-crop";
import { belowCostBreaches, type BelowCostBreach } from "@/lib/orders";
import { NumberInput } from "@/components/forms/number-input";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, describeFieldError } from "@/lib/api/errors";
import type { PricingContext } from "@/lib/api/catalog-server";
import {
  BASE_UNITS,
  copySku,
  draftFromVariant,
  emptyDraft,
  englishOrArabic,
  isPiece,
  linkedLocalPrice,
  nextDraft,
  subcategories,
  suggestSkus,
  variantErrorPath,
  variantInput,
  type AttributeRow,
  type Brand,
  type Category,
  type Product,
  type ProductVariant,
  type ProductVariantInput,
  type VariantDraft,
} from "@/lib/catalog";
import {
  creationImages,
  draftsFromImages,
  imagesSettled,
  mediaOperations,
  type ImageDraft,
} from "@/lib/product-images";
import { decimalPlaces, formatAmount, formatRate } from "@/lib/finance/money";
import { discardUploads, orphanedUploads } from "@/lib/media-cleanup";
import { limitBody, limitDraft, limitPatch, switchLimit, validateLimit, type PurchaseLimitDraft } from "@/lib/purchase-limit";
import { parseLocalizedDecimal } from "@/lib/number";
import { AmountInput } from "@/components/forms/amount-input";
import { useConfirm } from "@/components/forms/use-confirm";

type Status = "active" | "hidden" | "archived";
type FieldMessages = Partial<Record<keyof VariantDraft, string>>;

/** Where a new product starts: blank, a copy of another, or a category/brand already chosen. */
export interface ProductSeed {
  /** "Duplicate": the product this one copies. */
  template?: Product;
  categoryId?: string;
  brandId?: string;
}

/** The SKU rows a copy starts with: same settings, codes moved on by one, no ids. */
function copiedDrafts(template: Product): VariantDraft[] {
  return (template.variants ?? []).map((variant) => {
    const draft = draftFromVariant(variant);
    return { ...draft, key: `copy-${draft.key}`, id: undefined, sku: copySku(draft.sku) };
  });
}

/** A copy's pictures: the same stored files, attached to the new product on save. */
function copiedImages(template: Product): ImageDraft[] {
  return draftsFromImages(template.images).map((image) => ({ ...image, key: `copy-${image.key}`, imageId: undefined }));
}

/**
 * One product, its pictures and its SKUs. Products live in a subcategory
 * (never a department) and link to a brand separately. Each SKU carries its
 * own base unit, whole-units rule, low-stock threshold and price — a fixed
 * local price (or the product's), or a price linked to a foreign reference
 * that the server converts at the pricing rate and rounds by the store's
 * rule. The local price that will be published is shown before saving.
 *
 * Built for entering a catalog quickly: the English name may stay empty (the
 * Arabic one is sent for both), a new SKU row starts like the one before it,
 * empty SKU codes can be filled in from the name and attributes, a brand can
 * be added on the spot, and "save and add another" keeps the category and
 * brand for the next product.
 */
export function ProductEditor({
  product,
  seed,
  tree,
  brands: initialBrands,
  pricing,
  canCreateBrand = false,
}: {
  product: Product | null;
  seed?: ProductSeed;
  tree: Category[];
  brands: Brand[];
  pricing: PricingContext;
  canCreateBrand?: boolean;
}) {
  const t = useTranslations("products");
  const tErrors = useTranslations("errors");
  const tc = useTranslations("confirmRemove");
  const { confirm: confirmRemove, dialog } = useConfirm();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const api = useApiForm();
  const template = product ? undefined : seed?.template;
  const source = product ?? template ?? null;
  /** A price the server refused as below the protected cost (API 10.0). */
  const [belowCost, setBelowCost] = useState<BelowCostBreach[] | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [brands, setBrands] = useState(initialBrands);
  const [brandDialog, setBrandDialog] = useState(false);
  const groups = subcategories(tree);
  const nameOf = (item: { name_ar?: string; name_en?: string }) =>
    (locale === "ar" ? item.name_ar : item.name_en) || item.name_en || item.name_ar || "";
  // Each name is marked as a copy in its own language.
  const [nameAr, setNameAr] = useState(
    product ? (product.name_ar ?? "") : template?.name_ar ? `${template.name_ar} (نسخة)` : "",
  );
  // A stored English name equal to the Arabic one was the "same as Arabic"
  // default; it stays empty here so it keeps following the Arabic name.
  const [nameEn, setNameEn] = useState(() => {
    const source = product ?? template;
    if (!source?.name_en || source.name_en === source.name_ar) return "";
    return product ? source.name_en : `${source.name_en} (copy)`;
  });
  const [description, setDescription] = useState(source?.description ?? "");
  const [categoryId, setCategoryId] = useState(source?.category_id ?? seed?.categoryId ?? "");
  const [brandId, setBrandId] = useState(source?.brand_id ?? seed?.brandId ?? "");
  const [price, setPrice] = useState<number | null>(source?.price ?? null);
  // The API ties publishing to status: an active product is published (and
  // must pass the publishing checks); hidden and archived ones are not. A new
  // product — a copy too — starts hidden, so nothing reaches customers half-made.
  const [status, setStatus] = useState<Status>(product?.status ?? "hidden");
  const [images, setImages] = useState<ImageDraft[]>(() =>
    product ? draftsFromImages(product.images) : template ? copiedImages(template) : [],
  );
  const [drafts, setDrafts] = useState<VariantDraft[]>(() =>
    product?.variants?.length
      ? product.variants.map(draftFromVariant)
      : template?.variants?.length
        ? copiedDrafts(template)
        : [emptyDraft(pricing.foreign[0]?.code ?? "", "new-0")],
  );
  // Per-order limit for the whole product; a copy starts with its template's.
  const [limit, setLimit] = useState<PurchaseLimitDraft>(() => limitDraft(source));
  // Pictures uploaded in this editor since the last save: whatever the saved
  // product doesn't keep (a removed tile) is deleted on save, and everything
  // still unsaved when the editor is left (DELETE /media/{id}; the API keeps
  // anything still referenced).
  const uploads = useRef<string[]>([]);
  useEffect(
    () => () => {
      void discardUploads(orphanedUploads(uploads.current, (product?.images ?? []).map((image) => image.url)));
    },
    [product],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [variantErrors, setVariantErrors] = useState<Record<string, FieldMessages>>({});
  const [imageProblem, setImageProblem] = useState<"busy" | "failed" | null>(null);
  const stored = new Map((product?.variants ?? []).map((variant) => [variant.id, variant]));
  const settled = imagesSettled(images);

  function change(key: string, patch: Partial<VariantDraft>) {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
    setVariantErrors((current) => {
      if (!current[key]) return current;
      const fields = { ...current[key] };
      for (const name of Object.keys(patch)) delete fields[name as keyof VariantDraft];
      return { ...current, [key]: fields };
    });
  }

  function fillSkus() {
    setDrafts((current) => suggestSkus(current, nameEn, nameAr));
    setVariantErrors((current) =>
      Object.fromEntries(Object.entries(current).map(([key, fields]) => [key, { ...fields, sku: undefined }])),
    );
  }

  async function submit(then: "open" | "another") {
    const found: Record<string, string> = {};
    if (!nameAr.trim()) found.name_ar = t("errors.nameAr");
    if (!categoryId) found.category_id = t("errors.category");
    if (price === null || price < 0 || !Number.isInteger(price)) found.price = t("errors.price");
    const limitProblem = validateLimit(limit, { wholeUnitsOnly: drafts.every((draft) => draft.whole_units_only) });
    if (limitProblem) found.purchase_limit_max_quantity = t(`limit.problems.${limitProblem}`);

    const perVariant: Record<string, FieldMessages> = {};
    const variants: ProductVariantInput[] = [];
    const skus = new Set<string>();
    for (const draft of drafts) {
      const result = variantInput(draft);
      if (!result.ok) {
        perVariant[draft.key] = Object.fromEntries(
          Object.entries(result.errors).map(([field, key]) => [field, t(`variantErrors.${key}`)]),
        );
        continue;
      }
      if (skus.has(result.value.sku)) {
        perVariant[draft.key] = { sku: t("variantErrors.skuDuplicate") };
        continue;
      }
      skus.add(result.value.sku);
      variants.push(result.value);
    }
    setErrors(found);
    setVariantErrors(perVariant);
    setImageProblem(settled === "ready" ? null : settled);
    if (Object.keys(found).length || Object.keys(perVariant).length || settled !== "ready") {
      api.setFieldErrors({});
      return;
    }

    const body = {
      category_id: categoryId,
      brand_id: brandId || null,
      name_ar: nameAr.trim(),
      name_en: englishOrArabic(nameEn, nameAr),
      description: description.trim() || null,
      price: price ?? 0,
      status,
      published: status === "active",
      variants,
    };
    setBelowCost(null);
    setPendingApprovalId(null);
    const saved = await api.run(async () => {
      try {
        if (product?.id) {
          // An edit leaves the stored discount and expiry tracking alone, and
          // sends the pictures only as the changes that reach the new order.
          const operations = mediaOperations(product.images, images);
          return await unwrap(
            browserApi.PATCH("/admin/products/{id}", {
              params: { path: { id: product.id } },
              body: { ...body, ...limitPatch(product, limit), ...(operations.length ? { media_operations: operations } : {}) },
            }),
          );
        }
        // A new product (a copy too) starts without a discount — set
        // elsewhere, not in this form — and with the pictures in screen order.
        return await unwrap(
          browserApi.POST("/admin/products", {
            body: {
              ...body,
              discount_type: null,
              tracks_expiry: template?.tracks_expiry ?? false,
              ...limitBody(limit),
              images: creationImages(images),
            },
          }),
        );
      } catch (cause) {
        const breaches = belowCostBreaches(cause);
        if (breaches) setBelowCost(breaches);
        // Nested 422 paths ("variants.1.sku") go next to that SKU's field.
        if (cause instanceof ApiError && !breaches) {
          const server: Record<string, FieldMessages> = {};
          for (const error of cause.errors) {
            const path = variantErrorPath(error.field);
            const draft = path ? drafts[path.index] : undefined;
            if (draft && path) server[draft.key] = { ...server[draft.key], [path.field]: describeFieldError(tErrors, error) };
          }
          setVariantErrors(server);
        }
        throw cause;
      }
    });
    if (!saved) return;
    // Saved: keep what the product now uses, delete the rest of this editor's uploads.
    void discardUploads(orphanedUploads(uploads.current, [...(saved.images ?? []).map((image) => image.url), ...(product?.images ?? []).map((image) => image.url)]));
    uploads.current = [];
    if (saved.price_update_status === "pending_approval" && saved.price_approval_request_id) {
      setPendingApprovalId(saved.price_approval_request_id);
      toast(t("approvalPendingToast"));
      return;
    }
    if (product?.id) {
      toast(t("saved"));
      router.refresh();
    } else if (then === "another") {
      toast(t("createdNext"));
      const next = new URLSearchParams({ category: categoryId, ...(brandId ? { brand: brandId } : {}) });
      // A fresh editor (not this one, reset): the page remounts it.
      router.push(`/catalog/products/new?${next.toString()}&n=${Date.now().toString(36)}`);
    } else {
      toast(t("created"));
      router.push(`/catalog/products/${saved.id}?created=1`);
    }
  }

  const error = (name: string) => errors[name] ?? api.fieldErrors[name] ?? null;
  const clearLimitError = () => {
    setErrors((current) => {
      const rest = { ...current };
      delete rest.purchase_limit_max_quantity;
      return rest;
    });
    api.clearField("purchase_limit_max_quantity");
  };
  const missingSkus = drafts.some((draft) => !draft.sku.trim());

  return (
    <>
      {dialog}
      <form
        className="flex flex-col gap-6"
        noValidate
        data-testid="product-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("open");
        }}
      >
        {template ? (
          <Alert tone="info" data-testid="product-copy-notice">
            {t("copyNotice", { name: nameOf(template) })}
          </Alert>
        ) : null}

        <Card className="flex flex-col gap-4">
          <h2 className="text-section">{t("sections.basics")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("fields.nameAr")} name="name_ar" error={error("name_ar")}>
              <Input value={nameAr} dir="rtl" onChange={(e) => setNameAr(e.target.value)} data-testid="product-name-ar" />
            </Field>
            <Field label={t("fields.nameEnOptional")} name="name_en" error={error("name_en")} hint={t("fields.nameEnHint")}>
              <Input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} data-testid="product-name-en" />
            </Field>
            <Field label={t("fields.category")} name="category_id" error={error("category_id")} hint={groups.length ? t("fields.categoryHint") : undefined}>
              <Select value={categoryId} onValueChange={(value) => setCategoryId(value)} data-testid="product-category">
                <option value="">{t("chooseCategory")}</option>
                {groups.map((group) => (
                  <optgroup key={group.department.id} label={nameOf(group.department)}>
                    {group.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {nameOf(child)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label={t("fields.brand")} name="brand_id" error={error("brand_id")}>
              <div className="flex gap-2">
                <Select className="min-w-0 flex-1" value={brandId} onValueChange={(value) => setBrandId(value)} data-testid="product-brand">
                  <option value="">{t("noBrand")}</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {nameOf(brand)}
                      {brand.is_visible ? "" : ` (${t("hiddenBrand")})`}
                    </option>
                  ))}
                </Select>
                {canCreateBrand ? (
                  <Button variant="secondary" onClick={() => setBrandDialog(true)} data-testid="product-brand-new" aria-label={t("newBrand")}>
                    <Plus className="size-4" aria-hidden />
                    <span className="hidden sm:inline">{t("newBrand")}</span>
                  </Button>
                ) : null}
              </div>
            </Field>
            <Field
              label={t("fields.price", { currency: pricing.baseCode })}
              name="price"
              error={error("price")}
              hint={t("fields.priceHint")}
            >
              <NumberInput grouping value={price} parse={{ integer: true, min: 0 }} onValueChange={setPrice} data-testid="product-price" />
            </Field>
          </div>
          {groups.length === 0 ? (
            <Alert tone="info" data-testid="product-no-categories">
              {t("noCategories")}{" "}
              <Link href="/catalog/categories" className="font-semibold underline">
                {t("openCategories")}
              </Link>
            </Alert>
          ) : null}
          <Field label={t("fields.description")} name="description" error={error("description")} hint={t("fields.descriptionHint")}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} data-testid="product-description" />
          </Field>
        </Card>

        <Card className="flex flex-col gap-4" data-testid="images-section">
          <div>
            <h2 className="text-section">{t("sections.images")}</h2>
            <p className="text-body text-text-muted">{t("sections.imagesHint")}</p>
          </div>
          <ImageManager images={images} onChange={setImages} onUploaded={(url) => uploads.current.push(url)} target={PRODUCT_CROP} testId="product-images" />
          {imageProblem && settled !== "ready" ? (
            <Alert data-testid="images-not-ready">{t(imageProblem === "busy" ? "imagesBusy" : "imagesFailed")}</Alert>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4" data-testid="variants-section">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-section">{t("sections.variants")}</h2>
              <p className="text-body text-text-muted">{t("sections.variantsHint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {missingSkus ? (
                <Button variant="ghost" onClick={fillSkus} data-testid="variant-fill-skus">
                  <Sparkles className="size-4" aria-hidden />
                  {t("fillSkus")}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => setDrafts((current) => [...current, nextDraft(current.at(-1), pricing.foreign[0]?.code ?? "")])}
                data-testid="variant-add"
              >
                <Plus className="size-4" aria-hidden />
                {t("addVariant")}
              </Button>
            </div>
          </div>
          {drafts.map((draft, index) => (
            <VariantCard
              key={draft.key}
              index={index}
              draft={draft}
              stored={draft.id ? stored.get(draft.id) : undefined}
              productPrice={price}
              pricing={pricing}
              errors={variantErrors[draft.key] ?? {}}
              canRemove={drafts.length > 1}
              onChange={(patch) => change(draft.key, patch)}
              onRemove={() =>
                confirmRemove({
                  title: tc("variantTitle"),
                  body: tc("variantBody"),
                  onConfirm: () => setDrafts((current) => current.filter((item) => item.key !== draft.key)),
                })
              }
            />
          ))}
        </Card>

        <Card className="flex flex-col gap-3" data-testid="purchase-limit-section">
          <h2 className="text-section">{t("limit.title")}</h2>
          <label className="flex items-center gap-2 text-label">
            <input
              type="checkbox"
              checked={limit.enabled}
              onChange={(e) => {
                setLimit((current) => switchLimit(current, e.target.checked));
                clearLimitError();
              }}
              data-testid="purchase-limit-enabled"
            />
            {t("limit.enabled")}
          </label>
          <p className="-mt-1 text-caption text-text-muted">{t("limit.hint")}</p>
          {limit.enabled ? (
            <Field label={t("limit.max")} name="purchase_limit_max_quantity" error={error("purchase_limit_max_quantity")} hint={t("limit.maxHint")}>
              <AmountInput
                className="w-40"
                value={limit.max}
                onValueChange={(value) => {
                  const max = value;
                  setLimit((current) => ({ ...current, max }));
                  clearLimitError();
                }}
                data-testid="purchase-limit-max"
              />
            </Field>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-3" data-testid="visibility-section">
          <h2 className="text-section">{t("sections.visibility")}</h2>
          <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label={t("sections.visibility")} data-testid="product-status">
            {(["active", "hidden", ...(product ? (["archived"] as const) : [])] as const).map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="product-status"
                  className="mt-1"
                  checked={status === value}
                  onChange={() => setStatus(value)}
                  data-testid={`product-status-${value}`}
                />
                <span className="flex flex-col">
                  <span className="font-semibold">{t(`statusChoice.${value}.title`)}</span>
                  <span className="text-caption text-text-muted">{t(`statusChoice.${value}.body`)}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        {pendingApprovalId ? (
          <Alert tone="info" data-testid="fixed-price-approval-pending" data-request={pendingApprovalId}>
            <p className="font-semibold">{t("approvalPendingTitle")}</p>
            <p className="mt-1 text-body">{t("approvalPendingBody")}</p>
            <Link href={`/finance/price-approvals/${pendingApprovalId}`} className="mt-2 inline-block text-label underline" data-testid="fixed-price-approval-link">
              {t("openApproval")}
            </Link>
          </Alert>
        ) : belowCost ? (
          <BelowCostPanel
            breaches={belowCost}
            currency={product?.currency ?? "IQD"}
            canApprove={false}
            selfRefused={false}
            note={t("belowCostNote")}
          />
        ) : (
          <FormError kind={api.formError} code={api.formErrorCode} />
        )}

        {/* The save row stays in reach on a long form and on a tablet. */}
        <ActionBar
          data-testid="product-actions"
          start={
            settled === "busy" ? <span aria-live="polite">{t("imagesUploading")}</span> : null
          }
        >
          {product ? null : (
            <Button variant="secondary" pending={api.pending} onClick={() => void submit("another")} data-testid="product-save-another">
              {t("createAndAnother")}
            </Button>
          )}
          <Button type="submit" pending={api.pending} data-testid="product-save">
            {product ? t("save") : t("create")}
          </Button>
        </ActionBar>
      </form>

      {/* Outside the product form: the dialog is a form of its own. */}
      {canCreateBrand ? (
        <BrandQuickCreate
          open={brandDialog}
          existing={brands}
          onClose={() => setBrandDialog(false)}
          onCreated={(brand) => {
            setBrands((current) => [...current, brand]);
            setBrandId(brand.id);
            setBrandDialog(false);
            toast(t("brandCreated", { name: nameOf(brand) }));
          }}
        />
      ) : null}
    </>
  );
}

/** The attribute rows of one SKU: «اللون» = «أحمر», one pair per row. */
function AttributeRows({
  index,
  rows,
  error,
  onChange,
}: {
  index: number;
  rows: AttributeRow[];
  error?: string;
  onChange: (rows: AttributeRow[]) => void;
}) {
  const t = useTranslations("products.variant");
  const shown = rows.length ? rows : [{ name: "", value: "" }];
  const set = (at: number, patch: Partial<AttributeRow>) =>
    onChange(shown.map((row, i) => (i === at ? { ...row, ...patch } : row)));
  return (
    <fieldset className="flex flex-col gap-2" data-testid={`variant-attributes-${index}`}>
      <legend className="mb-1 text-label">{t("attributes")}</legend>
      {shown.map((row, at) => (
        <div key={at} className="flex items-center gap-2">
          <Input
            className="min-w-0 flex-1"
            value={row.name}
            dir="auto"
            placeholder={t("attributeNamePlaceholder")}
            aria-label={t("attributeName")}
            onChange={(e) => set(at, { name: e.target.value })}
            data-testid={`variant-attr-name-${index}-${at}`}
          />
          <Input
            className="min-w-0 flex-1"
            value={row.value}
            dir="auto"
            placeholder={t("attributeValuePlaceholder")}
            aria-label={t("attributeValue")}
            onChange={(e) => set(at, { value: e.target.value })}
            data-testid={`variant-attr-value-${index}-${at}`}
          />
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-card disabled:opacity-40"
            aria-label={t("attributeRemove")}
            disabled={shown.length === 1 && !row.name && !row.value}
            onClick={() => onChange(shown.filter((_, i) => i !== at))}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-text-muted">{t("attributesHint")}</p>
        <Button size="sm" variant="ghost" onClick={() => onChange([...shown, { name: "", value: "" }])} data-testid={`variant-attr-add-${index}`}>
          <Plus className="size-4" aria-hidden />
          {t("attributeAdd")}
        </Button>
      </div>
      {error ? (
        <p className="text-caption font-semibold text-error-dark" data-testid="error-attributes">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function VariantCard({
  index,
  draft,
  stored,
  productPrice,
  pricing,
  errors,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  draft: VariantDraft;
  stored: ProductVariant | undefined;
  productPrice: number | null;
  pricing: PricingContext;
  errors: FieldMessages;
  canRemove: boolean;
  onChange: (patch: Partial<VariantDraft>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("products");
  const locale = useLocale();
  const base = pricing.baseCode;
  const money = (value: string | number | null | undefined) =>
    formatAmount(value ?? null, base, pricing.basePrecision, locale);
  const piece = isPiece(draft.base_unit);
  const units: string[] = BASE_UNITS.includes(draft.base_unit as (typeof BASE_UNITS)[number])
    ? [...BASE_UNITS]
    : [...BASE_UNITS, draft.base_unit];
  const unitLabel = (unit: string) =>
    BASE_UNITS.includes(unit as (typeof BASE_UNITS)[number]) ? t(`units.${unit}`) : unit;
  const id = (name: string) => `variant-${name}-${index}`;
  const label = draft.attributes.map((row) => row.value.trim()).filter(Boolean).join(" · ");

  return (
    <fieldset className="flex flex-col gap-4 rounded-md border border-border p-4" data-testid={`variant-${index}`}>
      <legend className="px-1 text-body font-bold">
        {t("variantTitle", { number: index + 1 })}
        {label ? <span className="ms-2 font-normal">{label}</span> : null}
        {draft.sku ? (
          <code dir="ltr" className="ms-2 font-normal text-text-muted">
            {draft.sku}
          </code>
        ) : null}
      </legend>

      <AttributeRows
        index={index}
        rows={draft.attributes}
        error={errors.attributes}
        onChange={(attributes) => onChange({ attributes })}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("variant.sku")} name="sku" error={errors.sku} hint={draft.sku ? undefined : t("variant.skuHint")}>
          <Input value={draft.sku} dir="ltr" onChange={(e) => onChange({ sku: e.target.value })} data-testid={id("sku")} />
        </Field>
        <Field label={t("variant.baseUnit")} name="base_unit" error={errors.base_unit}>
          <Select
            value={draft.base_unit}
            onValueChange={(value) => {
              const unit = value;
              // Pieces are whole; switching to a weight or volume unit starts
              // from fractions allowed, the usual case for those.
              onChange({ base_unit: unit, whole_units_only: isPiece(unit) });
            }}
            data-testid={id("unit")}
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {unitLabel(unit)}
              </option>
            ))}
          </Select>
        </Field>
        {draft.pricing_mode === "fixed" ? (
          <Field
            label={t("variant.sellingPrice", { currency: base })}
            name="selling_price"
            error={errors.selling_price}
            hint={
              productPrice !== null
                ? t("variant.inheritsPrice", { price: money(productPrice) })
                : t("variant.inheritsPriceUnknown")
            }
          >
            <AmountInput
              value={draft.selling_price}
              inputMode="numeric"
              onValueChange={(value) => onChange({ selling_price: value })}
              data-testid={id("price")}
            />
          </Field>
        ) : null}
        <Field
          label={t("variant.threshold", { unit: unitLabel(draft.base_unit) })}
          name="low_stock_threshold"
          error={errors.low_stock_threshold}
          hint={
            pricing.defaultThreshold !== null
              ? t("variant.thresholdDefault", { value: pricing.defaultThreshold })
              : t("variant.thresholdInherit")
          }
        >
          <AmountInput
            value={draft.low_stock_threshold}
            onValueChange={(value) => onChange({ low_stock_threshold: value })}
            data-testid={id("threshold")}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-label">
          <input
            type="checkbox"
            checked={piece ? true : draft.whole_units_only}
            disabled={piece}
            onChange={(e) => onChange({ whole_units_only: e.target.checked })}
            data-testid={id("whole")}
          />
          {t("variant.wholeOnly")}
        </label>
        <p className="text-caption text-text-muted" data-testid={id("whole-hint")}>
          {piece ? t("variant.wholeForced") : t("variant.wholeOptional", { unit: unitLabel(draft.base_unit) })}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">{t("variant.pricingMode")}</legend>
        <div className="flex flex-wrap gap-4">
          {(["fixed", "linked"] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-body">
              <input
                type="radio"
                name={`pricing-mode-${draft.key}`}
                checked={draft.pricing_mode === mode}
                onChange={() => onChange({ pricing_mode: mode })}
                data-testid={id(`mode-${mode}`)}
              />
              {t(`variant.mode.${mode}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {draft.pricing_mode === "linked" ? (
        <LinkedPricing draft={draft} stored={stored} pricing={pricing} errors={errors} onChange={onChange} index={index} />
      ) : null}

      {canRemove ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {draft.id ? <span className="text-caption text-text-muted">{t("variant.removeHint")}</span> : null}
          <Button size="sm" variant="ghost" className="text-error-dark" onClick={onRemove} data-testid={id("remove")}>
            <Trash2 className="size-4" aria-hidden />
            {t("variant.remove")}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * The linked-price half of a SKU: reference currency and price, and — worked
 * out exactly as the server will — the local price at the rate in effect now,
 * with the rounding rule spelled out. Saving publishes at that rate; later
 * rate changes go through Currencies & rates (preview, then publish).
 */
function LinkedPricing({
  index,
  draft,
  stored,
  pricing,
  errors,
  onChange,
}: {
  index: number;
  draft: VariantDraft;
  stored: ProductVariant | undefined;
  pricing: PricingContext;
  errors: FieldMessages;
  onChange: (patch: Partial<VariantDraft>) => void;
}) {
  const t = useTranslations("products");
  const locale = useLocale();
  const base = pricing.baseCode;
  const id = (name: string) => `variant-${name}-${index}`;
  const currency = pricing.foreign.find((item) => item.code === draft.reference_currency_code);
  const reference = parseLocalizedDecimal(draft.reference_price, { maxDecimals: 6 });
  const referenceValue = reference.ok ? reference.value : null;
  const rule = pricing.rounding ?? { kind: "precision" as const, precision: pricing.basePrecision };
  const computed = currency?.rate && referenceValue ? linkedLocalPrice(referenceValue, currency.rate, rule) : null;
  const plain = (value: string) => formatAmount(value, base, Math.min(decimalPlaces(value), 6), locale);
  const storedLinked = stored?.pricing_mode === "linked";

  return (
    <div className="flex flex-col gap-3" data-testid={id("linked")}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("variant.referenceCurrency")} name="reference_currency_code" error={errors.reference_currency_code}>
          <Select
            value={draft.reference_currency_code}
            onValueChange={(value) => onChange({ reference_currency_code: value })}
            data-testid={id("currency")}
          >
            <option value="">{t("variant.chooseCurrency")}</option>
            {pricing.foreign.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} · {locale === "ar" ? item.name_ar : item.name_en}
              </option>
            ))}
            {draft.reference_currency_code && !currency ? (
              <option value={draft.reference_currency_code}>{draft.reference_currency_code}</option>
            ) : null}
          </Select>
        </Field>
        <Field
          label={t("variant.referencePrice", { currency: draft.reference_currency_code || "…" })}
          name="reference_price"
          error={errors.reference_price}
          hint={t("variant.referenceHint")}
        >
          <AmountInput
            value={draft.reference_price}
            onValueChange={(value) => onChange({ reference_price: value })}
            data-testid={id("reference")}
          />
        </Field>
      </div>

      <div className="rounded-md bg-card px-4 py-3 text-body" aria-live="polite" data-testid={id("computed")}>
        {!draft.reference_currency_code ? (
          <p className="text-text-muted">{t("linked.chooseCurrency")}</p>
        ) : !currency?.rate ? (
          <Alert tone="info" data-testid={id("no-rate")}>
            {t("linked.noRate", { code: draft.reference_currency_code })}
          </Alert>
        ) : !computed ? (
          <p className="text-text-muted">
            <span dir="ltr">{formatRate(currency.code, base, currency.rate, locale)}</span> · {t("linked.enterReference")}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-text-muted" dir="ltr" data-testid={id("formula")}>
              {`${referenceValue} ${currency.code} × ${formatRate(currency.code, base, currency.rate, locale).replace(/^1 \w+ = /, "")} = ${plain(computed.converted)}`}
            </p>
            <p data-testid={id("rounding")}>
              {pricing.rounding === null
                ? t("linked.roundingUnknown")
                : rule.kind === "multiple"
                  ? t("linked.roundingMultiple", { multiple: formatAmount(rule.multiple, base, Math.min(decimalPlaces(rule.multiple), 6), locale) })
                  : t("linked.roundingPrecision", { precision: rule.precision })}
            </p>
            <p className="text-section">
              {t("linked.localPrice")}{" "}
              <span dir="ltr" data-testid={id("local-price")} data-value={computed.local}>
                {formatAmount(computed.local, base, pricing.basePrecision, locale)}
              </span>
            </p>
            <p className="text-caption text-text-muted">{t("linked.discountsAfter")}</p>
          </div>
        )}
      </div>

      {storedLinked ? (
        <div className="flex flex-wrap items-center gap-2 text-body" data-testid={id("published")}>
          <span className="text-text-muted">{t("linked.publishedNow")}</span>
          <strong dir="ltr" data-testid={id("published-price")}>
            {formatAmount(stored?.published_price ?? null, base, pricing.basePrecision, locale)}
          </strong>
          {stored?.awaiting_rate_id ? (
            <Badge tone="warning" data-testid={id("awaiting")}>
              <Clock className="me-1 size-3" aria-hidden />
              {t("linked.awaiting")}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
