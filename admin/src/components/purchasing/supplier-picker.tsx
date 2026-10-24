"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Clock, Search, X } from "lucide-react";
import { Badge, Button, Input, Spinner } from "@/components/ui";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { activeSuppliers, type Supplier } from "@/lib/purchasing";

/**
 * Choose the supplier of a purchase. With nothing typed it offers the
 * suppliers bought from most recently (the API's sort_by=recent_purchase,
 * never-used ones last); typing searches every supplier on the server by
 * name or phone (GET /admin/suppliers?q=). Inactive suppliers can't be picked.
 */
export function SupplierPicker({
  value,
  recent,
  onChange,
  disabled = false,
  testId = "invoice-supplier",
}: {
  value: Supplier | null;
  /** The first page in recent-purchase order, read by the page. */
  recent: Supplier[];
  onChange: (supplier: Supplier | null) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const t = useTranslations("purchasing.supplierPicker");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Supplier[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"forbidden" | "failed" | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPending(true);
      try {
        const page = await unwrap(browserApi.GET("/admin/suppliers", { params: { query: { q, sort_by: "recent_purchase", per_page: 20 } } }));
        if (!cancelled) {
          setResults(activeSuppliers(page.data));
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
  }, [q]);

  const lastBought = (supplier: Supplier) =>
    supplier.last_purchase_at
      ? t("lastPurchase", { at: format.dateTime(new Date(supplier.last_purchase_at), { dateStyle: "medium", numberingSystem: "latn" }) })
      : t("neverBought");

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2" data-testid={`${testId}-picked`} data-supplier-id={value.id}>
        <span className="flex flex-col text-body">
          <span className="font-semibold" dir="auto">
            {value.name} · <span dir="ltr">{value.default_currency}</span>
          </span>
          <span className="text-caption text-text-muted">
            {value.phone ? <span dir="ltr">{value.phone} · </span> : null}
            {lastBought(value)}
          </span>
        </span>
        {disabled ? null : (
          <Button size="sm" variant="ghost" onClick={() => onChange(null)} aria-label={t("change")} data-testid={`${testId}-clear`}>
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    );
  }

  const shown = q ? (results ?? []) : activeSuppliers(recent);
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
      {error ? <p className="text-caption font-semibold text-error-dark">{t(error)}</p> : null}
      <p className="text-caption text-text-muted">{q ? t("matches") : t("recentHint")}</p>
      {shown.length === 0 && !pending ? <p className="text-caption text-text-muted">{q ? t("none") : t("noneYet")}</p> : null}
      {shown.length > 0 ? (
        <ul className="max-h-64 overflow-y-auto rounded-md border border-border" data-testid={`${testId}-results`}>
          {shown.map((supplier) => (
            <li key={supplier.id} className="border-t border-border first:border-t-0">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-start text-body hover:bg-card"
                disabled={disabled}
                data-testid={`${testId}-option`}
                data-supplier-id={supplier.id}
                onClick={() => {
                  onChange(supplier);
                  setQuery("");
                }}
              >
                <span className="flex flex-col">
                  <span className="font-semibold" dir="auto">
                    {supplier.name}
                  </span>
                  <span className="text-caption text-text-muted">
                    {supplier.phone ? <span dir="ltr">{supplier.phone} · </span> : null}
                    {lastBought(supplier)}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  {supplier.last_purchase_at ? <Clock className="size-3.5 text-text-muted" aria-hidden /> : null}
                  <Badge>{supplier.default_currency}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
