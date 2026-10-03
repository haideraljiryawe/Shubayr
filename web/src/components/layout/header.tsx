"use client";

import { useTranslations } from "next-intl";
import { LogIn, ShoppingCart } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useCartCount } from "@/lib/use-cart";
import { useWorkRole } from "@/lib/work-account";
import { DesktopNav } from "./desktop-nav";
import { LocaleSwitcher } from "./locale-switcher";
import { LocationSelector } from "./location-selector";
import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { SearchForm } from "./search-form";
import { WorkNav } from "./work-nav";

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
  const tAuth = useTranslations("auth");
  const tAccount = useTranslations("account");
  const cartCount = useCartCount();
  const { user, isAuthenticated } = useAuth();
  // A work account (API 6.0) cannot shop: no search, cart, location or nav.
  const workRole = useWorkRole();

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex h-16 items-center gap-3 md:gap-6">
          <Logo className="min-w-0 shrink" />

          {workRole ? null : (
            <>
              <LocationSelector className="hidden lg:inline-flex" />

              {/* The wrapper carries the responsive visibility: SearchInput's
                  className lands on the <input>, which would hide the field but
                  leave its icons floating in the header. */}
              <div className="hidden flex-1 md:block">
                <SearchForm />
              </div>
            </>
          )}

          <div className="ms-auto flex shrink-0 items-center gap-1">
            {workRole ? <WorkNav role={workRole} /> : null}

            {/* Every signed-in role has an inbox, work accounts included. */}
            {isAuthenticated ? <NotificationBell /> : null}

            {workRole ? null : (
              <>
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
              </>
            )}

            {/* Signed out this is the way in; signed in it is the way to the
                account. Both render the same size, so the row never shifts. */}
            {workRole ? null : isAuthenticated ? (
              <Link
                href="/account"
                aria-label={tAccount("title")}
                title={user?.name || tAccount("title")}
                data-testid="header-account"
                className="inline-flex size-10 items-center justify-center rounded-full transition-colors duration-150 hover:bg-card"
              >
                <Avatar name={user?.name ?? undefined} size="sm" />
              </Link>
            ) : (
              <Link
                href="/login"
                data-testid="header-login"
                // Icon-only on the narrowest phones, where the header row has
                // no room for a label beside the cart and bell — so it is
                // named for screen readers there too.
                aria-label={tAuth("signIn")}
                className="inline-flex size-10 items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-primary-dark transition-colors duration-150 hover:bg-card sm:w-auto sm:px-3"
              >
                <LogIn className="size-4 rtl-flip" aria-hidden />
                <span className="hidden sm:inline">{tAuth("signIn")}</span>
              </Link>
            )}

            <LocaleSwitcher className="hidden sm:inline-flex" />
          </div>
        </div>

        {/* Mobile: search on its own row, like the phone mockups. */}
        {workRole ? null : (
          <div className="pb-3 md:hidden">
            <SearchForm />
          </div>
        )}
      </div>

      {workRole ? null : <DesktopNav />}
    </header>
  );
}
