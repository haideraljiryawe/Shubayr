"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw, Search, X } from "lucide-react";
import { Badge, Button, Input, Spinner } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Product } from "@/lib/catalog";
import { variantAttributes } from "@/lib/invoice-entry";
import { searchView, type SkuSearch } from "@/lib/sku-search";
import { useUnitName } from "@/components/catalog/unit-name";

export interface PickedSku {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  /** The variant's distinguishing attributes ("Red · L"); empty for a single-variant product. */
  variantLabel?: string;
  baseUnit: string;
  wholeUnitsOnly: boolean;
  tracksExpiry: boolean;
}

/**
 * Find a product by its Arabic or English name, or a SKU or barcode
 * (GET /admin/products?q=, which needs catalog.products), and pick one of its
 * variants. Each result shows the product name, the variant's distinguishing
 * attributes and the SKU, so similar variants are told apart (VIS-022/023).
 * "No matching products" appears only for a search that succeeded and found
 * nothing; a search still running, or one that failed, says so instead.
 */
export function SkuPicker({
  value,
  onChange,
  testId = "sku-picker",
  disabled = false,
  placeholder,
}: {
  value: PickedSku | null;
  onChange: (sku: PickedSku | null) => void;
  testId?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = useTranslations("inventory.skuPicker");
  const unitName = useUnitName();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SkuSearch<Product>>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearch({ status: "searching", query: q });
      try {
        const page = await unwrap(browserApi.GET("/admin/products", { params: { query: { q, per_page: 10 } } }));
        if (!cancelled) setSearch({ status: "done", query: q, results: page.data });
      } catch (cause) {
        if (!cancelled) setSearch({ status: "failed", query: q, reason: cause instanceof ApiError && cause.status === 403 ? "forbidden" : "failed" });
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, attempt]);

  const nameOf = (product: Product) =>
    (locale === "ar" ? product.name_ar : product.name_en) || product.name_en || product.name_ar || "";

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2" data-testid={`${testId}-picked`}>
        <span className="flex min-w-0 flex-col text-sm">
          <span className="font-semibold">
            {value.productName}
            {value.variantLabel ? <span className="font-normal text-text-muted"> · {value.variantLabel}</span> : null}
          </span>
          <span className="text-xs text-text-muted">
            <span dir="ltr" className="font-semibold">{value.sku}</span> ·{" "}
            {value.wholeUnitsOnly ? t("wholeUnits", { unit: unitName(value.baseUnit) }) : t("decimal", { unit: unitName(value.baseUnit) })}
          </span>
        </span>
        {disabled ? null : (
          <Button size="sm" variant="ghost" onClick={() => onChange(null)} aria-label={t("clear")} data-testid={`${testId}-clear`}>
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    );
  }

  const view = searchView(search, query, (product) => (product.variants ?? []).length);
  const label = placeholder ?? t("placeholder");

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <Input
          type="search"
          className="ps-9"
          placeholder={label}
          aria-label={label}
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          data-testid={`${testId}-search`}
        />
        {view === "searching" ? <Spinner className="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted" /> : null}
      </div>
      <div aria-live="polite" data-testid={`${testId}-state`} data-state={view}>
        {view === "searching" ? <p className="text-xs text-text-muted">{t("searching")}</p> : null}
        {view === "failed" && search.status === "failed" ? (
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-error-dark" role="alert">
            {t(search.reason)}
            {search.reason === "failed" ? (
              <Button size="sm" variant="ghost" onClick={() => setAttempt((value) => value + 1)} data-testid={`${testId}-retry`}>
                <RotateCcw className="size-4" aria-hidden />
                {t("retry")}
              </Button>
            ) : null}
          </p>
        ) : null}
        {view === "none" ? <p className="text-xs text-text-muted">{t("noMatches")}</p> : null}
      </div>
      {view === "results" && search.status === "done" ? (
        <ul className="max-h-64 overflow-y-auto rounded-md border border-border" data-testid={`${testId}-results`}>
          {search.results.flatMap((product) =>
            (product.variants ?? []).map((variant) => {
              const attributes = variantAttributes(variant.attributes as Record<string, unknown> | null | undefined);
              return (
                <li key={variant.id} className="border-t border-border first:border-t-0">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-card"
                    data-testid={`${testId}-option`}
                    data-sku={variant.sku}
                    onClick={() => {
                      onChange({
                        variantId: variant.id ?? "",
                        productId: product.id ?? "",
                        sku: variant.sku ?? "",
                        productName: nameOf(product),
                        variantLabel: attributes,
                        baseUnit: variant.base_unit ?? "piece",
                        wholeUnitsOnly: variant.whole_units_only ?? true,
                        tracksExpiry: product.tracks_expiry ?? false,
                      });
                      setQuery("");
                      setSearch({ status: "idle" });
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold">
                        {nameOf(product)}
                        {attributes ? <span className="font-normal text-text-muted"> · {attributes}</span> : null}
                      </span>
                      <span className="text-xs text-text-muted" dir="ltr">{variant.sku}</span>
                    </span>
                    <Badge>{unitName(variant.base_unit)}</Badge>
                  </button>
                </li>
              );
            }),
          )}
        </ul>
      ) : null}
    </div>
  );
}
