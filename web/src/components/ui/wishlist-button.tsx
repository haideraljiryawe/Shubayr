"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Heart } from "lucide-react";
import { cn } from "@/lib/cn";
import { useIsWishlisted } from "@/lib/use-wishlist";
import { wishlistStore } from "@/lib/wishlist-store";
import { IconButton } from "./icon-button";

/**
 * Product hearts read the shared wishlist store, so every heart for the same
 * product — grid tile, product page, wishlist page — stays in step, and a
 * signed-in shopper's taps reach the account. A button with no `productId` is
 * a standalone example (the style guide) and keeps its own local state.
 */
export function WishlistButton({
  productId,
  active,
  defaultActive = false,
  onToggle,
  size = "md",
  className,
  "data-testid": testId,
}: {
  productId?: string;
  active?: boolean;
  defaultActive?: boolean;
  onToggle?: (next: boolean) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  "data-testid"?: string;
}) {
  const t = useTranslations("common");
  const [internal, setInternal] = useState(defaultActive);
  const saved = useIsWishlisted(productId);
  const isActive = active ?? (productId ? saved : internal);

  return (
    <IconButton
      label={t(isActive ? "removeFromWishlist" : "addToWishlist")}
      aria-pressed={isActive}
      size={size}
      data-testid={testId}
      onClick={() => {
        const next = !isActive;
        if (active === undefined) {
          if (productId) wishlistStore.toggle(productId);
          else setInternal(next);
        }
        onToggle?.(next);
      }}
      className={cn("shadow-sm", className)}
    >
      <Heart
        className={cn(
          "size-4.5 transition-colors",
          isActive ? "fill-error text-error" : "text-text-muted",
        )}
        aria-hidden
      />
    </IconButton>
  );
}
