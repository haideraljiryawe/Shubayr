"use client";

import { useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Package, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { lineName, lineTotal } from "@/lib/cart";
import type { CartLine } from "@/lib/cart-store";

/**
 * One row of the «سلة المشتريات» screen: thumbnail, name, variant, unit price
 * with its discount, a quantity stepper capped at the stock we were told about,
 * and the remove control.
 */
export function CartRow({
  line,
  onQuantityChange,
  onRemove,
}: {
  line: CartLine;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("cart");
  const locale = useLocale() as Locale;
  const [imageFailed, setImageFailed] = useState(false);

  const name = lineName(line, locale);
  const max = Math.max(1, line.available_qty);
  const atCap = line.quantity >= line.available_qty;

  return (
    <li className="flex gap-3 border-b border-border py-4 last:border-b-0 sm:gap-4">
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
            <QuantityStepper
              value={line.quantity}
              min={1}
              max={max}
              onValueChange={(next) => onQuantityChange(line.id, next)}
            />
            {atCap ? (
              // Explains why «+» stopped responding rather than leaving the
              // shopper to guess. `dir=ltr` keeps the digit beside its label.
              <span
                className="text-xs text-text-muted"
                data-testid="cart-max-qty"
              >
                {t("maxQty", { count: line.available_qty })}
              </span>
            ) : null}
          </div>

          <div
            className="flex flex-col items-end gap-0.5"
            data-testid="cart-line-total"
          >
            <Price
              amount={lineTotal(line)}
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
