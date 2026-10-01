"use client";

import { useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Package, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Price } from "@/components/ui/price";
import { QuantityInput } from "@/components/ui/quantity-input";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { lineName } from "@/lib/cart";
import { minQuantity, quantityRule } from "@/lib/quantity";
import type { CartViewLine } from "@/lib/use-cart";

/**
 * One row of the «سلة المشتريات» screen: thumbnail, name, variant, unit price
 * with its discount, a quantity field in the SKU's unit (whole pieces, or up
 * to three decimals by weight or volume) capped at the stock we were told
 * about, and the remove control. The cap is enforced, never printed.
 *
 * A line the server marks unavailable — hidden product, or stock that fell
 * below the chosen quantity — says so on the row itself and offers the two
 * moves that clear it, because checkout will refuse the whole order until it
 * is gone.
 */
export function CartRow({
  line,
  onQuantityChange,
  onRemove,
}: {
  line: CartViewLine;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("cart");
  const locale = useLocale() as Locale;
  const [imageFailed, setImageFailed] = useState(false);

  const name = lineName(line, locale);
  const rule = quantityRule({
    base_unit: line.base_unit,
    whole_units_only: line.whole_units_only,
  });
  const max = Math.max(minQuantity(rule), line.available_qty);
  const atCap = line.quantity + 1 > line.available_qty;
  const unavailable = !line.available;

  return (
    <li
      data-testid={unavailable ? "cart-line-unavailable" : undefined}
      data-available={unavailable ? "false" : "true"}
      className="flex gap-3 border-b border-border py-4 last:border-b-0 sm:gap-4"
    >
      <Link
        href={`/product/${line.product_id}`}
        tabIndex={-1}
        aria-hidden
        className="relative size-20 shrink-0 overflow-hidden rounded-md bg-card sm:size-24"
      >
        {line.image_url && !imageFailed ? (
          <Image
            src={line.image_url}
            alt=""
            fill
            sizes="96px"
            onError={() => setImageFailed(true)}
            className="object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center">
            <Package className="size-8 text-border" aria-hidden />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-text sm:text-base">
              <Link
                href={`/product/${line.product_id}`}
                className="line-clamp-2 transition-colors hover:text-primary-dark"
              >
                {name}
              </Link>
            </h3>
            {line.variant_label ? (
              <p className="mt-0.5 text-xs text-text-muted">
                {line.variant_label}
              </p>
            ) : null}
            {unavailable ? (
              <p
                role="alert"
                data-testid="cart-unavailable-note"
                className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-error-dark"
              >
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                {line.available_qty > 0
                  ? t("unavailableQty")
                  : t("unavailableLine")}
              </p>
            ) : null}
          </div>

          <IconButton
            label={t("remove", { name })}
            variant="ghost"
            size="sm"
            data-testid="cart-remove"
            onClick={() => onRemove(line.id)}
            className="shrink-0 text-text-muted hover:text-error-dark"
          >
            <Trash2 className="size-4" aria-hidden />
          </IconButton>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div
            role="group"
            aria-label={t("quantityFor", { name })}
            className="flex flex-col gap-1"
          >
            <QuantityInput
              value={line.quantity}
              rule={rule}
              max={max}
              onValueChange={(next) => onQuantityChange(line.id, next)}
            />
            {atCap && !unavailable ? (
              // Explains why «+» stopped responding rather than leaving the
              // shopper to guess — without saying how much stock is left.
              <span
                className="text-xs text-text-muted"
                data-testid="cart-max-qty"
              >
                {t("maxQty")}
              </span>
            ) : null}
          </div>

          <div
            className="flex flex-col items-end gap-0.5"
            data-testid="cart-line-total"
          >
            <Price
              amount={line.line_total}
              regularPrice={
                line.regular_price ? line.regular_price * line.quantity : null
              }
            />
          </div>
        </div>
      </div>
    </li>
  );
}
