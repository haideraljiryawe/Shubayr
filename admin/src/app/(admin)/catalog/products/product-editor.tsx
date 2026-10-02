"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Clock, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { NumberInput } from "@/components/forms/number-input";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { PricingContext } from "@/lib/api/catalog-server";
import {
  BASE_UNITS,
  draftFromVariant,
  emptyDraft,
  isPiece,
  linkedLocalPrice,
  subcategories,
  variantErrorPath,
  variantInput,
  type Brand,
  type Category,
  type Product,
  type ProductVariant,
  type ProductVariantInput,
  type VariantDraft,
} from "@/lib/catalog";
import { decimalPlaces, formatAmount, formatRate } from "@/lib/finance/money";
import { parseLocalizedDecimal } from "@/lib/number";

type Status = "active" | "hidden" | "archived";
type FieldMessages = Partial<Record<keyof VariantDraft, string>>;

/**
 * One product and its SKUs. Products live in a subcategory (never a
 * department) and link to a brand separately. Each SKU carries its own base
 * unit, whole-units rule, low-stock threshold and price — a fixed local price
 * (or the product's), or a price linked to a foreign reference that the
 * server converts at the pricing rate and rounds by the store's rule. The
 * local price that will be published is shown before saving.
 */
export function ProductEditor({
  product,
  tree,
  brands,
  pricing,
}: {
  product: Product | null;
  tree: Category[];
  brands: Brand[];
  pricing: PricingContext;
}) {
  const t = useTranslations("products");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const api = useApiForm();
  const groups = subcategories(tree);
  const nameOf = (item: { name_ar?: string; name_en?: string }) =>
    (locale === "ar" ? item.name_ar : item.name_en) || item.name_en || item.name_ar || "";

  const [nameAr, setNameAr] = useState(product?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(product?.name_en ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [brandId, setBrandId] = useState(product?.brand_id ?? "");
  const [price, setPrice] = useState<number | null>(product?.price ?? null);
  // The API ties publishing to status: an active product is published (and
  // must pass the publishing checks); hidden and archived ones are not. A new
  // product starts hidden, so nothing reaches customers half-made.
  const [status, setStatus] = useState<Status>(product?.status ?? "hidden");
  const [drafts, setDrafts] = useState<VariantDraft[]>(() =>
    product?.variants?.length
      ? product.variants.map(draftFromVariant)
      : [emptyDraft(pricing.foreign[0]?.code ?? "", "new-0")],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [variantErrors, setVariantErrors] = useState<Record<string, FieldMessages>>({});
  const stored = new Map((product?.variants ?? []).map((variant) => [variant.id, variant]));

  function change(key: string, patch: Partial<VariantDraft>) {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
    setVariantErrors((current) => {
      if (!current[key]) return current;
      const fields = { ...current[key] };
      for (const name of Object.keys(patch)) delete fields[name as keyof VariantDraft];
      return { ...current, [key]: fields };
    });
  }

  async function submit() {
    const found: Record<string, string> = {};
    if (!nameAr.trim()) found.name_ar = t("errors.nameAr");
    if (!nameEn.trim()) found.name_en = t("errors.nameEn");
    if (!categoryId) found.category_id = t("errors.category");
    if (price === null || price < 0 || !Number.isInteger(price)) found.price = t("errors.price");

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
    if (Object.keys(found).length || Object.keys(perVariant).length) {
      api.setFieldErrors({});
      return;
    }

    const body = {
      category_id: categoryId,
      brand_id: brandId || null,
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      description: description.trim() || null,
      price: price ?? 0,
      status,
      published: status === "active",
      variants,
    };
    const saved = await api.run(async () => {
      try {
        // An edit leaves the stored discount and expiry tracking alone; a new
        // product starts without a discount (set elsewhere, not in this form).
        return product?.id
          ? await unwrap(browserApi.PATCH("/admin/products/{id}", { params: { path: { id: product.id } }, body }))
          : await unwrap(
              browserApi.POST("/admin/products", {
                body: { ...body, discount_type: null, tracks_expiry: false },
              }),
            );
      } catch (cause) {
        // Nested 422 paths ("variants.1.sku") go next to that SKU's field.
        if (cause instanceof ApiError) {
          const server: Record<string, FieldMessages> = {};
          for (const error of cause.errors) {
            const path = variantErrorPath(error.field);
            const draft = path ? drafts[path.index] : undefined;
            if (draft && path) server[draft.key] = { ...server[draft.key], [path.field]: error.message };
          }
          setVariantErrors(server);
        }
        throw cause;
      }
    });
    if (!saved) return;
    if (product?.id) {
      toast(t("saved"));
      router.refresh();
    } else {
      toast(t("created"));
      router.push(`/catalog/products/${saved.id}`);
    }
  }

  const error = (name: string) => errors[name] ?? api.fieldErrors[name] ?? null;

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      data-testid="product-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">{t("sections.basics")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("fields.nameAr")} name="name_ar" error={error("name_ar")}>
            <Input value={nameAr} dir="rtl" onChange={(e) => setNameAr(e.target.value)} data-testid="product-name-ar" />
          </Field>
          <Field label={t("fields.nameEn")} name="name_en" error={error("name_en")}>
            <Input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} data-testid="product-name-en" />
          </Field>
          <Field label={t("fields.category")} name="category_id" error={error("category_id")} hint={t("fields.categoryHint")}>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid="product-category">
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
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} data-testid="product-brand">
              <option value="">{t("noBrand")}</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {nameOf(brand)}
                  {brand.is_visible ? "" : ` (${t("hiddenBrand")})`}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("fields.price", { currency: pricing.baseCode })}
            name="price"
            error={error("price")}
            hint={t("fields.priceHint")}
          >
            <NumberInput value={price} parse={{ integer: true, min: 0 }} onValueChange={setPrice} data-testid="product-price" />
          </Field>
          <Field label={t("fields.status")} name="status" error={error("status")} hint={t("fields.statusHint")}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as Status)} data-testid="product-status">
              {(["active", "hidden", "archived"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`status.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("fields.description")} name="description" error={error("description")}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} data-testid="product-description" />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4" data-testid="variants-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t("sections.variants")}</h2>
            <p className="text-sm text-text-muted">{t("sections.variantsHint")}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setDrafts((current) => [...current, emptyDraft(pricing.foreign[0]?.code ?? "")])}
            data-testid="variant-add"
          >
            <Plus className="size-4" aria-hidden />
            {t("addVariant")}
          </Button>
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
            onRemove={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
          />
        ))}
      </Card>

      <FormError kind={api.formError} detail={api.formErrorDetail} />
      <div className="flex justify-end">
        <Button type="submit" pending={api.pending} data-testid="product-save">
          {product ? t("save") : t("create")}
        </Button>
      </div>
    </form>
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

  return (
    <fieldset className="flex flex-col gap-4 rounded-md border border-border p-4" data-testid={`variant-${index}`}>
      <legend className="px-1 text-sm font-bold">
        {t("variantTitle", { number: index + 1 })}
        {draft.sku ? (
          <code dir="ltr" className="ms-2 font-normal text-text-muted">
            {draft.sku}
          </code>
        ) : null}
      </legend>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t("variant.sku")} name="sku" error={errors.sku}>
          <Input value={draft.sku} dir="ltr" onChange={(e) => onChange({ sku: e.target.value })} data-testid={id("sku")} />
        </Field>
        <Field label={t("variant.baseUnit")} name="base_unit" error={errors.base_unit}>
          <Select
            value={draft.base_unit}
            onChange={(e) => {
              const unit = e.target.value;
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
          <Input
            value={draft.low_stock_threshold}
            dir="ltr"
            inputMode="decimal"
            onChange={(e) => onChange({ low_stock_threshold: e.target.value })}
            data-testid={id("threshold")}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={piece ? true : draft.whole_units_only}
          disabled={piece}
          onChange={(e) => onChange({ whole_units_only: e.target.checked })}
          data-testid={id("whole")}
        />
        {t("variant.wholeOnly")}
      </label>
      <p className="-mt-3 text-xs text-text-muted" data-testid={id("whole-hint")}>
        {piece ? t("variant.wholeForced") : t("variant.wholeOptional", { unit: unitLabel(draft.base_unit) })}
      </p>

      <Field label={t("variant.attributes")} name="attributes" error={errors.attributes} hint={t("variant.attributesHint")}>
        <Textarea
          value={draft.attributes}
          dir="auto"
          className="min-h-14"
          onChange={(e) => onChange({ attributes: e.target.value })}
          data-testid={id("attributes")}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">{t("variant.pricingMode")}</legend>
        <div className="flex flex-wrap gap-4">
          {(["fixed", "linked"] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-sm">
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
          <Input
            value={draft.selling_price}
            dir="ltr"
            inputMode="numeric"
            onChange={(e) => onChange({ selling_price: e.target.value })}
            data-testid={id("price")}
          />
        </Field>
      ) : (
        <LinkedPricing draft={draft} stored={stored} pricing={pricing} errors={errors} onChange={onChange} index={index} />
      )}

      {canRemove ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {draft.id ? <span className="text-xs text-text-muted">{t("variant.removeHint")}</span> : null}
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
            onChange={(e) => onChange({ reference_currency_code: e.target.value })}
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
          <Input
            value={draft.reference_price}
            dir="ltr"
            inputMode="decimal"
            onChange={(e) => onChange({ reference_price: e.target.value })}
            data-testid={id("reference")}
          />
        </Field>
      </div>

      <div className="rounded-md bg-card px-4 py-3 text-sm" aria-live="polite" data-testid={id("computed")}>
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
            <p className="text-base font-bold">
              {t("linked.localPrice")}{" "}
              <span dir="ltr" data-testid={id("local-price")} data-value={computed.local}>
                {formatAmount(computed.local, base, pricing.basePrecision, locale)}
              </span>
            </p>
            <p className="text-xs text-text-muted">{t("linked.discountsAfter")}</p>
          </div>
        )}
      </div>

      {storedLinked ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid={id("published")}>
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
