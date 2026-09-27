"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Heart, Trash2 } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { ProductCard } from "@/components/ui/product-card";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { api, type Product } from "@/lib/api";
import { cartStore } from "@/lib/cart-store";
import { pricingForVariant, primaryImageUrl } from "@/lib/product";
import { useWishlist } from "@/lib/use-wishlist";
import { wishlistStore } from "@/lib/wishlist-store";
import { AccountEmpty, AccountError, AccountSkeleton } from "./states";

/**
 * The saved products, as a grid of the same tile the storefront uses.
 *
 * Signed in, every row comes from GET /wishlist with its product attached, and
 * the tile renders that product's prices exactly as the server sent them —
 * the server prices the list at read time, so a sale that started since the
 * heart was tapped is already reflected, and nothing here does arithmetic on
 * it. A row without a product (the domain mocked beside a live catalogue) is
 * the only thing resolved through the catalogue instead.
 */
export function WishlistGrid() {
  const t = useTranslations("wishlist");
  const tp = useTranslations("product");
  const locale = useLocale() as Locale;
  const showToast = useToast();
  const { ids, items, status, hydrated } = useWishlist();

  // Catalogue lookups for rows the server did not attach a product to, plus
  // the ids the catalogue could not return. Both only ever move inside a
  // promise continuation, never in the effect body.
  const [resolved, setResolved] = useState<Map<string, Product>>(new Map());
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());

  const productFor = useCallback(
    (id: string) => items[id]?.product ?? resolved.get(id),
    [items, resolved],
  );

  const settled = status === "ready" || status === "guest";

  const missing = useMemo(
    () =>
      settled
        ? ids.filter((id) => !productFor(id) && !unavailable.has(id))
        : [],
    [ids, productFor, settled, unavailable],
  );

  useEffect(() => {
    if (missing.length === 0) return;
    let cancelled = false;

    Promise.all(
      missing.map((id) =>
        api.getProduct(id).then(
          (product) => [id, product] as const,
          // A saved product that has since left the catalogue is dropped from
          // the grid rather than failing the whole page.
          () => [id, null] as const,
        ),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setResolved((current) => {
        const next = new Map(current);
        for (const [id, product] of entries) if (product) next.set(id, product);
        return next;
      });
      setUnavailable((current) => {
        const next = new Set(current);
        for (const [id, product] of entries) if (!product) next.add(id);
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [missing]);

  const remove = useCallback(
    (productId: string) => {
      wishlistStore.remove(productId);
      showToast(t("removed"));
    },
    [showToast, t],
  );

  const moveToCart = useCallback(
    (product: Product) => {
      const pricing = pricingForVariant(product);
      cartStore.addItem({
        product_id: product.id ?? "",
        variant_id: null,
        name_ar: product.name_ar ?? "",
        name_en: product.name_en ?? "",
        image_url: primaryImageUrl(product),
        variant_label: null,
        unit_price: pricing.price,
        regular_price: pricing.regularPrice,
        available_qty: product.available_qty ?? (product.in_stock ? 99 : 0),
      });
      // "Move" means exactly that: it leaves the wishlist once it is in the
      // cart, which is what the heart on the cart row would otherwise undo.
      wishlistStore.remove(product.id ?? "");
      showToast(t("movedToCart"));
    },
    [showToast, t],
  );

  if (status === "error") {
    return (
      <AccountError
        message={t("loadError")}
        onRetry={() => void wishlistStore.refresh()}
      />
    );
  }

  const saved = ids
    .map((id) => productFor(id))
    .filter((product): product is Product => Boolean(product));

  if (!hydrated || !settled || (missing.length > 0 && saved.length === 0)) {
    return <AccountSkeleton rows={3} />;
  }

  if (ids.length === 0) {
    return (
      <AccountEmpty
        icon={<Heart className="size-7" aria-hidden />}
        title={t("empty")}
        body={t("emptyBody")}
        action={
          <Link href="/categories" className={buttonClasses({ variant: "cta" })}>
            {t("browse")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted" data-testid="wishlist-count">
        {t("count", { count: saved.length })}
      </p>

      <ul
        data-testid="wishlist-grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4"
      >
        {saved.map((product) => {
          const id = product.id ?? "";
          const inStock = product.in_stock ?? true;

          return (
            <li key={id} className="flex min-w-0 flex-col gap-2">
              <ProductCard
                id={id}
                name={
                  (locale === "ar" ? product.name_ar : product.name_en) ?? ""
                }
                nameAr={product.name_ar ?? ""}
                nameEn={product.name_en ?? ""}
                availableQty={product.available_qty}
                {...pricingForVariant(product)}
                requiresVariant={(product.variants ?? []).length > 0}
                rating={product.rating_avg}
                imageUrl={primaryImageUrl(product)}
                inStock={inStock}
                variant="catalog"
                className="w-full"
                imageSizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 46vw"
                // The tile's own heart already removes the product; this keeps
                // the grid honest if it is toggled back on from here.
                onWishlistToggle={(_, next) => {
                  if (!next) showToast(t("removed"));
                }}
              />

              <div className="flex items-center gap-2">
                <Button
                  variant="cta"
                  size="sm"
                  block
                  disabled={!inStock}
                  data-testid={`wishlist-move-${id}`}
                  onClick={() => moveToCart(product)}
                >
                  {inStock ? t("moveToCart") : tp("outOfStock")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("remove")}
                  data-testid={`wishlist-remove-${id}`}
                  onClick={() => remove(id)}
                >
                  <Trash2 className="size-4 text-error-dark" aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
