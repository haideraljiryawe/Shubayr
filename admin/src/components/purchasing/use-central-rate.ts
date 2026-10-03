"use client";

import { useEffect, useState } from "react";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { exchangeRateCutoff } from "@/lib/finance/dates";
import type { CurrencyCode } from "@/lib/purchasing";

export type CentralRate =
  | { status: "loading" }
  | { status: "ready"; rate: string }
  /** No rate recorded at that date: the server will refuse the document. */
  | { status: "missing" }
  /** The rate can't be read without fx_rates.view; the server still applies it. */
  | { status: "hidden" };

/**
 * The central rate the server will apply to a document in `currency` dated
 * `day`: current documents use the load instant, historical documents use the
 * Baghdad day's closing rate, and future-effective rates are never used early.
 */
export function useCentralRate(currency: CurrencyCode, day: string, canRead: boolean): CentralRate {
  const key = `${currency}|${day}|${canRead}`;
  const [loaded, setLoaded] = useState<{ key: string; value: CentralRate } | null>(null);

  useEffect(() => {
    if (currency === "IQD" || !canRead || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const at = exchangeRateCutoff(day);
    if (!at) return;
    let cancelled = false;
    unwrap(
      browserApi.GET("/admin/exchange-rates/{code}/applicable", {
        params: { path: { code: currency }, query: { at } },
      }),
    ).then(
      (result) => {
        if (!cancelled) setLoaded({ key, value: { status: "ready", rate: String((result as { rate?: unknown }).rate ?? "") } });
      },
      (cause: unknown) => {
        if (cancelled) return;
        const value: CentralRate =
          cause instanceof ApiError && cause.status === 403 ? { status: "hidden" } : { status: "missing" };
        setLoaded({ key, value });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, currency, day, canRead]);

  if (currency === "IQD") return { status: "ready", rate: "1" };
  if (!canRead) return { status: "hidden" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { status: "missing" };
  return loaded?.key === key ? loaded.value : { status: "loading" };
}
