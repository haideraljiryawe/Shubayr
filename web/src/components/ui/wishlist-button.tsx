"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Heart } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";

/**
 * The heart that sits on every product tile. Uncontrolled by default so the
 * style guide and card grids can drop it in; pass `active`/`onToggle` to bind
 * it to real wishlist state later.
 */
export function WishlistButton({
  active,
  defaultActive = false,
  onToggle,
  size = "md",
  className,
}: {
  active?: boolean;
  defaultActive?: boolean;
  onToggle?: (next: boolean) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const t = useTranslations("common");
  const [internal, setInternal] = useState(defaultActive);
  const isActive = active ?? internal;

  return (
    <IconButton
      label={t(isActive ? "removeFromWishlist" : "addToWishlist")}
      aria-pressed={isActive}
      size={size}
      onClick={() => {
        const next = !isActive;
        if (active === undefined) setInternal(next);
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
