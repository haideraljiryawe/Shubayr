"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useLocale } from "next-intl";
import { Package } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { OrderItem } from "@/lib/api";
import { cn } from "@/lib/cn";

/**
 * The name the order captured at placement.
 *
 * The contract snapshots `product_name_ar`/`product_name_en` and `image_url`
 * onto each order item precisely so order history, returns and reviews render
 * what was bought — not what the catalogue happens to call it today. Falling
 * back to the other language mirrors the storefront's bilingual-name rule.
 */
export function orderItemName(item: OrderItem, locale: Locale): string {
  const preferred = locale === "ar" ? item.product_name_ar : item.product_name_en;
  const fallback = locale === "ar" ? item.product_name_en : item.product_name_ar;
  return preferred?.trim() || fallback?.trim() || "";
}

/** One order line: snapshot image, snapshot name, and whatever the caller adds. */
export function OrderItemLine({
  item,
  href,
  children,
  className,
}: {
  item: OrderItem;
  /** Makes the name a link to the product; omitted where it should be plain. */
  href?: string;
  /** Rendered after the name — a quantity stepper, a price, a rating form. */
  children?: ReactNode;
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const name = orderItemName(item, locale);
  const image = item.image_url;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-card">
        {image ? (
          <Image src={image} alt="" fill sizes="56px" className="object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <Package className="size-6 text-border" aria-hidden />
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {href ? (
          <Link
            href={href}
            className="line-clamp-2 text-sm font-medium text-text transition-colors hover:text-primary-dark"
          >
            {name}
          </Link>
        ) : (
          <span className="line-clamp-2 text-sm font-medium text-text">
            {name}
          </span>
        )}
        {children}
      </span>
    </div>
  );
}
