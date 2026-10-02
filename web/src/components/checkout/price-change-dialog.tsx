"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { PriceChange } from "@/lib/order-lifecycle";
import type { CartViewLine } from "@/lib/use-cart";
import type { Locale } from "@/i18n/routing";

/**
 * Prices changed between the cart and the order (API 10.0, 409
 * PRICE_CHANGED). Every changed line is listed old → new — up or down — and
 * nothing is ordered until the shopper accepts the new prices, which
 * resubmits the same order with those price versions. "Back to cart" leaves
 * the order unplaced.
 */
export function PriceChangeDialog({
  changes,
  lines,
  currency,
  busy,
  error,
  onAccept,
  onBack,
}: {
  changes: PriceChange[];
  lines: CartViewLine[];
  currency: string;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("checkout.priceChange");
  const locale = useLocale() as Locale;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const lineFor = (variantId: string) => lines.find((line) => line.variant_id === variantId);
  const name = (variantId: string, sku: string) => {
    const line = lineFor(variantId);
    return (locale === "ar" ? line?.name_ar : line?.name_en) || sku;
  };
  const total = changes.reduce((sum, change) => sum + (change.newPrice - change.oldPrice) * (lineFor(change.variantId)?.quantity ?? 0), 0);

  return (
    <dialog
      ref={ref}
      aria-labelledby="price-change-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg bg-surface p-0 text-text shadow-lg backdrop:bg-text/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onBack();
      }}
      data-testid="price-change-dialog"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id="price-change-title" className="text-lg font-bold">
          {t("title")}
        </h2>
        <p className="text-sm text-text-muted">{t("body")}</p>
        <ul className="flex flex-col divide-y divide-border">
          {changes.map((change) => (
            <li key={change.variantId} className="flex items-center justify-between gap-3 py-2 text-sm" data-testid="price-change-line" data-direction={change.direction}>
              <span className="font-medium">{name(change.variantId, change.sku)}</span>
              <span className="flex items-center gap-2 whitespace-nowrap" dir="ltr">
                <span className="text-text-muted line-through" data-testid="price-change-old">
                  {formatPrice(change.oldPrice, currency, locale)}
                </span>
                <span>→</span>
                <span className={change.direction === "up" ? "font-bold text-error-dark" : "font-bold text-success-dark"} data-testid="price-change-new">
                  {formatPrice(change.newPrice, currency, locale)}
                </span>
                {change.direction === "up" ? (
                  <ArrowUp className="size-4 text-error-dark" aria-label={t("up")} />
                ) : (
                  <ArrowDown className="size-4 text-success-dark" aria-label={t("down")} />
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm font-semibold" data-testid="price-change-total">
          {total >= 0
            ? t("totalUp", { amount: formatPrice(total, currency, locale) })
            : t("totalDown", { amount: formatPrice(-total, currency, locale) })}
        </p>
        {error ? (
          <p role="alert" className="rounded-md border border-error/40 bg-error/8 px-3 py-2 text-sm font-medium text-error-dark">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onBack} data-testid="price-change-back">
            {t("back")}
          </Button>
          <Button
            disabled={busy}
            onClick={onAccept}
            startIcon={busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            data-testid="price-change-accept"
          >
            {t("accept")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
