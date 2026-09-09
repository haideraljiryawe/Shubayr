"use client";

import { useTranslations } from "next-intl";
import { Bell, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useCartCount } from "@/lib/use-cart";
import { DesktopNav } from "./desktop-nav";
import { LocaleSwitcher } from "./locale-switcher";
import { LocationSelector } from "./location-selector";
import { Logo } from "./logo";
import { SearchForm } from "./search-form";

/**
 * Responsive adaptation of the mockup header. On mobile the search drops to its
 * own row (as in the phone screens); from `md` up everything sits on one line
 * and the desktop nav strip appears underneath.
 *
 * The cart badge reads the real cart store, so every «أضف إلى السلة» anywhere
 * in the storefront updates it. It renders nothing until the store has read
 * localStorage, which keeps the server markup and the hydrated markup identical.
 */
export function Header() {
  const t = useTranslations("header");
  const cartCount = useCartCount();

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex h-16 items-center gap-3 md:gap-6">
          <Logo />

          <LocationSelector className="hidden lg:inline-flex" />

          {/* The wrapper carries the responsive visibility: SearchInput's
              className lands on the <input>, which would hide the field but
              leave its icons floating in the header. */}
          <div className="hidden flex-1 md:block">
            <SearchForm />
          </div>

          <div className="ms-auto flex items-center gap-1">
            <IconButton label={t("notifications")} variant="ghost">
              <Bell className="size-5" aria-hidden />
            </IconButton>

            <span className="relative inline-flex">
              <Link
                href="/cart"
                aria-label={t("cart")}
                title={t("cart")}
                data-testid="header-cart"
                className="inline-flex size-10 items-center justify-center rounded-full text-text transition-colors duration-150 hover:bg-card"
              >
                <ShoppingCart className="size-5" aria-hidden />
              </Link>
              {cartCount > 0 ? (
                <Badge
                  tone="sale"
                  className={cn(
                    "pointer-events-none absolute -top-0.5 -end-0.5",
                    "min-w-5 rounded-full px-1 py-0 text-[10px] leading-5",
                  )}
                >
                  <span data-testid="cart-badge">{cartCount}</span>
                </Badge>
              ) : null}
            </span>

            <LocaleSwitcher className="hidden sm:inline-flex" />
          </div>
        </div>

        {/* Mobile: search on its own row, like the phone mockups. */}
        <div className="pb-3 md:hidden">
          <SearchForm />
        </div>
      </div>

      <DesktopNav />
    </header>
  );
}
