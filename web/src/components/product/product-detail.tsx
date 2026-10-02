"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Share2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { QuantityInput } from "@/components/ui/quantity-input";
import { Rating } from "@/components/ui/rating";
import { WishlistButton } from "@/components/ui/wishlist-button";
import { useToast } from "@/components/ui/toast";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Product, ProductAvailability } from "@/lib/api";
import { cartStore } from "@/lib/cart-store";
import { cn } from "@/lib/cn";
import {
  availableQtyFor,
  buildAttributeGroups,
  findVariant,
  pricingForVariant,
  productImageUrls,
  selectedVariantFor,
  selectionForVariant,
  stockLevelFor,
} from "@/lib/product";
import { isKnownUnit, minQuantity, quantityRule } from "@/lib/quantity";
import { AvailabilityBadge } from "./availability";
import { ProductGallery } from "./gallery";
import { PriceBlock } from "./price-block";
import { VariantPicker } from "./variant-picker";

const REVIEWS_ANCHOR = "product-reviews";

/**
 * Interactive half of the product page: gallery, variant selection, quantity
 * and the add-to-cart CTA.
 *
 * Every SKU has its own price, availability label and unit, so all three
 * follow the selection. The selected variant is mirrored into `?variant=<id>`
 * so a choice is shareable and survives reload; the server reads the same
 * parameter, so the first paint already shows the right variant.
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
  const tc = useTranslations("cart");
  const tq = useTranslations("quantity");
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
      (v) => stockLevelFor(product, availability, v.id) !== "out_of_stock",
    );
    const fallback = firstInStock ?? variants[0];
    return fallback ? selectionForVariant(fallback) : {};
  }, [variants, initialVariantId, availability, product]);

  const [selection, setSelection] =
    useState<Record<string, string>>(initialSelection);
  const [imageIndex, setImageIndex] = useState(0);
  const [requestedQty, setRequestedQty] = useState(1);
  // The SKU whose typed quantity is currently invalid; a different SKU
  // starts with a fresh, valid field.
  const [invalidFor, setInvalidFor] = useState<string | null>(null);

  const selectedVariant = selectedVariantFor(variants, selection);
  // URLs in the admin's order; the gallery renders strings, not objects.
  const images = productImageUrls(product);

  const maxQty = variants.length
    ? availableQtyFor(availability, selectedVariant?.id)
    : (availability?.available_qty ?? product.available_qty ?? 0);
  const level = variants.length
    ? selectedVariant?.id
      ? stockLevelFor(product, availability, selectedVariant.id)
      : "out_of_stock"
    : stockLevelFor(product, availability);

  const rule = quantityRule(selectedVariant);
  const quantityKey = selectedVariant?.id ?? "product";
  const quantityValid = invalidFor !== quantityKey;
  const pricing = pricingForVariant(product, selectedVariant);
  const name = (locale === "ar" ? product.name_ar : product.name_en) ?? "";
  const brand = product.brand ?? null;
  const unitLabel =
    rule.baseUnit === "piece"
      ? null
      : isKnownUnit(rule.baseUnit)
        ? tq(`units.${rule.baseUnit}`)
        : rule.baseUnit;

  // «أسود» / «40 · أحمر» — what the cart row shows under the product name.
  const variantLabel = selectedVariant
    ? (Object.values(selectionForVariant(selectedVariant)).join(" · ") || null)
    : null;

  // Clamp during render rather than in an effect: storing an out-of-range
  // quantity and correcting it afterwards costs an extra render and briefly
  // shows a number the stock cannot satisfy. Moving from a weight SKU to a
  // piece SKU also drops any fraction.
  const min = minQuantity(rule);
  const wanted = rule.wholeUnitsOnly
    ? Math.max(1, Math.floor(requestedQty))
    : requestedQty;
  const quantity = Math.min(Math.max(min, wanted), Math.max(min, maxQty));

  // Mirror the variant into the URL without adding history entries.
  useEffect(() => {
    if (!selectedVariant?.id || variants.length < 2) return;
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("variant") === selectedVariant.id) return;
    params.set("variant", selectedVariant.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [selectedVariant?.id, variants.length, searchParams, pathname, router]);

  const handleSelect = useCallback((key: string, value: string) => {
    setSelection((current) => ({ ...current, [key]: value }));
  }, []);

  const soldOutFor = useCallback(
    (candidate: Record<string, string>) => {
      const variant = findVariant(variants, candidate);
      return variant?.id
        ? stockLevelFor(product, availability, variant.id) === "out_of_stock"
        : true;
    },
    [variants, availability, product],
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

  const soldOut = level === "out_of_stock" || maxQty <= 0;
  // A selection that matches no variant at all (possible when attributes are
  // combined across groups) is unbuyable but shouldn't read as "sold out".
  const noSuchVariant = variants.length > 0 && !selectedVariant;
  const blocked = soldOut || noSuchVariant || !quantityValid;

  const addToCart = () => {
    if (blocked) return;
    // The product page is the one place that knows the chosen variant, its
    // unit and its real availability, so it stores all three — the cart caps
    // and validates quantity on them.
    cartStore.addItem(
      {
        product_id: product.id ?? "",
        variant_id: selectedVariant?.id ?? null,
        name_ar: product.name_ar ?? "",
        name_en: product.name_en ?? "",
        image_url: images[0] ?? null,
        variant_label: variantLabel,
        // What they pay now, so the line survives the discount window closing.
        unit_price: pricing.price,
        regular_price: pricing.regularPrice,
        available_qty: maxQty,
        base_unit: rule.baseUnit,
        whole_units_only: rule.wholeUnitsOnly,
      },
      quantity,
    );
    showToast(tc("added"));
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
              {/* Without a productId this heart only tracked its own local
                  state, so a shopper could "save" a product and never find
                  it again. It now writes to the shared wishlist store. */}
              <WishlistButton
                productId={product.id ?? undefined}
                className="bg-surface/90 backdrop-blur"
                data-testid="pdp-wishlist"
              />
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
            {brand?.id ? (
              <Link
                href={`/search?brand_id=${encodeURIComponent(brand.id)}`}
                data-testid="pdp-brand"
                className="mb-1 inline-flex text-sm font-semibold text-primary-dark hover:underline"
              >
                {(locale === "ar" ? brand.name_ar : brand.name_en) ??
                  brand.name_en}
              </Link>
            ) : null}
            <h1 className="text-2xl font-bold text-text lg:text-3xl">{name}</h1>
            <a
              href={`#${REVIEWS_ANCHOR}`}
              className="mt-2 inline-flex rounded-md hover:opacity-80"
            >
              <Rating value={product.rating_avg ?? 0} count={reviewCount} />
            </a>
          </div>

          <div className="flex flex-col gap-1">
            <PriceBlock
              price={pricing.price}
              regularPrice={pricing.regularPrice}
              discountPercent={pricing.discountPercent}
            />
            {unitLabel ? (
              <p className="text-xs text-text-muted" data-testid="price-per-unit">
                {tq("perUnit", { unit: unitLabel })}
              </p>
            ) : null}
          </div>

          <AvailabilityBadge level={level} />

          {product.description ? (
            <p className="text-sm leading-7 text-text-muted lg:hidden">
              {product.description}
            </p>
          ) : null}

          <VariantPicker
            groups={groups}
            variants={variants}
            selection={selection}
            soldOutFor={soldOutFor}
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
            <QuantityInput
              // A new SKU brings a new unit rule; start its field afresh.
              key={quantityKey}
              value={quantity}
              onValueChange={setRequestedQty}
              onValidityChange={(valid) =>
                setInvalidFor(valid ? null : quantityKey)
              }
              rule={rule}
              max={Math.max(min, maxQty)}
              disabled={soldOut}
            />
            {!rule.wholeUnitsOnly ? (
              <p className="text-xs text-text-muted" data-testid="quantity-hint">
                {tq("decimalHint", { unit: unitLabel ?? rule.baseUnit })}
              </p>
            ) : null}
          </div>

          {/* Desktop CTA; mobile gets the sticky bar below. */}
          <Button
            variant="cta"
            size="lg"
            block
            disabled={blocked}
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
              price={pricing.price}
              regularPrice={pricing.regularPrice}
              discountPercent={pricing.discountPercent}
              className="[&>div:first-child>span:first-child]:text-xl"
            />
          </div>
          <Button
            variant="cta"
            size="lg"
            disabled={blocked}
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
