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
 * Flat props let home, catalog and the style guide reuse the same tile.
 * Catalog callers pass the contract's computed discount percentage directly.
 */
export interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  /** Explicit null means no discount; omitted supports the style guide. */
  discountPercent?: number | null;
  rating?: number;
  reviewCount?: number;
  imageUrl?: string | null;
  inStock?: boolean;
  /** Sizes hint for the responsive image; grids differ per section. */
  imageSizes?: string;
  /** Marks the first row of the first grid as LCP-eligible. */
  priority?: boolean;
  /** The compact listing tile keeps rating and price below the product name. */
  variant?: "default" | "catalog";
  onAddToCart?: (id: string) => void;
  onWishlistToggle?: (id: string, next: boolean) => void;
  className?: string;
}

export function ProductCard({
  id,
  name,
  price,
  compareAtPrice,
  discountPercent,
  rating,
  reviewCount,
  imageUrl,
  inStock = true,
  imageSizes = "(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw",
  priority = false,
  variant = "default",
  onAddToCart,
  onWishlistToggle,
  className,
}: ProductCardProps) {
  const t = useTranslations("common");
  const tp = useTranslations("product");
  const [added, setAdded] = useState(false);
  const [failedImage, setFailedImage] = useState<string>();

  const discount =
    discountPercent !== undefined
      ? discountPercent
      : compareAtPrice && compareAtPrice > price
        ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
        : null;
  const hasDiscount = typeof discount === "number" && Number.isFinite(discount);

  return (
    <Card
      padding="none"
      className={cn("group flex min-w-0 flex-col overflow-hidden", className)}
    >
      <div className="relative aspect-square bg-card">
        <Link
          href={`/product/${id}`}
          className="relative block size-full"
          // The visible title below links to the same place, so this large
          // image target is redundant for screen readers.
          tabIndex={-1}
          aria-hidden
        >
          {imageUrl && failedImage !== imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              fill
              sizes={imageSizes}
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              onError={() => setFailedImage(imageUrl)}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            // No artwork yet: a neutral placeholder rather than a broken image.
            <span className="flex size-full items-center justify-center">
              <Package className="size-10 text-border" aria-hidden />
            </span>
          )}
        </Link>

        {hasDiscount ? (
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
            productId={id}
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

        {variant === "default" ? (
          <Price
            amount={price}
            compareAt={hasDiscount ? compareAtPrice : null}
          />
        ) : null}

        {typeof rating === "number" ? (
          <Rating value={rating} count={reviewCount} />
        ) : null}

        {variant === "catalog" ? (
          <Price
            amount={price}
            compareAt={hasDiscount ? compareAtPrice : null}
            className="mt-auto pt-1"
          />
        ) : (
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
        )}
      </div>
    </Card>
  );
}
