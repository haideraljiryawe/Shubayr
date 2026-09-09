"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Package, ShoppingCart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cartStore } from "@/lib/cart-store";
import { cn } from "@/lib/cn";
import { formatDiscount } from "@/lib/format";
import { useToast } from "./toast";
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
  /**
   * Both names, so a row added from a grid still reads correctly after the
   * shopper switches locale. Defaults to the displayed `name`.
   */
  nameAr?: string;
  nameEn?: string;
  /** Sellable stock; caps what the tile can add. Defaults to the contract max. */
  availableQty?: number;
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
  nameAr,
  nameEn,
  availableQty,
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
  const tc = useTranslations("cart");
  const showToast = useToast();
  const [added, setAdded] = useState(false);
  const [failedImage, setFailedImage] = useState<string>();
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    },
    [],
  );

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
              // A grid tile has no variant picker, so it adds the base product;
              // choosing a colour or size is what the product page is for.
              cartStore.addItem({
                product_id: id,
                variant_id: null,
                name_ar: nameAr ?? name,
                name_en: nameEn ?? name,
                image_url: imageUrl ?? null,
                variant_label: null,
                unit_price: price,
                compare_at_price: hasDiscount ? (compareAtPrice ?? null) : null,
                // The listing endpoints carry no per-variant stock, so an
                // in-stock tile trusts the flag until the product page (which
                // reads /availability) can be more precise.
                available_qty: availableQty ?? (inStock ? 99 : 0),
              });
              showToast(tc("added"));
              setAdded(true);
              if (addedTimer.current) clearTimeout(addedTimer.current);
              // Revert the label so a second add still reads as an action.
              addedTimer.current = setTimeout(() => setAdded(false), 2000);
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
