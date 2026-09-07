"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Share2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { Rating } from "@/components/ui/rating";
import { WishlistButton } from "@/components/ui/wishlist-button";
import { useToast } from "@/components/ui/toast";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Product, ProductAvailability } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  availableQtyFor,
  buildAttributeGroups,
  compareAtForVariant,
  findVariant,
  priceForVariant,
  selectionForVariant,
} from "@/lib/product";
import { AvailabilityBadge } from "./availability";
import { ProductGallery } from "./gallery";
import { PriceBlock } from "./price-block";
import { VariantPicker } from "./variant-picker";

const REVIEWS_ANCHOR = "product-reviews";

/**
 * Interactive half of the product page: gallery, variant selection, quantity
 * and the add-to-cart CTA.
 *
 * The selected variant is mirrored into `?variant=<id>` so a chosen colour is
 * shareable and survives reload. The server reads the same parameter, so the
 * first paint already shows the right variant — no flash of the default.
 */
export function ProductDetail({
  product,
  availability,
  reviewCount,
  initialVariantId,
}: {
  product: Product;
  availability: ProductAvailability | null;
  reviewCount: number;
  initialVariantId?: string;
}) {
  const t = useTranslations("product");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showToast = useToast();

  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const groups = useMemo(() => buildAttributeGroups(variants), [variants]);

  const initialSelection = useMemo(() => {
    const fromUrl = variants.find((v) => v.id === initialVariantId);
    if (fromUrl) return selectionForVariant(fromUrl);
    // Default to the first variant that is actually purchasable.
    const firstInStock = variants.find(
      (v) => availableQtyFor(availability, v.id) > 0,
    );
    const fallback = firstInStock ?? variants[0];
    return fallback ? selectionForVariant(fallback) : {};
  }, [variants, initialVariantId, availability]);

  const [selection, setSelection] =
    useState<Record<string, string>>(initialSelection);
  const [imageIndex, setImageIndex] = useState(0);
  const [requestedQty, setRequestedQty] = useState(1);

  const selectedVariant = findVariant(variants, selection);
  const images = product.images ?? [];

  const maxQty = variants.length
    ? availableQtyFor(availability, selectedVariant?.id)
    : (availability?.available_qty ?? product.available_qty ?? 0);

  const price = priceForVariant(product, selectedVariant);
  const compareAt = compareAtForVariant(product, selectedVariant);
  const name = (locale === "ar" ? product.name_ar : product.name_en) ?? "";

  // Clamp during render rather than in an effect: storing an out-of-range
  // quantity and correcting it afterwards costs an extra render and briefly
  // shows a number the stock cannot satisfy.
  const quantity = Math.min(Math.max(1, requestedQty), Math.max(1, maxQty));

  // Mirror the variant into the URL without adding history entries.
  useEffect(() => {
    if (!selectedVariant?.id) return;
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("variant") === selectedVariant.id) return;
    params.set("variant", selectedVariant.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [selectedVariant?.id, searchParams, pathname, router]);

  const handleSelect = useCallback((key: string, value: string) => {
    setSelection((current) => ({ ...current, [key]: value }));
  }, []);

  const qtyForSelection = useCallback(
    (candidate: Record<string, string>) => {
      const variant = findVariant(variants, candidate);
      return variant ? availableQtyFor(availability, variant.id) : 0;
    },
    [variants, availability],
  );

  const handleShare = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast(t("shareCopied"));
    } catch {
      // The user dismissed the share sheet, or the clipboard was blocked.
      // Neither is an error worth surfacing.
    }
  }, [name, showToast, t]);

  const soldOut = maxQty <= 0;
  // A selection that matches no variant at all (possible when attributes are
  // combined across groups) is unbuyable but shouldn't read as "sold out".
  const noSuchVariant = variants.length > 0 && !selectedVariant;

  const addToCart = () => {
    // Phase 5 replaces this with real cart state; the toast is the seam.
    showToast(t("addedToast"));
  };

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* ------------------------------------------------------ gallery */}
        <div className="relative">
          <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
            <IconButton
              label={t("back")}
              onClick={() => router.back()}
              className="bg-surface/90 backdrop-blur"
            >
              <ArrowLeft className="size-5 rtl-flip" aria-hidden />
            </IconButton>

            <div className="flex flex-col gap-2">
              <IconButton
                label={t("share")}
                onClick={handleShare}
                className="bg-surface/90 backdrop-blur"
              >
                <Share2 className="size-5" aria-hidden />
              </IconButton>
              <WishlistButton className="bg-surface/90 backdrop-blur" />
            </div>
          </div>

          <ProductGallery
            images={images}
            alt={name}
            activeIndex={imageIndex}
            onActiveIndexChange={setImageIndex}
          />
        </div>

        {/* --------------------------------------------------- info panel */}
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold text-text lg:text-3xl">{name}</h1>
            <a
              href={`#${REVIEWS_ANCHOR}`}
              className="mt-2 inline-flex rounded-md hover:opacity-80"
            >
              <Rating value={product.rating_avg ?? 0} count={reviewCount} />
            </a>
          </div>

          <PriceBlock
            price={price}
            compareAt={compareAt}
            pointsPrice={product.points_price}
            isNegotiable={product.is_negotiable}
          />

          <AvailabilityBadge qty={maxQty} />

          {product.description ? (
            <p className="text-sm leading-7 text-text-muted lg:hidden">
              {product.description}
            </p>
          ) : null}

          <VariantPicker
            groups={groups}
            variants={variants}
            selection={selection}
            availableQtyFor={qtyForSelection}
            onSelect={handleSelect}
          />

          {noSuchVariant ? (
            <p role="status" className="text-sm font-medium text-error-dark">
              {t("variantUnavailable")}
            </p>
          ) : null}

          <div className="flex flex-col items-start gap-2">
            <span className="text-sm font-medium text-text">
              {t("quantity")}
            </span>
            <QuantityStepper
              value={quantity}
              onValueChange={setRequestedQty}
              min={1}
              max={Math.max(1, maxQty)}
              disabled={soldOut}
            />
          </div>

          {/* Desktop CTA; mobile gets the sticky bar below. */}
          <Button
            variant="cta"
            size="lg"
            block
            disabled={soldOut || noSuchVariant}
            onClick={addToCart}
            data-testid="pdp-add-to-cart"
            startIcon={<ShoppingCart className="size-5" aria-hidden />}
            className="hidden lg:inline-flex"
          >
            {soldOut ? t("outOfStockLabel") : t("addToCart")}
          </Button>
        </div>
      </div>

      {/* ------------------------------------------ sticky mobile CTA bar */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface/95 p-3",
          "backdrop-blur lg:hidden",
          "pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0">
            <PriceBlock
              price={price}
              compareAt={compareAt}
              className="[&>div:first-child>span:first-child]:text-xl"
            />
          </div>
          <Button
            variant="cta"
            size="lg"
            disabled={soldOut || noSuchVariant}
            onClick={addToCart}
            data-testid="pdp-add-to-cart"
            startIcon={<ShoppingCart className="size-5" aria-hidden />}
            className="ms-auto flex-1"
          >
            {soldOut ? t("outOfStockLabel") : t("addToCart")}
          </Button>
        </div>
      </div>
    </>
  );
}

export { REVIEWS_ANCHOR };
