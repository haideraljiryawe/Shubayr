"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Search, X } from "lucide-react";
import { Badge, Button, Input, Spinner } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { targetName, type PickedTarget } from "@/lib/banners";
import type { Product } from "@/lib/catalog";

/** A category the picker can offer, with its place in the tree. */
export interface CategoryOption {
  id: string;
  name_ar: string;
  name_en: string;
  /** "Department › Category" in each language. */
  path_ar: string;
  path_en: string;
  /** Customers can see it: it and every parent are visible. */
  visible: boolean;
}

/**
 * Pick what a banner opens: a product (searched on the server by name,
 * GET /admin/products?q=, which banners' own permission covers) or a
 * category (searched in the tree the page loaded). The picked target says
 * whether customers can currently see it; the API decides that on save and
 * returns it resolved.
 */
export function BannerTargetPicker({
  kind,
  value,
  categories,
  onChange,
}: {
  kind: "product" | "category";
  value: PickedTarget | null;
  categories: CategoryOption[];
  onChange: (target: PickedTarget | null) => void;
}) {
  const t = useTranslations("banners.target");
  const locale = useLocale();
  const testId = `banner-target-${kind}`;
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"forbidden" | "failed" | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (kind !== "product" || q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPending(true);
      try {
        const page = await unwrap(browserApi.GET("/admin/products", { params: { query: { q, per_page: 10 } } }));
        if (!cancelled) {
          setProducts(page.data);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof ApiError && cause.status === 403 ? "forbidden" : "failed");
      } finally {
        if (!cancelled) setPending(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kind, q]);

  const categoryMatches = useMemo(() => {
    if (kind !== "category") return [];
    const needle = q.toLocaleLowerCase();
    return categories.filter((option) => !needle || `${option.path_ar} ${option.path_en}`.toLocaleLowerCase().includes(needle)).slice(0, 30);
  }, [categories, kind, q]);

  if (value) {
    const name = targetName(value, locale) || value.id;
    return (
      <div className="flex flex-col gap-1" data-testid={`${testId}-picked`} data-available={value.available === null ? "unknown" : String(value.available)}>
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold" dir="auto" data-testid={`${testId}-name`}>
              {name}
            </span>
            {value.available === true ? <Badge tone="success">{t("available")}</Badge> : null}
            {value.available === false ? <Badge tone="warning">{t("unavailable")}</Badge> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)} aria-label={t("clear")} data-testid={`${testId}-clear`}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        {value.available === false ? (
          <p className="flex items-start gap-1.5 text-xs font-semibold text-warning-dark" data-testid={`${testId}-warning`}>
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t(`unavailableHint.${kind}`)}
          </p>
        ) : value.available === null ? (
          <p className="text-xs text-text-muted">{t("checkedOnSave")}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <Input
          type="search"
          className="ps-9"
          placeholder={t(`placeholder.${kind}`)}
          aria-label={t(`placeholder.${kind}`)}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid={`${testId}-search`}
        />
        {pending ? <Spinner className="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted" /> : null}
      </div>
      {error ? <p className="text-xs font-semibold text-error-dark">{t(error)}</p> : null}
      {kind === "product" && q.length >= 2 && !pending && !error && products.length === 0 ? <p className="text-xs text-text-muted">{t("none")}</p> : null}
      {kind === "category" && categoryMatches.length === 0 ? <p className="text-xs text-text-muted">{t("none")}</p> : null}
      {kind === "product" && q.length >= 2 && products.length > 0 ? (
        <ul className="max-h-64 overflow-y-auto rounded-md border border-border" data-testid={`${testId}-results`}>
          {products.map((product) => (
            <li key={product.id} className="border-t border-border first:border-t-0">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-card"
                data-testid={`${testId}-option`}
                onClick={() => {
                  onChange({ id: product.id ?? "", name_ar: product.name_ar ?? "", name_en: product.name_en ?? "", available: null });
                  setQuery("");
                }}
              >
                <span className="font-semibold" dir="auto">
                  {targetName({ name_ar: product.name_ar ?? "", name_en: product.name_en ?? "" }, locale)}
                </span>
                {product.status && product.status !== "active" ? <Badge tone="warning">{t(`productStatus.${product.status}`)}</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {kind === "category" && categoryMatches.length > 0 ? (
        <ul className="max-h-64 overflow-y-auto rounded-md border border-border" data-testid={`${testId}-results`}>
          {categoryMatches.map((option) => (
            <li key={option.id} className="border-t border-border first:border-t-0">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-card"
                data-testid={`${testId}-option`}
                onClick={() => {
                  onChange({ id: option.id, name_ar: option.name_ar, name_en: option.name_en, available: option.visible });
                  setQuery("");
                }}
              >
                <span dir="auto">{locale === "ar" ? option.path_ar : option.path_en}</span>
                {option.visible ? null : <Badge tone="warning">{t("hidden")}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
