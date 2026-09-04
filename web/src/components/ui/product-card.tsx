"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Package, ShoppingCart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatDiscount } from "@/lib/format";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { Price } from "./price";
import { Rating } from "./rating";
import { WishlistButton } from "./wishlist-button";

/**
 * The product tile used by every storefront grid.
 *
 * Props are deliberately flat rather than a whole `Product`, because the two
 * display fields the design needs — the review count and the struck-through
 * "was" price — are not in the OpenAPI Product schema yet. Callers map from
 * whatever they have, so this component does not depend on a contract shape
 * that is still moving.
 */
export interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  rating?: number;
  reviewCount?: number;
  imageUrl?: string | null;
  inStock?: boolean;
  /** Sizes hint for the responsive image; grids differ per section. */
  imageSizes?: string;
  /** Marks the first row of the first grid as LCP-eligible. */
  priority?: boolean;
  onAddToCart?: (id: string) => void;
  onWishlistToggle?: (id: string, next: boolean) => void;
  className?: string;
}

export function ProductCard({
  id,
  name,
  price,
  compareAtPrice,
  rating,
  reviewCount,
  imageUrl,
  inStock = true,
  imageSizes = "(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw",
  priority = false,
  onAddToCart,
  onWishlistToggle,
  className,
}: ProductCardProps) {
  const t = useTranslations("common");
  const tp = useTranslations("product");
  const [added, setAdded] = useState(false);

  const discount =
    compareAtPrice && compareAtPrice > price
      ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
      : null;

  return (
    <Card
      padding="none"
      className={cn("group flex flex-col overflow-hidden", className)}
    >
      <div className="relative aspect-square bg-card">
        <Link
          href={`/product/${id}`}
          className="block size-full"
          // The visible title below links to the same place, so this large
          // image target is redundant for screen readers.
          tabIndex={-1}
          aria-hidden
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              fill
              sizes={imageSizes}
              priority={priority}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            // No artwork yet: a neutral placeholder rather than a broken image.
            <span className="flex size-full items-center justify-center">
              <Package className="size-10 text-border" aria-hidden />
            </span>
          )}
        </Link>

        {discount ? (
          <span className="absolute start-2 top-2 z-10">
            {/* dir="ltr": the leading minus is a neutral character and hops to
                the far side of the number in an RTL context ("40%-"). */}
            <Badge tone="sale" dir="ltr">
              {formatDiscount(discount)}
            </Badge>
          </span>
        ) : null}

        {!inStock ? (
          <span className="absolute inset-x-0 bottom-0 z-10 bg-text/70 py-1 text-center text-xs font-medium text-white">
            {tp("outOfStock")}
          </span>
        ) : null}

        <span className="absolute end-2 top-2 z-10">
          <WishlistButton
            size="sm"
            onToggle={(next) => onWishlistToggle?.(id, next)}
          />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="text-sm font-medium text-text">
          <Link
            href={`/product/${id}`}
            className="line-clamp-2 hover:text-primary-dark transition-colors"
          >
            {name}
          </Link>
        </h3>

        <Price amount={price} compareAt={compareAtPrice} />

        {typeof rating === "number" ? (
          <Rating value={rating} count={reviewCount} />
        ) : null}

        <Button
          variant="cta"
          size="sm"
          block
          disabled={!inStock}
          startIcon={<ShoppingCart className="size-4" aria-hidden />}
          onClick={() => {
            // Optimistic: cart state lands with the cart phase.
            setAdded(true);
            onAddToCart?.(id);
          }}
          className="mt-auto"
        >
          {added ? tp("addedToCart") : t("addToCart")}
        </Button>
      </div>
    </Card>
  );
}
