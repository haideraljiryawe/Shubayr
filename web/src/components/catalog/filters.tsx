"use client";

import { useEffect, useId, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { Link, getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Category } from "@/lib/api";
import type { CatalogQuery } from "@/lib/catalog-query";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/providers/theme-provider";

interface FilterProps {
  basePath: string;
  query: CatalogQuery;
  categories: Category[];
  category?: Category;
}

const selectClass =
  "min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-text";

function FiltersForm({ basePath, query, categories, category }: FilterProps) {
  const t = useTranslations("catalog");
  const locale = useLocale() as Locale;
  const { currency } = useTheme();
  const formId = useId();
  const options = category ? (category.children ?? []) : categories;
  return (
    <form
      action={getPathname({ locale, href: basePath })}
      method="get"
      className="space-y-6"
    >
      {query.q && <input type="hidden" name="q" value={query.q} />}
      {query.sort && <input type="hidden" name="sort" value={query.sort} />}
      <input type="hidden" name="per_page" value={query.per_page ?? 12} />
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-bold">
          {t("priceRange")}{" "}
          <bdi className="text-xs font-normal">({currency})</bdi>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-2 text-xs" htmlFor={`${formId}-min`}>
            <span>{t("minPrice")}</span>
            <Input
              id={`${formId}-min`}
              name="min_price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              defaultValue={query.min_price}
              placeholder="0"
              dir="ltr"
              className="px-2"
            />
          </label>
          <label className="space-y-2 text-xs" htmlFor={`${formId}-max`}>
            <span>{t("maxPrice")}</span>
            <Input
              id={`${formId}-max`}
              name="max_price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              defaultValue={query.max_price}
              dir="ltr"
              className="px-2"
            />
          </label>
        </div>
      </fieldset>
      <label
        className="block space-y-3 text-sm font-bold"
        htmlFor={`${formId}-rating`}
      >
        <span>{t("minRating")}</span>
        <select
          id={`${formId}-rating`}
          name="min_rating"
          defaultValue={query.min_rating ?? ""}
          className={selectClass}
        >
          <option value="">{t("anyRating")}</option>
          {[3, 4, 4.5, 5].map((rating) => (
            <option key={rating} value={rating}>
              {t("ratingAbove", { rating })}
            </option>
          ))}
        </select>
      </label>
      {options.length > 0 && (
        <label
          className="block space-y-3 text-sm font-bold"
          htmlFor={`${formId}-category`}
        >
          <span>{t(category ? "subCategory" : "category")}</span>
          <select
            id={`${formId}-category`}
            name="category_id"
            defaultValue={query.category_id ?? category?.id ?? ""}
            className={selectClass}
          >
            <option value={category?.id ?? ""}>
              {t(category ? "allSubcategories" : "allCategories")}
            </option>
            {options
              .filter((c) => c.is_visible !== false)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {locale === "ar" ? c.name_ar : c.name_en}
                </option>
              ))}
          </select>
        </label>
      )}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input
          name="on_sale"
          value="true"
          type="checkbox"
          defaultChecked={query.on_sale === true}
          className="size-5 shrink-0 accent-primary-dark"
        />
        <span>{t("onSale")}</span>
      </label>
      <div className="space-y-2 border-t border-border pt-5">
        <Button type="submit" variant="cta" block>
          {t("apply")}
        </Button>
        <Link
          href={basePath}
          className={buttonClasses({ variant: "ghost", block: true })}
        >
          {t("reset")}
        </Link>
      </div>
    </form>
  );
}

export function DesktopFilters(props: FilterProps) {
  const t = useTranslations("catalog");
  return (
    <aside
      aria-label={t("filterTitle")}
      className="hidden w-56 shrink-0 self-start rounded-lg border border-border bg-surface p-4 lg:block"
    >
      <h2 className="mb-6 text-base font-bold">{t("filterTitle")}</h2>
      <FiltersForm {...props} />
    </aside>
  );
}

export function MobileFilters(props: FilterProps) {
  const t = useTranslations("catalog");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const resize = () => {
      if (window.innerWidth >= 1024) dialog.current?.close();
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={buttonClasses({ variant: "light", className: "lg:hidden" })}
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          document.body.style.overflow = "hidden";
        }}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {t("filters")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-lg bg-surface px-5 pb-8 pt-4 text-text shadow-lg backdrop:bg-text/40"
        onClose={() => {
          document.body.style.overflow = "";
          trigger.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), a[href]',
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            dialog.current?.close();
        }}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-border"
          aria-hidden
        />
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold">
            {t("filterTitle")}
          </h2>
          <Button
            type="button"
            variant="ghost"
            className="px-3"
            aria-label={t("closeFilters")}
            onClick={() => dialog.current?.close()}
          >
            <X className="size-5" aria-hidden />
          </Button>
        </div>
        <FiltersForm {...props} />
      </dialog>
    </>
  );
}

export function SortControl({
  basePath,
  query,
}: Pick<FilterProps, "basePath" | "query">) {
  const locale = useLocale() as Locale;
  const t = useTranslations("catalog");
  const id = useId();
  return (
    <form
      method="get"
      action={getPathname({ locale, href: basePath })}
      className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none"
    >
      {Object.entries(query)
        .filter(
          ([key, value]) =>
            key !== "sort" && key !== "page" && value !== undefined,
        )
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={String(value)} />
        ))}
      <label htmlFor={id} className="sr-only">
        {t("sort")}
      </label>
      <select
        id={id}
        name="sort"
        defaultValue={query.sort ?? "newest"}
        className={`${selectClass} max-w-48 bg-card font-medium`}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="newest">{t("newest")}</option>
        <option value="price_asc">{t("priceAsc")}</option>
        <option value="price_desc">{t("priceDesc")}</option>
        <option value="rating">{t("ratingSort")}</option>
      </select>
      <Button type="submit" variant="light" className="px-3">
        {t("sort")}
      </Button>
    </form>
  );
}
