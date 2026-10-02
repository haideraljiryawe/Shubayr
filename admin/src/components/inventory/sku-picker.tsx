"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Badge, Button, Input, Spinner } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Product } from "@/lib/catalog";

export interface PickedSku {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  baseUnit: string;
  wholeUnitsOnly: boolean;
  tracksExpiry: boolean;
}

/**
 * Find a SKU by its product's name (GET /admin/products?q=, which needs
 * catalog.products) and pick one of its variants. The API searches product
 * names, not SKU codes, so the person types the product and chooses the SKU.
 */
export function SkuPicker({
  value,
  onChange,
  testId = "sku-picker",
  disabled = false,
}: {
  value: PickedSku | null;
  onChange: (sku: PickedSku | null) => void;
  testId?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("inventory.skuPicker");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"forbidden" | "failed" | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPending(true);
      try {
        const page = await unwrap(browserApi.GET("/admin/products", { params: { query: { q, per_page: 10 } } }));
        if (!cancelled) {
          setResults(page.data);
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
  }, [query]);

  const nameOf = (product: Product) =>
    (locale === "ar" ? product.name_ar : product.name_en) || product.name_en || product.name_ar || "";

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2" data-testid={`${testId}-picked`}>
        <span className="flex flex-col text-sm">
          <span className="font-semibold" dir="ltr">{value.sku}</span>
          <span className="text-xs text-text-muted">
            {value.productName} · {value.wholeUnitsOnly ? t("wholeUnits", { unit: value.baseUnit }) : t("decimal", { unit: value.baseUnit })}
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

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <Input
          type="search"
          className="ps-9"
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          data-testid={`${testId}-search`}
        />
        {pending ? <Spinner className="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted" /> : null}
      </div>
      {error ? <p className="text-xs font-semibold text-error-dark">{t(error)}</p> : null}
      {query.trim().length >= 2 && !pending && !error && results.length === 0 ? (
        <p className="text-xs text-text-muted">{t("none")}</p>
      ) : null}
      {query.trim().length >= 2 && results.length > 0 ? (
        <ul className="max-h-64 overflow-y-auto rounded-md border border-border" data-testid={`${testId}-results`}>
          {results.flatMap((product) =>
            (product.variants ?? []).map((variant) => (
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
                      baseUnit: variant.base_unit ?? "piece",
                      wholeUnitsOnly: variant.whole_units_only ?? true,
                      tracksExpiry: product.tracks_expiry ?? false,
                    });
                    setQuery("");
                  }}
                >
                  <span className="flex flex-col">
                    <span className="font-semibold" dir="ltr">{variant.sku}</span>
                    <span className="text-xs text-text-muted">{nameOf(product)}</span>
                  </span>
                  <Badge>{variant.base_unit ?? "piece"}</Badge>
                </button>
              </li>
            )),
          )}
        </ul>
      ) : null}
    </div>
  );
}
